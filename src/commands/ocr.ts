import fs from 'node:fs/promises';
import path from 'node:path';
import type { CLIFlags, ClientConfig, OCROptions, PageResult, ProcessResult } from '../types/index.js';
import { MistralOCRError, ErrorCode } from '../utils/errors.js';
import { logger, createSpinner } from '../utils/logger.js';
import {
  computeFileHash,
  computeObjectHash,
  isSupported,
  conversionTarget,
} from '../utils/fs.js';
import { parsePageRange } from '../lib/page-range.js';
import { convert } from '../lib/converter.js';
import { MistralOCRClient } from '../lib/client.js';
import { CacheManager } from '../lib/cache.js';
import { combinePages } from '../lib/markdown.js';
import { exportImages, exportTables } from '../lib/exporter.js';

export async function runOCRCommand(filePath: string, flags: CLIFlags): Promise<void> {
  // ── 1. Setup ──────────────────────────────────────────────────────────────
  logger.setVerbose(flags.verbose);

  // ── 2. Handle --clear-cache (non-OCR path) ────────────────────────────────
  if (flags.clearCache) {
    const cache = new CacheManager(flags.cacheDir);
    const { count } = await cache.clear();
    logger.success(`Cleared ${count} cache entr${count === 1 ? 'y' : 'ies'} from ${flags.cacheDir}`);
    return;
  }

  // ── 3. File existence check ───────────────────────────────────────────────
  const resolvedPath = path.resolve(filePath);

  try {
    await fs.access(resolvedPath);
  } catch {
    throw new MistralOCRError(
      `File not found: ${filePath}`,
      ErrorCode.FILE_NOT_FOUND,
      undefined,
      4,
    );
  }

  // ── 3b. Auto-convert legacy formats ──────────────────────────────────────
  // ocrPath is the actual file sent to Mistral — may be a converted temp file
  let conversionCleanup: (() => Promise<void>) | undefined;
  let ocrPath = resolvedPath;

  const targetExt = conversionTarget(resolvedPath);
  if (targetExt !== null) {
    const srcExt = path.extname(resolvedPath);
    const spinner = createSpinner(`Converting ${srcExt} → ${targetExt} via LibreOffice...`).start();
    try {
      const result = await convert(resolvedPath, targetExt);
      ocrPath = result.outputPath;
      conversionCleanup = result.cleanup;
      spinner.succeed(`Converted to ${path.basename(ocrPath)}`);
    } catch (err) {
      spinner.fail('Conversion failed');
      throw err;
    }
  } else if (!isSupported(resolvedPath)) {
    const ext = path.extname(resolvedPath).toLowerCase() || '(none)';
    throw new MistralOCRError(
      `Unsupported file format: ${ext}. ` +
      `Supported documents: PDF, DOCX, PPTX, EPUB, RTF, ODT, BIB, FB2, IPYNB, TEX, OPML, XML, Troff. ` +
      `Supported images: PNG, JPG, AVIF, TIFF, GIF, HEIC, BMP, WEBP. ` +
      `Legacy Office formats (.doc, .ppt, .xls) are auto-converted if LibreOffice is installed.`,
      ErrorCode.UNSUPPORTED_FORMAT,
      undefined,
      4,
    );
  }

  // ── 4. API key ────────────────────────────────────────────────────────────
  const apiKey = flags.apiKey ?? process.env['MISTRAL_API_KEY'];
  if (!apiKey) {
    throw new MistralOCRError(
      'No API key provided. Set MISTRAL_API_KEY environment variable or use --api-key.',
      ErrorCode.INVALID_API_KEY,
      undefined,
      3,
    );
  }

  // ── 5. Parse options ──────────────────────────────────────────────────────
  const requestedPages = flags.pages ? parsePageRange(flags.pages) : undefined;

  const bboxAnnotationFormat = flags.bboxAnnotation
    ? parseJsonFlag(flags.bboxAnnotation, '--bbox-annotation')
    : undefined;

  const documentAnnotationFormat = flags.documentAnnotation
    ? parseJsonFlag(flags.documentAnnotation, '--document-annotation')
    : undefined;

  const ocrOptions: OCROptions = {
    model: flags.model,
    includeImageBase64: !!(flags.includeImages || flags.extractImages),
    ...(requestedPages !== undefined && { pages: requestedPages }),
    ...(bboxAnnotationFormat !== undefined && { bboxAnnotationFormat }),
    ...(documentAnnotationFormat !== undefined && { documentAnnotationFormat }),
  };

  // ── 6–10. Cache, API call, output (try/finally guarantees temp file cleanup)
  const clientConfig: ClientConfig = {
    chunkSize: isNaN(flags.chunkSize) ? 50 : flags.chunkSize,
    maxRetries: isNaN(flags.maxRetries) ? 3 : flags.maxRetries,
    baseDelayMs: isNaN(flags.retryDelay) ? 1000 : flags.retryDelay,
  };

  try {
    await runOCRFlow(resolvedPath, ocrPath, apiKey, flags, ocrOptions, requestedPages, clientConfig);
  } finally {
    if (conversionCleanup) {
      await conversionCleanup().catch((e: unknown) =>
        logger.debug(`Temp file cleanup failed: ${e}`),
      );
    }
  }
}

// ── Core OCR flow (separated so cleanup finally always runs) ─────────────────

