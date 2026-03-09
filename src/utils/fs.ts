import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Formats confirmed supported by the Mistral OCR API (derived from live API error response)
const SUPPORTED_EXTENSIONS = new Set([
  // Documents
  '.pdf',
  '.docx',                    // Word (new XML format only — .doc not supported)
  '.pptx',                    // PowerPoint (new XML format only — .ppt not supported)
  '.epub',
  '.rtf',
  '.odt',
  '.bib',                     // BibTeX / BibLaTeX
  '.fb2',                     // FictionBook
  '.ipynb',                   // Jupyter Notebook
  '.tex',                     // LaTeX
  '.opml',
  '.1', '.man',               // Troff
  '.xml',                     // DocBook XML / JATS XML
  // Images (image/.* accepted)
  '.png',
  '.jpg', '.jpeg',
  '.avif',
  '.tiff', '.tif',
  '.gif',
  '.heic', '.heif',
  '.bmp',
  '.webp',
]);

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg', '.jpeg',
  '.avif',
  '.tiff', '.tif',
  '.gif',
  '.heic', '.heif',
  '.bmp',
  '.webp',
]);

const MIME_TYPES: Record<string, string> = {
  // Documents — exact MIME types the API accepts
  '.pdf':   'application/pdf',
  '.docx':  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx':  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.epub':  'application/epub+zip',
  '.rtf':   'application/rtf',
  '.odt':   'application/vnd.oasis.opendocument.text',
  '.bib':   'application/x-bibtex',
  '.fb2':   'application/x-fictionbook+xml',
  '.ipynb': 'application/x-ipynb+json',
  '.tex':   'application/x-latex',
  '.opml':  'application/x-opml+xml',
  '.1':     'text/troff',
  '.man':   'text/troff',
  '.xml':   'application/docbook+xml',
  // Images
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.avif':  'image/avif',
  '.tiff':  'image/tiff',
  '.tif':   'image/tiff',
  '.gif':   'image/gif',
  '.heic':  'image/heic',
  '.heif':  'image/heif',
  '.bmp':   'image/bmp',
  '.webp':  'image/webp',
};

const MIME_TO_EXT: Record<string, string> = {
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/avif': '.avif',
  'image/tiff': '.tiff',
  'image/gif':  '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/bmp':  '.bmp',
  'image/webp': '.webp',
};

export function isSupported(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function getDocumentType(filePath: string): 'document_url' | 'image_url' {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) ? 'image_url' : 'document_url';
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export function extFromMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? '.bin';
}

// Legacy formats that can be auto-converted to a supported format via LibreOffice
const CONVERTIBLE_EXTENSIONS: Record<string, string> = {
  '.doc':  '.docx',
  '.ppt':  '.pptx',
  '.xls':  '.pdf',
  '.xlsx': '.pdf',
  '.csv':  '.pdf',
};

export function isConvertible(filePath: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    CONVERTIBLE_EXTENSIONS,
    path.extname(filePath).toLowerCase(),
  );
}

export function conversionTarget(filePath: string): string | null {
  return CONVERTIBLE_EXTENSIONS[path.extname(filePath).toLowerCase()] ?? null;
}

export function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk as Buffer))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

export function computeObjectHash(obj: unknown): string {
  const sorted = stableStringify(obj);
  return createHash('sha256').update(sorted).digest('hex');
}

function stableStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + stableStringify((val as Record<string, unknown>)[k]));
  return '{' + pairs.join(',') + '}';
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileSizeBytes(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  return stat.size;
}
