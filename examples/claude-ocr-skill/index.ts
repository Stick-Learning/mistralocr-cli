#!/usr/bin/env node
/**
 * Claude MCP skill: read documents using mistralocr-cli.
 *
 * Exposes a `read_document` tool that Claude can call to extract text from
 * PDFs, images, and other documents via the Mistral OCR API.
 *
 * Usage (Claude Desktop):
 *   Add this server to your claude_desktop_config.json — see README.md.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

// ── MCP server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'mistralocr',
  version: '1.0.0',
});

// ── Tool: read_document ───────────────────────────────────────────────────────

server.tool(
  'read_document',
  'Extract text from a PDF, image, or document file and return it as Markdown. ' +
    'Supports PDFs, DOCX, PPTX, EPUB, PNG, JPG, TIFF, and many more formats. ' +
    'Requires the MISTRAL_API_KEY environment variable to be set.',
  {
    filePath: z
      .string()
      .describe('Absolute or relative path to the document or image file to read.'),
    pages: z
      .string()
      .optional()
      .describe(
        'Page range to extract (1-indexed). Examples: "1-5", "1,3,7", "2-4,8". ' +
          'Omit to process all pages.',
      ),
    includeImages: z
      .boolean()
      .optional()
      .describe(
        'Embed extracted images as base64 data URIs in the returned Markdown. ' +
          'Defaults to false.',
      ),
    model: z
      .string()
      .optional()
      .describe('Mistral OCR model to use. Defaults to "mistral-ocr-latest".'),
  },
  async ({ filePath, pages, includeImages, model }) => {
    const apiKey = process.env['MISTRAL_API_KEY'];
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Missing or empty MISTRAL_API_KEY environment variable. ' +
              'Set it before starting this MCP server.',
          },
        ],
      };
    }

    // Build mistralocr CLI arguments
    const args: string[] = [filePath, '--no-cache'];

    if (pages) {
      args.push('--pages', pages);
    }
    if (includeImages) {
      args.push('--include-images');
    }
    if (model) {
      args.push('--model', model);
    }

    try {
      const { stdout } = await execFileAsync('mistralocr', args, {
        env: { ...process.env, MISTRAL_API_KEY: apiKey },
        maxBuffer: 50 * 1024 * 1024, // 50 MB — handle large documents
      });

      return {
        content: [{ type: 'text', text: stdout }],
      };
    } catch (err) {
      const error = err as { stderr?: string; message?: string };
      const detail = error.stderr?.trim() || error.message || String(err);
      return {
        isError: true,
        content: [{ type: 'text', text: `OCR failed: ${detail}` }],
      };
    }
  },
);

// ── Start server ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
