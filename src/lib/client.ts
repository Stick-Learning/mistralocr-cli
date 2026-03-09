import { Mistral } from '@mistralai/mistralai';
import { openAsBlob } from 'node:fs';
import path from 'node:path';
import type { OCROptions, PageResult, ImageResult, ClientConfig, ProcessResult } from '../types/index.js';
import { mapApiError, MistralOCRError, ErrorCode } from '../utils/errors.js';
import { getMimeType, getDocumentType } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { withRetry } from './retry.js';
import { getPdfPageCount } from './pdf-info.js';

export class MistralOCRClient {
  private readonly mistral: Mistral;
  private readonly config: ClientConfig;

  constructor(apiKey: string, config: ClientConfig) {
    this.mistral = new Mistral({ apiKey });
    this.config = config;
  }

  async processLocalFile(filePath: string, options: OCROptions): Promise<ProcessResult> {
    let fileId: string | undefined;

    try {
      const uploaded = await this.uploadFileWithRetry(filePath);
      fileId = uploaded.fileId;
      logger.debug(`Uploaded file: ${fileId}`);

      return await this.processWithChunking(uploaded.signedUrl, filePath, options);
    } catch (err) {
      throw err instanceof MistralOCRError ? err : mapApiError(err);
    } finally {
      if (fileId) {
        await this.cleanupFile(fileId).catch((err: unknown) => {
          logger.debug(`Failed to delete uploaded file ${fileId}: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    }
  }

  // ── Chunking orchestration ──────────────────────────────────────────────────

  private async processWithChunking(
    signedUrl: string,
    filePath: string,
    options: OCROptions,
  ): Promise<ProcessResult> {
    const isPdf = getDocumentType(filePath) === 'document_url';

    // Only auto-chunk if: chunking is enabled, no explicit page range, and file is a PDF
    let totalPages: number | null = null;
    if (this.config.chunkSize > 0 && !options.pages && isPdf) {
      totalPages = await getPdfPageCount(filePath);
    }

    const needsChunking = totalPages !== null && totalPages > this.config.chunkSize;

    if (!needsChunking) {
      const pages = await this.callOCRWithRetry(signedUrl, filePath, options);
      const truncated = this.detectTruncation(pages, options.pages);
      return {
        pages,
        truncated,
        ...(truncated && { truncatedAtChunk: 1 }),
        chunksTotal: 1,
        chunksProcessed: 1,
      };
    }

    return this.processInChunks(signedUrl, filePath, options, totalPages!);
  }

  private async processInChunks(
    signedUrl: string,
    filePath: string,
    options: OCROptions,
    totalPages: number,
  ): Promise<ProcessResult> {
    const { chunkSize } = this.config;
    const totalChunks = Math.ceil(totalPages / chunkSize);
    const allPages: PageResult[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, totalPages - 1);
      const chunkPageIndices = Array.from({ length: end - start + 1 }, (_, k) => start + k);

      logger.debug(`Chunk ${i + 1}/${totalChunks}: pages ${start + 1}–${end + 1}`);

      try {
        const pages = await this.callOCRWithRetry(signedUrl, filePath, {
          ...options,
          pages: chunkPageIndices,
        });
        allPages.push(...pages);

        // Detect mid-chunk truncation
        if (this.detectTruncation(pages, chunkPageIndices)) {
          logger.debug(`Truncation detected in chunk ${i + 1}`);
          return {
            pages: allPages,
            truncated: true,
            truncatedAtChunk: i + 1,
            chunksTotal: totalChunks,
            chunksProcessed: i + 1,
          };
        }
      } catch (err) {
        if (isTokenLimitError(err)) {
          return {
            pages: allPages,
            truncated: true,
            truncatedAtChunk: i + 1,
            chunksTotal: totalChunks,
            chunksProcessed: i + 1,
          };
        }
        throw err;
      }
    }

    return {
      pages: allPages,
      truncated: false,
      chunksTotal: totalChunks,
      chunksProcessed: totalChunks,
    };
  }

  // ── Retry-wrapped calls ─────────────────────────────────────────────────────

  private async uploadFileWithRetry(filePath: string): Promise<{ fileId: string; signedUrl: string }> {
    return withRetry(
      () => this.uploadFile(filePath),
      { maxRetries: this.config.maxRetries, baseDelayMs: this.config.baseDelayMs, maxDelayMs: 16000 },
      (attempt, delayMs) => logger.debug(`Upload retry ${attempt} in ${delayMs}ms...`),
    );
  }

  private async callOCRWithRetry(
    signedUrl: string,
    filePath: string,
    options: OCROptions,
  ): Promise<PageResult[]> {
    return withRetry(
      () => this.callOCR(signedUrl, filePath, options),
      { maxRetries: this.config.maxRetries, baseDelayMs: this.config.baseDelayMs, maxDelayMs: 16000 },
      (attempt, delayMs) => logger.debug(`OCR retry ${attempt} in ${delayMs}ms...`),
    );
  }

  // ── Core API calls ──────────────────────────────────────────────────────────

  private async uploadFile(filePath: string): Promise<{ fileId: string; signedUrl: string }> {
    const fileName = path.basename(filePath);
    const mimeType = getMimeType(filePath);
    const blob = await openAsBlob(filePath, { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    try {
      const uploaded = await this.mistral.files.upload({ file, purpose: 'ocr' });
      const signedUrlResult = await this.mistral.files.getSignedUrl({ fileId: uploaded.id });
      return { fileId: uploaded.id, signedUrl: signedUrlResult.url };
    } catch (err) {
      throw new MistralOCRError(
        `Failed to upload file: ${err instanceof Error ? err.message : String(err)}`,
        ErrorCode.UPLOAD_FAILED,
        err,
        3,
      );
    }
  }

  private async callOCR(
    signedUrl: string,
    filePath: string,
    options: OCROptions,
  ): Promise<PageResult[]> {
    const docType = getDocumentType(filePath);

    try {
      const result = await this.mistral.ocr.process({
        model: options.model,
        document:
          docType === 'document_url'
            ? { type: 'document_url', documentUrl: signedUrl }
            : { type: 'image_url', imageUrl: signedUrl },
        ...(options.pages !== undefined && { pages: options.pages }),
        ...(options.includeImageBase64 && { includeImageBase64: true }),
        ...(options.bboxAnnotationFormat !== undefined && {
          bboxAnnotationFormat: options.bboxAnnotationFormat,
        }),
        ...(options.documentAnnotationFormat !== undefined && {
          documentAnnotationFormat: options.documentAnnotationFormat,
        }),
      });

      return this.mapResponse(result);
    } catch (err) {
      throw mapApiError(err);
    }
  }

  private async cleanupFile(fileId: string): Promise<void> {
    await this.mistral.files.delete({ fileId });
  }

  // ── Response mapping ────────────────────────────────────────────────────────

  private mapResponse(apiResponse: unknown): PageResult[] {
    const response = apiResponse as {
      pages?: Array<{
        index?: number;
        markdown?: string;
        images?: Array<{
          id?: string;
          imageBase64?: string;
          image_base64?: string;
        }>;
      }>;
    };

    if (!response.pages || !Array.isArray(response.pages)) {
      return [];
    }

    return response.pages.map((page, idx) => {
      const images: ImageResult[] = (page.images ?? [])
        .filter((img) => img.id && (img.imageBase64 ?? img.image_base64))
        .map((img) => {
          const base64Raw = (img.imageBase64 ?? img.image_base64) as string;
          const match = base64Raw.match(/^data:([^;]+);base64,(.+)$/s);
          if (match) {
            return { id: img.id as string, imageBase64: match[2] as string, mimeType: match[1] as string };
          }
          return { id: img.id as string, imageBase64: base64Raw, mimeType: 'image/png' };
        });

      return {
        index: page.index ?? idx,
        markdown: page.markdown ?? '',
        images,
      };
    });
  }

  private detectTruncation(pages: PageResult[], requestedPages?: number[]): boolean {
    if (requestedPages !== undefined && pages.length < requestedPages.length) return true;
    return false;
  }
}

function isTokenLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 429) return false; // rate limit, not token limit
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('token') && (msg.includes('limit') || msg.includes('exceed'));
}