async function runOCRFlow(
  resolvedPath: string,        // original file — used for cache key and output baseName
  ocrPath: string,             // file actually sent to Mistral (may be a converted temp)
  apiKey: string,
  flags: CLIFlags,
  ocrOptions: OCROptions,
  requestedPages: number[] | undefined,
  clientConfig: ClientConfig,
): Promise<void> {
  // ── 6. Cache lookup ───────────────────────────────────────────────────────
  let pages: PageResult[];
  let fromCache = false;

  const cache = new CacheManager(flags.cacheDir);

  if (flags.cache) {
    const hashSpinner = createSpinner('Computing file hash...').start();
    // Hash the original source file, not the temp converted copy
    const fileHash = await computeFileHash(resolvedPath);
    const optionsHash = computeObjectHash({
      model: ocrOptions.model,
      includeImageBase64: ocrOptions.includeImageBase64,
      bboxAnnotationFormat: ocrOptions.bboxAnnotationFormat ?? null,
      documentAnnotationFormat: ocrOptions.documentAnnotationFormat ?? null,
    });
    hashSpinner.stop();

    logger.debug(`File hash:    ${fileHash.slice(0, 16)}...`);
    logger.debug(`Options hash: ${optionsHash.slice(0, 16)}...`);

    const cached = await cache.get(fileHash, optionsHash, requestedPages);
    if (cached !== null) {
      pages = cached;
      fromCache = true;
      logger.success('Cache hit — skipping API call');
    } else {
      logger.debug('Cache miss — calling API');
      const result = await callAPI(ocrPath, ocrOptions, apiKey, clientConfig);
      pages = result.pages;
      logProcessResult(result);
      await cache.set(fileHash, optionsHash, ocrOptions.model, pages).catch((err: unknown) => {
        logger.warn(`Failed to write cache: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  } else {
    logger.debug('Cache bypassed (--no-cache)');
    const result = await callAPI(ocrPath, ocrOptions, apiKey, clientConfig);
    pages = result.pages;
    logProcessResult(result);
  }

  // ── 7. Build markdown output ──────────────────────────────────────────────
  const baseName = path.basename(resolvedPath, path.extname(resolvedPath));
  const hasExternalImages = !!flags.extractImages;

  const outputDir = flags.output ? path.dirname(path.resolve(flags.output)) : process.cwd();
  const imageDirRelative = flags.extractImages
    ? path.relative(outputDir, path.resolve(flags.extractImages))
    : undefined;

  const markdownOutput = combinePages(pages, {
    imageStrategy: flags.includeImages ? 'embed' : hasExternalImages ? 'file-reference' : 'strip',
    imageDirRelative,
    addPageSeparators: pages.length > 1,
  });

  // ── 8. Export images ──────────────────────────────────────────────────────
  if (flags.extractImages) {
    const spinner = createSpinner('Extracting images...').start();
    const result = await exportImages(pages, path.resolve(flags.extractImages), baseName);
    spinner.succeed(`Saved ${result.count} image${result.count === 1 ? '' : 's'} to ${flags.extractImages}`);
  }

  // ── 9. Export tables ──────────────────────────────────────────────────────
  if (flags.extractTables) {
    const spinner = createSpinner('Extracting tables...').start();
    const result = await exportTables(pages, path.resolve(flags.extractTables), baseName);
    spinner.succeed(`Saved ${result.count} table${result.count === 1 ? '' : 's'} to ${flags.extractTables}`);
  }

  // ── 10. Write output ──────────────────────────────────────────────────────
  if (flags.output) {
    await fs.writeFile(path.resolve(flags.output), markdownOutput, 'utf8');
    logger.success(`Written to ${flags.output}`);
  } else {
    process.stdout.write(markdownOutput);
    if (!markdownOutput.endsWith('\n')) process.stdout.write('\n');
  }

  if (fromCache) {
    logger.dim('  (result served from cache)');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callAPI(
  filePath: string,
  options: OCROptions,
  apiKey: string,
  config: ClientConfig,
): Promise<ProcessResult> {
  const client = new MistralOCRClient(apiKey, config);
  const spinner = createSpinner('Uploading file...').start();

  try {
    spinner.text = 'Running OCR...';
    const result = await client.processLocalFile(filePath, options);
    const n = result.pages.length;
    const chunkInfo = result.chunksTotal > 1
      ? ` (${result.chunksProcessed}/${result.chunksTotal} chunks)`
      : '';
    spinner.succeed(`OCR complete — ${n} page${n === 1 ? '' : 's'} processed${chunkInfo}`);
    return result;
  } catch (err) {
    spinner.fail('OCR failed');
    throw err;
  }
}

function logProcessResult(result: ProcessResult): void {
  if (result.truncated) {
    logger.warn(
      `Output truncated at chunk ${result.truncatedAtChunk ?? '?'}/${result.chunksTotal} — ` +
      `${result.pages.length} page${result.pages.length === 1 ? '' : 's'} returned. ` +
      `Use --chunk-size to reduce batch size or --pages to target a range.`,
    );
  }
}

function parseJsonFlag(value: string, flagName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Must be a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new MistralOCRError(
      `Invalid JSON for ${flagName}: ${err instanceof Error ? err.message : String(err)}`,
      ErrorCode.INVALID_JSON_OPTION,
      err,
      2,
    );
  }
}
