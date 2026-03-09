import { ErrorCode, MistralOCRError } from '../utils/errors.js';

/**
 * Parse a human-friendly 1-indexed page range string into a 0-indexed array.
 * Supports formats: "1-5", "1,3,5", "1-3,7,9-11"
 */
export function parsePageRange(input: string): number[] {
  const pages = new Set<number>();
  const segments = input.split(',').map((s) => s.trim());

  for (const segment of segments) {
    if (!segment) continue;

    if (segment.includes('-')) {
      const parts = segment.split('-');
      if (parts.length !== 2) {
        throw new MistralOCRError(
          `Invalid page range segment: "${segment}". Use format like "1-5".`,
          ErrorCode.INVALID_PAGE_RANGE,
          undefined,
          2,
        );
      }

      const [startStr, endStr] = parts;
      const start = parseInt(startStr ?? '', 10);
      const end = parseInt(endStr ?? '', 10);

      if (isNaN(start) || isNaN(end) || start < 1 || end < 1) {
        throw new MistralOCRError(
          `Invalid page numbers in range "${segment}". Pages must be positive integers.`,
          ErrorCode.INVALID_PAGE_RANGE,
          undefined,
          2,
        );
      }

      if (start > end) {
        throw new MistralOCRError(
          `Invalid range "${segment}": start page (${start}) must be <= end page (${end}).`,
          ErrorCode.INVALID_PAGE_RANGE,
          undefined,
          2,
        );
      }

      for (let i = start; i <= end; i++) {
        pages.add(i - 1); // Convert to 0-indexed
      }
    } else {
      const page = parseInt(segment, 10);
      if (isNaN(page) || page < 1) {
        throw new MistralOCRError(
          `Invalid page number: "${segment}". Pages must be positive integers.`,
          ErrorCode.INVALID_PAGE_RANGE,
          undefined,
          2,
        );
      }
      pages.add(page - 1); // Convert to 0-indexed
    }
  }

  if (pages.size === 0) {
    throw new MistralOCRError(
      'Page range is empty. Provide at least one page.',
      ErrorCode.INVALID_PAGE_RANGE,
      undefined,
      2,
    );
  }

  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Format a 0-indexed array back to a human-readable 1-indexed range string.
 * [0,1,2,5] → "1-3,6"
 */
export function formatPageRange(pages: number[]): string {
  if (pages.length === 0) return '';

  const sorted = [...pages].sort((a, b) => a - b).map((p) => p + 1); // Back to 1-indexed
  const ranges: string[] = [];
  let rangeStart = sorted[0]!;
  let prev = sorted[0]!;

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current !== undefined && current === prev + 1) {
      prev = current;
    } else {
      ranges.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}-${prev}`);
      if (current !== undefined) {
        rangeStart = current;
        prev = current;
      }
    }
  }

  return ranges.join(',');
}
