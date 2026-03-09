import { Command } from 'commander';
import type { CLIFlags } from './types/index.js';
import { runOCRCommand } from './commands/ocr.js';
import { MistralOCRError } from './utils/errors.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('mistralocr')
  .description('Convert PDFs and images to Markdown using the Mistral OCR API')
  .version('1.0.0', '-V, --version', 'Print version number')
  .argument('[file]', 'PDF or image file to process')
  .option('-k, --api-key <key>', 'Mistral API key (overrides MISTRAL_API_KEY env variable)')
  .option('-o, --output <file>', 'Write Markdown output to file instead of stdout')
  .option('-m, --model <model>', 'OCR model to use', 'mistral-ocr-latest')
  .option('-p, --pages <range>', 'Page range (1-indexed): "1-5", "1,3,5", "1-3,7"')
  .option('--include-images', 'Embed images as base64 data URIs in Markdown output')
  .option('--extract-images <dir>', 'Save extracted images to directory')
  .option('--extract-tables <dir>', 'Save extracted tables as separate .md files to directory')
  .option('--bbox-annotation <json>', 'JSON schema for bounding box annotation format')
  .option('--document-annotation <json>', 'JSON schema for document annotation format')
  .option('--no-cache', 'Bypass cache, always re-process with the API')
  .option('--clear-cache', 'Clear the cache directory and exit')
  .option('--cache-dir <dir>', 'Cache directory path', '.mistralocr-cache')
  .option('--chunk-size <n>', 'Pages per API call; 0 to disable chunking (default: 50)', '50')
  .option('--max-retries <n>', 'Retry attempts per API call on transient failures (default: 3)', '3')
  .option('--retry-delay <ms>', 'Initial retry backoff in milliseconds (default: 1000)', '1000')
  .option('-v, --verbose', 'Show detailed progress information')
  .addHelpText(
    'after',
    `
Examples:
  $ mistralocr report.pdf
  $ mistralocr scan.pdf --pages "1-10" --output result.md
  $ mistralocr form.pdf --extract-images ./imgs --extract-tables ./tables
  $ mistralocr invoice.pdf --include-images > invoice.md
  $ mistralocr document.pdf --no-cache --verbose
  $ mistralocr --clear-cache
    `,
  )
  .action(async (file: string | undefined, opts: Record<string, unknown>) => {
    // --clear-cache doesn't need a file
    const clearCache = !!(opts['clearCache'] as boolean | undefined);
    if (!clearCache && !file) {
      program.error("error: missing required argument 'file'");
    }

    const flags: CLIFlags = {
      apiKey: opts['apiKey'] as string | undefined,
      output: opts['output'] as string | undefined,
      model: (opts['model'] as string) ?? 'mistral-ocr-latest',
      pages: opts['pages'] as string | undefined,
      includeImages: !!(opts['includeImages'] as boolean | undefined),
      extractImages: opts['extractImages'] as string | undefined,
      extractTables: opts['extractTables'] as string | undefined,
      bboxAnnotation: opts['bboxAnnotation'] as string | undefined,
      documentAnnotation: opts['documentAnnotation'] as string | undefined,
      cache: opts['cache'] !== false, // commander sets to false when --no-cache is used
      clearCache: !!(opts['clearCache'] as boolean | undefined),
      cacheDir: (opts['cacheDir'] as string) ?? '.mistralocr-cache',
      chunkSize: parseInt((opts['chunkSize'] as string) ?? '50', 10),
      maxRetries: parseInt((opts['maxRetries'] as string) ?? '3', 10),
      retryDelay: parseInt((opts['retryDelay'] as string) ?? '1000', 10),
      verbose: !!(opts['verbose'] as boolean | undefined),
    };

    await runOCRCommand(file ?? '', flags);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  handleFatalError(err);
});

function handleFatalError(err: unknown): never {
  if (err instanceof MistralOCRError) {
    logger.error(err.message);
    const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');
    if (verbose && err.cause) {
      logger.dim(String(err.cause));
    }
    process.exit(err.exitCode);
  }

  if (err instanceof Error) {
    logger.error(`Unexpected error: ${err.message}`);
    const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');
    if (verbose && err.stack) {
      logger.dim(err.stack);
    }
  } else {
    logger.error('An unknown error occurred');
  }

  process.exit(1);
}
