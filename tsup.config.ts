import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  minify: false,
  sourcemap: true,
});
