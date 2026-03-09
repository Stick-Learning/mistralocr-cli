---
name: read-document
description: >
  Use this skill whenever the user wants to extract text from a document or image
  file — PDFs, scanned pages, photos of documents, Word files, PowerPoint slides,
  invoices, forms, reports, books, or any image containing text. Trigger phrases
  include: "read this PDF", "extract text from", "OCR this", "what does this
  document say", "convert this to text", "parse this file", "get the text out of",
  "process this scan", "read this image". Use it even when the user just says
  "here is a PDF, summarise it" or drags a file into the conversation — if there
  is a local file path involved and the goal is to read its contents, apply this
  skill.
---

# Read Document

## Overview

This skill uses **mistralocr-cli** (`mistralocr`) to convert PDFs, images, and
other documents into clean Markdown text via the Mistral OCR API. The result can
then be summarised, searched, translated, or processed further.

## When to Use

Apply this skill whenever the user:
- Provides a file path and wants its text content.
- Asks to "read", "extract", "parse", "OCR", or "convert" a file.
- Wants a summary, translation, or analysis of a document they cannot paste as text.
- Mentions file types: PDF, PNG, JPG, DOCX, PPTX, EPUB, TIFF, etc.

## Prerequisites

- `mistralocr` CLI must be installed (`npm install -g @pisanvs/mistralocr-cli`).
- The `MISTRAL_API_KEY` environment variable must be set, **or** the `--api-key`
  flag must be provided.

## Command Reference

```
mistralocr <file> [options]
```

| Flag | Default | Description |
|---|---|---|
| `<file>` | *(required)* | Path to the document or image to process |
| `-k, --api-key <key>` | `$MISTRAL_API_KEY` | Mistral API key |
| `-o, --output <file>` | stdout | Write Markdown to this file instead of printing |
| `-m, --model <model>` | `mistral-ocr-latest` | OCR model to use |
| `-p, --pages <range>` | all pages | Page range (1-indexed): `"1-5"`, `"1,3,7"`, `"2-4,8"` |
| `--include-images` | off | Embed extracted images as base64 data URIs in Markdown |
| `--extract-images <dir>` | off | Save extracted images to `<dir>`; Markdown references them |
| `--extract-tables <dir>` | off | Save each table as a separate `.md` file in `<dir>` |
| `--bbox-annotation <json>` | off | JSON schema for bounding-box annotation |
| `--document-annotation <json>` | off | JSON schema for document-level annotation |
| `--no-cache` | off | Skip cache, always call the API |
| `--clear-cache` | — | Delete the cache directory and exit |
| `--cache-dir <dir>` | `.mistralocr-cache` | Custom cache directory |
| `--chunk-size <n>` | `50` | Pages per API call; `0` disables chunking |
| `--max-retries <n>` | `3` | Retry attempts on transient failures |
| `--retry-delay <ms>` | `1000` | Initial retry back-off in milliseconds |
| `-v, --verbose` | off | Show detailed progress (spinners, timing, cache hits) |

## Workflow

1. **Identify the file** — confirm the path is absolute or relative to the
   working directory.
2. **Choose the right flags** — see the examples below for common scenarios.
3. **Run the command** — execute `mistralocr <file> [flags]`.
4. **Interpret the output** — the tool prints Markdown to stdout (or writes to
   `--output`). Multi-page documents include `---` page separators.
5. **Present results** — use the extracted Markdown to answer the user's question.

## Examples

### Basic: read a PDF and print Markdown to stdout

```bash
mistralocr report.pdf
```

### Save output to a file

```bash
mistralocr report.pdf --output report.md
```

### Read only pages 1–5

```bash
mistralocr book.pdf --pages "1-5"
```

### Read specific non-contiguous pages

```bash
mistralocr manual.pdf --pages "1,3,7-10"
```

### Extract images to a folder (Markdown references them by path)

```bash
mistralocr brochure.pdf --extract-images ./images --output brochure.md
# Produces: brochure.md + images/brochure-p1-img1.png, etc.
```

### Embed images as base64 (self-contained output)

```bash
mistralocr invoice.pdf --include-images --output invoice.md
```

### Extract tables into separate files

```bash
mistralocr data.pdf --extract-tables ./tables --output data.md
# Produces: data.md + tables/data-p1-table1.md, tables/data-p2-table1.md, etc.
```

### Read an image file (photo of a document, scanned page)

```bash
mistralocr scan.png
mistralocr photo.jpg
```

### Process a Word or PowerPoint file (auto-converts via LibreOffice)

```bash
mistralocr report.docx --output report.md
mistralocr slides.pptx --output slides.md
```

### Force re-processing (skip cache)

```bash
mistralocr report.pdf --no-cache
```

### Verbose mode (shows progress spinners and cache info)

```bash
mistralocr report.pdf --verbose --output report.md
```

### Clear the cache

```bash
mistralocr --clear-cache
```

## Output Format

`mistralocr` outputs **Markdown**. Multi-page documents separate pages with
`---` (horizontal rule). Images appear as either:
- `![img](data:image/png;base64,...)` — when `--include-images` is used.
- `![img](./images/doc-p1-img1.png)` — when `--extract-images <dir>` is used.
- *(stripped)* — by default, images are omitted from the Markdown.

Tables are rendered as standard Markdown pipe tables.

## Error Handling

| Error message | Cause | Fix |
|---|---|---|
| `No API key provided` | `MISTRAL_API_KEY` not set and `--api-key` not given | Set the env var or add `--api-key <key>` |
| `File not found: <path>` | The path does not exist | Verify the path; use an absolute path if unsure |
| `Unsupported file format: .xyz` | Extension not recognised | Check the supported formats list below |
| `Conversion failed` / `LibreOffice not found` | Legacy `.doc`/`.ppt`/`.xls` file without LibreOffice | Install LibreOffice or convert the file manually first |
| `Output truncated at chunk N` | Document is too long for the model context window | Use `--pages` to target a smaller range, or reduce `--chunk-size` |
| Rate-limit / `429` errors | Too many requests | Increase `--retry-delay` or wait and retry |
| `Invalid JSON for --bbox-annotation` | Malformed JSON string | Pass a valid JSON object string, e.g. `'{"key":"value"}'` |

## Supported Formats

**Documents:** PDF, DOCX, PPTX, EPUB, RTF, ODT, BIB, FB2, IPYNB, TEX, OPML, XML, Troff

**Images:** PNG, JPG/JPEG, AVIF, TIFF, GIF, HEIC, BMP, WEBP

**Legacy Office (auto-converted if LibreOffice is installed):** .doc → .docx, .ppt → .pptx, .xls/.xlsx/.csv → PDF

## Notes & Edge Cases

- **Caching is on by default.** The tool caches results by SHA-256 hash of the
  file content and options. Re-running the same command on an unchanged file is
  nearly instant. Use `--no-cache` to force a fresh API call.
- **Page ranges are 1-indexed** in the CLI (`--pages "1-5"`) even though the
  API uses 0-indexed values internally.
- **Large PDFs are chunked automatically.** For files over 50 pages, `mistralocr`
  splits them into 50-page batches and reassembles the result. Use `--chunk-size`
  to adjust the batch size.
- **Changing the page range does not invalidate the cache** — the cache stores
  all pages and returns the requested subset.
- **Images are stripped from Markdown output by default.** Pass `--include-images`
  or `--extract-images <dir>` to include them.
- **The tool writes to stdout by default.** Always use `--output <file>` when
  the result should be saved, especially for large documents.
