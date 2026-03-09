import chalk from 'chalk';
import ora, { type Ora } from 'ora';

let verboseEnabled = false;

export const logger = {
  setVerbose: (v: boolean) => {
    verboseEnabled = v;
  },
  info: (msg: string) => process.stderr.write(chalk.cyan('  ℹ ') + msg + '\n'),
  success: (msg: string) => process.stderr.write(chalk.green('  ✓ ') + msg + '\n'),
  warn: (msg: string) => process.stderr.write(chalk.yellow('  ⚠ ') + msg + '\n'),
  error: (msg: string) => process.stderr.write(chalk.red('  ✗ ') + msg + '\n'),
  debug: (msg: string) => {
    if (verboseEnabled) process.stderr.write(chalk.dim('  · ') + chalk.dim(msg) + '\n');
  },
  dim: (msg: string) => process.stderr.write(chalk.dim(msg) + '\n'),
};

export function createSpinner(text: string): Ora {
  return ora({ text, stream: process.stderr });
}
