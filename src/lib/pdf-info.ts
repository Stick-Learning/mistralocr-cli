import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

/**
 * Get the page count of a PDF using the `pdfinfo` CLI (from poppler-utils).
 * Returns null if pdfinfo is not installed or fails — caller skips chunking gracefully.
 */
export async function getPdfPageCount(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [filePath]);
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    if (match?.[1]) {
      const count = parseInt(match[1], 10);
      logger.debug(`pdfinfo: ${count} pages in ${filePath}`);
      return count;
    }
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      logger.debug('pdfinfo not found — chunking disabled (install poppler-utils to enable)');
    } else {
      logger.debug(`pdfinfo failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }
}
