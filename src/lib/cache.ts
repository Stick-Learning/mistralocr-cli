import fs from 'node:fs/promises';
import path from 'node:path';
import type { CacheEntry, PageResult } from '../types/index.js';
import { computeFileHash, computeObjectHash, ensureDir } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

const SCHEMA_VERSION = '1' as const;

export class CacheManager {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = path.resolve(cacheDir);
  }

  /**
   * Look up cached result. Returns null if:
   * - No cache file exists
   * - Schema version mismatch
   * - Requested pages not fully covered by cached pages
   */
  async get(
    fileHash: string,
    optionsHash: string,
    requestedPages?: number[],
  ): Promise<PageResult[] | null> {
    const cachePath = this.cachePath(fileHash, optionsHash);

    try {
      const raw = await fs.readFile(cachePath, 'utf8');
      const entry = JSON.parse(raw) as CacheEntry;

      if (entry.schemaVersion !== SCHEMA_VERSION) {
        logger.debug(`Cache schema mismatch (got ${entry.schemaVersion}), ignoring`);
        return null;
      }

      // If specific pages requested, verify they're all in cache
      if (requestedPages !== undefined && requestedPages.length > 0) {
        const cachedIndexes = new Set(entry.pages.map((p) => p.index));
        const allCovered = requestedPages.every((p) => cachedIndexes.has(p));
        if (!allCovered) {
          logger.debug(`Cache miss: not all requested pages are cached`);
          return null;
        }

        // Return only the requested pages, in order
        return requestedPages.map((idx) => entry.pages.find((p) => p.index === idx)!);
      }

      return entry.pages;
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') return null;
      logger.debug(`Cache read error: ${err}`);
      return null;
    }
  }

  async set(
    fileHash: string,
    optionsHash: string,
    model: string,
    pages: PageResult[],
  ): Promise<void> {
    await ensureDir(this.cacheDir);
    const entry: CacheEntry = {
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      model,
      fileHash,
      optionsHash,
      pages,
    };
    const cachePath = this.cachePath(fileHash, optionsHash);
    await fs.writeFile(cachePath, JSON.stringify(entry, null, 2), 'utf8');
    logger.debug(`Cache written: ${path.basename(cachePath)}`);
  }

  async clear(): Promise<{ count: number }> {
    let count = 0;
    try {
      const entries = await fs.readdir(this.cacheDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          await fs.unlink(path.join(this.cacheDir, entry));
          count++;
        }
      }
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') throw err;
    }
    return { count };
  }

  async stats(): Promise<{ count: number; totalSizeBytes: number }> {
    let count = 0;
    let totalSizeBytes = 0;
    try {
      const entries = await fs.readdir(this.cacheDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const stat = await fs.stat(path.join(this.cacheDir, entry));
          count++;
          totalSizeBytes += stat.size;
        }
      }
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') throw err;
    }
    return { count, totalSizeBytes };
  }

  private cachePath(fileHash: string, optionsHash: string): string {
    return path.join(
      this.cacheDir,
      `${fileHash.slice(0, 16)}-${optionsHash.slice(0, 16)}.json`,
    );
  }
}

// Exported helpers to compute hashes used as cache keys
export { computeFileHash, computeObjectHash };
