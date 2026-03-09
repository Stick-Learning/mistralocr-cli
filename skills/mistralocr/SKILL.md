---
name: mistralocr
description: Convert PDFs, images, and documents to Markdown using the Mistral OCR API. Use when asked to extract text from documents, convert PDFs to Markdown, perform OCR on images, or process scanned files.
---

## Installation

Install the `mistralocr-cli` package globally via npm:

```bash
npm install -g @pisanvs/mistralocr-cli
```

Or use it per-project without installing:

```bash
npx @pisanvs/mistralocr-cli <file> [options]
```

### API Key

Set your Mistral API key as an environment variable:

```bash
export MISTRAL_API_KEY="your-api-key-here"
```

Get a free API key at [console.mistral.ai](https://console.mistral.ai/).

---

## Usage

```
mistralocr [file] [options]
```

### Common Examples

Convert a PDF to Markdown (prints to terminal):
```bash
mistralocr document.pdf
```

Save output to a file:
```bash
mistralocr document.pdf --output document.md
```

Convert an image (JPEG, PNG, WebP, etc.):
```bash
mistralocr photo.jpg --output photo.md
```

Process specific pages only:
```bash
mistralocr book.pdf --pages "1-5" --output chapter1.md
```

Extract images to a folder:
```bash
mistralocr report.pdf --extract-images ./images --output report.md
```

Embed images as base64 data URIs:
```bash
mistralocr invoice.pdf --include-images --output invoice.md
```

Extract tables to separate files:
```bash
mistralocr data.pdf --extract-tables ./tables --output data.md
```

---

## CLI Options

| Flag | Description | Default |
|---|---|---|
| `[file]` | Path to the PDF or image file | *(required)* |
| `-k, --api-key <key>` | Mistral API key (overrides env var) | — |
| `-o, --output <file>` | Write output to a file | stdout |
| `-m, --model <model>` | OCR model to use | `mistral-ocr-latest` |
| `-p, --pages <range>` | Page range (e.g. `1-5`, `1,3,7-10`) | all pages |
| `--include-images` | Embed images as base64 data URIs | `false` |
| `--extract-images <dir>` | Save extracted images to directory | — |
| `--extract-tables <dir>` | Save each table as a separate `.md` file | — |
| `--no-cache` | Bypass cache, always call the API | `false` |
| `--clear-cache` | Delete the cache directory and exit | — |
| `--cache-dir <dir>` | Custom cache directory path | `.mistralocr-cache` |
| `--chunk-size <n>` | Pages per API call (0 = no chunking) | `50` |
| `--max-retries <n>` | Maximum retry attempts per API call | `3` |
| `--retry-delay <ms>` | Initial retry back-off in milliseconds | `1000` |
| `-v, --verbose` | Show detailed progress information | `false` |

---

## Supported Formats

**Documents**: PDF, DOCX/DOC, PPTX/PPT, EPUB, RTF, ODT, LaTeX, Jupyter Notebook, and more.

**Images**: JPEG, PNG, WebP, GIF, TIFF, BMP, AVIF, HEIC/HEIF.

> **Note**: Legacy `.doc`, `.ppt`, `.xls` files require LibreOffice to be installed for auto-conversion.

---

## When to Use This Skill

- Extract text from scanned PDFs or image files
- Convert documents to Markdown for further processing
- Perform OCR on images containing text
- Process multi-page documents with page range selection
- Extract and save embedded images or tables from documents
