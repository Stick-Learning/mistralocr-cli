export enum ErrorCode {
  INVALID_API_KEY = 'INVALID_API_KEY',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_PAGE_RANGE = 'INVALID_PAGE_RANGE',
  INVALID_JSON_OPTION = 'INVALID_JSON_OPTION',
  API_ERROR = 'API_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  CACHE_ERROR = 'CACHE_ERROR',
  EXPORT_ERROR = 'EXPORT_ERROR',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  LIBREOFFICE_NOT_FOUND = 'LIBREOFFICE_NOT_FOUND',
  TOKEN_LIMIT = 'TOKEN_LIMIT',
}

export class MistralOCRError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly cause?: unknown,
    public readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = 'MistralOCRError';
  }
}

export function mapApiError(err: unknown): MistralOCRError {
  if (err instanceof MistralOCRError) return err;

  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return new MistralOCRError('Invalid or missing API key.', ErrorCode.INVALID_API_KEY, err, 3);
    }
    if (status === 429) {
      return new MistralOCRError(
        'Rate limit exceeded. Wait before retrying.',
        ErrorCode.RATE_LIMITED,
        err,
        3,
      );
    }
    if (status === 413) {
      return new MistralOCRError(
        'File is too large for the OCR API.',
        ErrorCode.FILE_TOO_LARGE,
        err,
        4,
      );
    }
    if (status !== undefined && status >= 500) {
      return new MistralOCRError(
        `Mistral server error (${status}). Try again shortly.`,
        ErrorCode.API_ERROR,
        err,
        3,
      );
    }
    return new MistralOCRError(`API error: ${err.message}`, ErrorCode.API_ERROR, err, 3);
  }

  return new MistralOCRError('Unknown API error occurred.', ErrorCode.API_ERROR, err, 3);
}
