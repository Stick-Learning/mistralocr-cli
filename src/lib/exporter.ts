import fs from 'node:fs/promises';
import path from 'node:path';
import type { PageResult, ExportResult } from '../types/index.js';
import { extFromMime, ensureDir } from '../utils/fs.js';
import { extractTables } from './markdown.js';

/**
 * Decode base64 images and write to directory.
 * File naming: {baseName}-p{pageNum}-{imageId}.{ext}
 */
export async function exportImages(
  pages: PageResult[],
  outputDir: string,
  baseName: string,
): Promise<ExportResult> {
  await ensureDir(outputDir);
  const writtenPaths: string[] = [];

  for (const page of pages) {
    const humanPage = page.index + 1;

    for (const image of page.images) {
      const ext = extFromMime(image.mimeType);
      const fileName = `${baseName}-p${humanPage}-${image.id}${ext}`;
      const filePath = path.join(outputDir, fileName);

      await fs.writeFile(filePath, Buffer.from(image.imageBase64, 'base64'));
      writtenPaths.push(filePath);
    }
  }

  return { writtenPaths, count: writtenPaths.length };
}

/**
 * Write each extracted table to its own .md file.
 * File naming: {baseName}-p{pageNum}-table{N}.md
 */
export async function exportTables(
  pages: PageResult[],
  outputDir: string,
  baseName: string,
): Promise<ExportResult> {
  await ensureDir(outputDir);
  const writtenPaths: string[] = [];

  const tables = extractTables(pages);

  for (const table of tables) {
    const humanPage = table.pageIndex + 1;
    const fileName = `${baseName}-p${humanPage}-table${table.tableIndex + 1}.md`;
    const filePath = path.join(outputDir, fileName);

    const content = `# Table ${table.tableIndex + 1} (Page ${humanPage})\n\n${table.markdown}\n`;
    await fs.writeFile(filePath, content, 'utf8');
    writtenPaths.push(filePath);
  }

  return { writtenPaths, count: writtenPaths.length };
}
