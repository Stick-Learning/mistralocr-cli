// --- OCR API-level types ---

export interface OCROptions {
  model: string;
  pages?: number[]; // 0-indexed (already converted from CLI input)
  includeImageBase64: boolean;
  bboxAnnotationFormat?: Record<string, unknown>;
  documentAnnotationFormat?: Record<string, unknown>;
}

// --- Domain types (our internal representation) ---

export interface ImageResult {
  id: string; // the reference key used in markdown
  imageBase64: string; // pure base64, no data: prefix
  mimeType: string; // 'image/png', 'image/jpeg', etc.
}

export interface PageResult {
  index: number; // 0-indexed
  markdown: string; // raw markdown from API, images as ![id](id)
  images: ImageResult[];
}

// --- Client types ---

export interface ClientConfig {
  chunkSize: number;    // pages per API call; 0 = no chunking
  maxRetries: number;   // per-call retry limit
  baseDelayMs: number;  // initial backoff delay in ms
}

export interface ProcessResult {
  pages: PageResult[];
  truncated: boolean;           // API response was cut short
  truncatedAtChunk?: number;    // 1-indexed chunk where truncation was detected
  chunksTotal: number;          // 1 if no chunking needed
  chunksProcessed: number;      // may be < chunksTotal if truncated
}

// --- Cache types ---

export interface CacheEntry {
  schemaVersion: '1';
  createdAt: string; // ISO 8601
  model: string;
  fileHash: string;
  optionsHash: string; // hash of non-page options
  pages: PageResult[]; // all pages that were returned
}

// --- CLI types ---

export interface CLIFlags {
  apiKey?: string;
  output?: string;
  model: string;
  pages?: string;
  includeImages: boolean;
  extractImages?: string;
  extractTables?: string;
  bboxAnnotation?: string;
  documentAnnotation?: string;
  cache: boolean; // commander uses --no-cache to set this to false
  clearCache: boolean;
  cacheDir: string;
  chunkSize: number;  // pages per API call; 0 = disable chunking
  maxRetries: number; // retry limit per API call
  retryDelay: number; // initial backoff delay in ms
  verbose: boolean;
}

// --- Markdown types ---

export type ImageStrategy = 'embed' | 'file-reference' | 'strip';

export interface MarkdownOptions {
  imageStrategy: ImageStrategy;
  imageDir?: string; // used when strategy = 'file-reference'
  imageDirRelative?: string; // relative path for markdown links
  addPageSeparators: boolean;
}

export interface ExtractedTable {
  markdown: string;
  pageIndex: number;
  tableIndex: number; // 0-indexed within the page
}

// --- Export types ---

export interface ExportResult {
  writtenPaths: string[];
  count: number;
}
