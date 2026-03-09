const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'ECONNREFUSED', 'EPIPE', 'ECONNABORTED',
]);
const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 408, 413, 422]);

export interface RetryOptions {
  maxRetries: number;   // default: 3
  baseDelayMs: number;  // default: 1000
  maxDelayMs: number;   // default: 16000
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // Check if we should retry
      if (attempt >= options.maxRetries || !isRetryable(err)) {
        throw err;
      }

      // Calculate delay
      const delayMs = computeDelay(attempt, err, options);
      onRetry?.(attempt + 1, delayMs, err);
      await sleep(delayMs);
    }
  }

  throw lastErr;
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const status = (err as { status?: number }).status;
  const code = (err as NodeJS.ErrnoException).code;

  // Explicit non-retryable HTTP statuses
  if (status !== undefined && NON_RETRYABLE_HTTP_STATUSES.has(status)) return false;
  // Retryable HTTP statuses (including 429 rate limit)
  if (status !== undefined) return RETRYABLE_HTTP_STATUSES.has(status);
  // Network-level errors
  if (code !== undefined) return RETRYABLE_ERROR_CODES.has(code);

  return false;
}

function computeDelay(attempt: number, err: unknown, options: RetryOptions): number {
  // Respect Retry-After header for 429 responses
  const retryAfter = (err as { headers?: Record<string, string> }).headers?.['retry-after'];
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, options.maxDelayMs);
    }
  }

  // Exponential backoff with jitter: base * 2^attempt + random(0..200)ms
  const exponential = options.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 200;
  return Math.min(exponential + jitter, options.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
