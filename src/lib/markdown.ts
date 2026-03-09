import type { PageResult, ImageResult, MarkdownOptions, ExtractedTable } from '../types/index.js';

/**
 * Combine multiple pages into a single markdown string.
 * Resolves image references per strategy.
 */
export function combinePages(pages: PageResult[], options: MarkdownOptions): string {
  if (pages.length === 0) return '';

  const parts: string[] = [];

  for (const page of pages) {
    let md = page.markdown;

    // Resolve image references based on strategy
    md = resolveImageReferences(md, page.images, options);

    if (options.addPageSeparators && pages.length > 1) {
      const humanPage = page.index + 1;
      parts.push(`<!-- Page ${humanPage} -->\n\n${md}`);
    } else {
      parts.push(md);
    }
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Resolve all ![id](id) occurrences in a markdown string.
 * - 'embed': replace with data URI
 * - 'file-reference': replace with relative file path
 * - 'strip': remove the image tag entirely
 */
export function resolveImageReferences(
  markdown: string,
  images: ImageResult[],
  options: MarkdownOptions,
): string {
  const imageMap = new Map(images.map((img) => [img.id, img]));

  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt: string, ref: string) => {
    const image = imageMap.get(ref);
    if (!image) return match; // not one of our images, keep as-is

    switch (options.imageStrategy) {
      case 'embed': {
        return `![${alt}](data:${image.mimeType};base64,${image.imageBase64})`;
      }
      case 'file-reference': {
        const ext = extFromMime(image.mimeType);
        const relDir = options.imageDirRelative ?? './images';
        return `![${alt}](${relDir}/${image.id}${ext})`;
      }
      case 'strip': {
        return '';
      }
    }
  });
}

/**
 * Extract all markdown tables from pages.
 * A table is a contiguous block of lines starting with '|'.
 */
export function extractTables(pages: PageResult[]): ExtractedTable[] {
  const tables: ExtractedTable[] = [];

  for (const page of pages) {
    const lines = page.markdown.split('\n');
    let tableLines: string[] = [];
    let tableIndex = 0;

    for (let i = 0; i <= lines.length; i++) {
      const line = lines[i] ?? '';
      const isTableLine = /^\s*\|/.test(line);

      if (isTableLine) {
        tableLines.push(line);
      } else if (tableLines.length >= 2) {
        // Found end of table block — emit if it looks like a real table (has separator row)
        const hasHeaderSeparator = tableLines.some((l) => /^\s*\|[-| :]+\|/.test(l));
        if (hasHeaderSeparator) {
          tables.push({
            markdown: tableLines.join('\n'),
            pageIndex: page.index,
            tableIndex: tableIndex++,
          });
        }
        tableLines = [];
      } else {
        tableLines = [];
      }
    }
  }

  return tables;
}

// Internal helper — duplicated here to avoid circular import with fs.ts
function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/tiff': '.tiff',
    'image/bmp': '.bmp',
  };
  return map[mimeType] ?? '.bin';
}
