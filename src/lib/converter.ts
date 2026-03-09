import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { MistralOCRError, ErrorCode } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface ConversionResult {
  outputPath: string;
  cleanup: () => Promise<void>;
}

/**
 * Convert a file to a new format using LibreOffice headless mode.
 * @param filePath  Absolute path to the source file
 * @param targetExt Target extension including dot, e.g. ".docx" or ".pdf"
 */
export async function convert(filePath: string, targetExt: string): Promise<ConversionResult> {
  const binary = await findLibreOffice();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mistralocr-'));

  // LibreOffice --convert-to uses the extension without the leading dot
  const format = targetExt.replace(/^\./, '');

  logger.debug(`Running: ${binary} --headless --convert-to ${format} --outdir ${tmpDir} "${filePath}"`);

  try {
    const { stdout, stderr } = await execFileAsync(binary, [
      '--headless',
      '--convert-to', format,
      '--outdir', tmpDir,
      filePath,
    ]);

    if (stdout) logger.debug(`LibreOffice stdout: ${stdout.trim()}`);
    if (stderr) logger.debug(`LibreOffice stderr: ${stderr.trim()}`);
  } catch (err) {
    // Clean up temp dir on failure
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);

    const stderr = (err as { stderr?: string }).stderr ?? '';
    throw new MistralOCRError(
      `LibreOffice conversion failed: ${stderr.trim() || (err instanceof Error ? err.message : String(err))}`,
      ErrorCode.CONVERSION_FAILED,
      err,
      4,
    );
  }

  // LibreOffice names the output file: <original-basename><targetExt>
  const baseName = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(tmpDir, `${baseName}${targetExt}`);

  // Verify the output file was actually created
  try {
    await fs.access(outputPath);
  } catch {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw new MistralOCRError(
      `LibreOffice conversion produced no output. Expected: ${outputPath}`,
      ErrorCode.CONVERSION_FAILED,
      undefined,
      4,
    );
  }

  const cleanup = async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  };

  return { outputPath, cleanup };
}

async function findLibreOffice(): Promise<string> {
  // Check well-known absolute install paths first — these bypass firejail/wrapper
  // scripts that might sandbox the binary and block temp file access
  const absolutePaths = [
    '/usr/lib/libreoffice/program/soffice',         // Debian/Ubuntu/Arch
    '/usr/lib64/libreoffice/program/soffice',       // Fedora/RHEL 64-bit
    '/opt/libreoffice/program/soffice',             // manual Linux install
    '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS
  ];

  for (const p of absolutePaths) {
    try {
      await fs.access(p, fs.constants.X_OK);
      return p;
    } catch {
      // Not present or not executable, try next
    }
  }

  // Fall back to PATH binaries (works on systems without firejail wrappers)
  const pathBinaries = ['soffice', 'libreoffice'];
  for (const bin of pathBinaries) {
    try {
      await execFileAsync('which', [bin]);
      return bin;
    } catch {
      // Not found, try next
    }
  }

  throw new MistralOCRError(
    'LibreOffice is required to convert legacy Office files (.doc, .ppt, .xls).\n' +
    '  Install it with:\n' +
    '    Debian/Ubuntu:  sudo apt install libreoffice\n' +
    '    macOS (Homebrew): brew install --cask libreoffice\n' +
    '    Fedora/RHEL:    sudo dnf install libreoffice',
    ErrorCode.LIBREOFFICE_NOT_FOUND,
    undefined,
    4,
  );
}
