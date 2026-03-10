# mistralocr-cli

> Convert PDFs, images, and documents to Markdown using the [Mistral OCR API](https://mistral.ai/).

**mistralocr-cli** is a fast, caching-enabled command-line tool that extracts text from scanned documents and images. It handles large files automatically (chunking), retries on transient errors, and can embed or save extracted images alongside the Markdown output.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
  - [CLI Reference](#cli-reference)
- [Examples](#examples)
  - [Basic OCR](#basic-ocr)
  - [Save Output to a File](#save-output-to-a-file)
  - [Process Specific Pages](#process-specific-pages)
  - [Extract Images to a Folder](#extract-images-to-a-folder)
  - [Embed Images as Base64](#embed-images-as-base64)
  - [Extract Tables to Separate Files](#extract-tables-to-separate-files)
  - [Skip Cache / Clear Cache](#skip-cache--clear-cache)
  - [Auto-Convert Legacy Office Files](#auto-convert-legacy-office-files)
  - [Tune Chunking and Retries](#tune-chunking-and-retries)
- [Supported Formats](#supported-formats)
- [Caching](#caching)
- [Page Ranges](#page-ranges)
- [Claude Skill](#claude-skill)
- [Development](#development)
- [License](#license)

---

## Features

- 📄 **Multi-format support** — PDFs, images (PNG/JPEG/WebP/…), Word, PowerPoint, EPUB, and more
- 🗂️ **Smart caching** — SHA-256 based; re-uses previous results so you never pay for the same file twice
- ✂️ **Automatic chunking** — splits large PDFs into chunks and reassembles the result
- 🔁 **Retry with back-off** — handles rate limits and transient network errors gracefully
- 🖼️ **Image extraction** — embed images as base64 data URIs, or save them to a folder
- 📊 **Table extraction** — save each detected table to its own Markdown file
- 🔄 **Auto-conversion** — converts legacy `.doc` / `.ppt` / `.xls` files via LibreOffice (if installed)
- 📣 **Verbose mode** — real-time spinners and detailed progress output

---

## Requirements

| Requirement | Notes |
|---|---|
| **Node.js ≥ 20** | Required |
| **Mistral API key** | Get one at [console.mistral.ai](https://console.mistral.ai/) |
| **`pdfinfo`** *(optional)* | Enables automatic page-count detection and chunking for PDFs. Install via `poppler-utils` |
| **LibreOffice** *(optional)* | Required only for converting legacy `.doc`, `.ppt`, `.xls` files |

---

## Installation

### Global (recommended)

```bash
npm install -g @pisanvs/mistralocr-cli
```

### Local / per-project

```bash
npm install @pisanvs/mistralocr-cli
npx mistralocr <file> [options]
```

### API key

Set your Mistral API key as an environment variable (recommended):

```bash
export MISTRAL_API_KEY="your-api-key-here"
```

Or pass it inline with `--api-key` on every command.

---

## Quick Start

```bash
# Set your API key
export MISTRAL_API_KEY="your-api-key-here"

# Convert a PDF and print Markdown to the terminal
mistralocr report.pdf

# Save to a file instead
mistralocr report.pdf --output report.md
```

---

## Usage

```
mistralocr [file] [options]
```

### CLI Reference

| Flag | Description | Default |
|---|---|---|
| `[file]` | Path to the PDF or image file to process | *(required)* |
| `-k, --api-key <key>` | Mistral API key (overrides `MISTRAL_API_KEY` env var) | — |
| `-o, --output <file>` | Write Markdown output to a file instead of stdout | stdout |
| `-m, --model <model>` | OCR model to use | `mistral-ocr-latest` |
| `-p, --pages <range>` | Page range to process (see [Page Ranges](#page-ranges)) | all pages |
| `--include-images` | Embed extracted images as base64 data URIs in the Markdown | `false` |
| `--extract-images <dir>` | Save extracted images to `<dir>`; Markdown will reference them relatively | — |
| `--extract-tables <dir>` | Save each detected table as a separate `.md` file in `<dir>` | — |
| `--bbox-annotation <json>` | JSON schema for bounding-box annotation format | — |
| `--document-annotation <json>` | JSON schema for document-level annotation format | — |
| `--no-cache` | Bypass cache and always call the API | `false` |
| `--clear-cache` | Delete the cache directory and exit | — |
| `--cache-dir <dir>` | Custom cache directory path | `.mistralocr-cache` |
| `--chunk-size <n>` | Pages per API call; set to `0` to disable chunking | `50` |
| `--max-retries <n>` | Maximum retry attempts per API call | `3` |
| `--retry-delay <ms>` | Initial retry back-off in milliseconds | `1000` |
| `-v, --verbose` | Show detailed progress information | `false` |
| `-V, --version` | Print version number and exit | — |

---

## Examples

### Basic OCR

Convert a PDF and stream Markdown to your terminal:

```bash
mistralocr scan.pdf
```

Convert a JPEG image:

```bash
mistralocr photo.jpg
```

### Save Output to a File

```bash
mistralocr report.pdf --output report.md
```

### Process Specific Pages

Process only pages 1–5:

```bash
mistralocr book.pdf --pages "1-5" --output chapter1.md
```

Process pages 1, 3, and 7–10:

```bash
mistralocr book.pdf --pages "1,3,7-10" --output selection.md
```

### Extract Images to a Folder

Images are saved to `./images/` and the Markdown contains relative links to them:

```bash
mistralocr report.pdf --extract-images ./images --output report.md
```

Files are named `<basename>-p<page>-img<n>.<ext>` (e.g. `report-p1-img1.png`).

### Embed Images as Base64

All images are inlined as data URIs — useful for fully self-contained documents:

```bash
mistralocr invoice.pdf --include-images --output invoice.md
```

### Extract Tables to Separate Files

Each detected table is saved as its own `.md` file:

```bash
mistralocr data.pdf --extract-tables ./tables --output data.md
```

Table files are named `<basename>-p<page>-table<n>.md`.

### Skip Cache / Clear Cache

Force a fresh API call (ignore any cached result):

```bash
mistralocr report.pdf --no-cache
```

Delete all cached results:

```bash
mistralocr --clear-cache
```

Use a custom cache location:

```bash
mistralocr report.pdf --cache-dir /tmp/my-cache
```

### Auto-Convert Legacy Office Files

If LibreOffice is installed, `.doc`, `.ppt`, `.xls`, and similar files are automatically converted before OCR:

```bash
mistralocr legacy-document.doc --output result.md
```

### Tune Chunking and Retries

Process 100 pages at a time instead of the default 50:

```bash
mistralocr large-book.pdf --chunk-size 100
```

Disable chunking entirely:

```bash
mistralocr small.pdf --chunk-size 0
```

Increase retry attempts and set a longer initial delay for slow connections:

```bash
mistralocr report.pdf --max-retries 5 --retry-delay 2000
```

### Verbose Output

See real-time progress spinners and detailed logs:

```bash
mistralocr report.pdf --verbose --output report.md
```

---

## Supported Formats

### Documents

| Format | Extension(s) |
|---|---|
| PDF | `.pdf` |
| Word | `.docx`, `.doc` *(auto-converted via LibreOffice)* |
| PowerPoint | `.pptx`, `.ppt` *(auto-converted via LibreOffice)* |
| EPUB | `.epub` |
| RTF | `.rtf` |
| OpenDocument Text | `.odt` |
| LaTeX | `.tex` |
| Jupyter Notebook | `.ipynb` |
| BibTeX | `.bib` |
| FictionBook | `.fb2` |
| OPML | `.opml` |
| XML (DocBook/JATS) | `.xml` |
| Troff/Man | `.1`, `.man` |

### Images

| Format | Extension(s) |
|---|---|
| JPEG | `.jpg`, `.jpeg` |
| PNG | `.png` |
| WebP | `.webp` |
| GIF | `.gif` |
| TIFF | `.tiff`, `.tif` |
| BMP | `.bmp` |
| AVIF | `.avif` |
| HEIC/HEIF | `.heic`, `.heif` |

---

## Caching

Results are cached locally so repeated runs on the same file (with the same options) return instantly without calling the API.

- **Location**: `.mistralocr-cache/` in the current directory (override with `--cache-dir`)
- **Key**: SHA-256 hash of the file contents + a hash of the relevant options (model, page range, image settings)
- **Invalidation**: The cache is automatically invalidated when the file changes or any option that affects the output changes
- **Bypass**: Use `--no-cache` to force a fresh API call
- **Clear**: Use `--clear-cache` to delete all cached results

---

## Page Ranges

The `--pages` option accepts 1-indexed page numbers in several formats:

| Format | Example | Pages processed |
|---|---|---|
| Single page | `5` | 5 |
| Range | `1-5` | 1, 2, 3, 4, 5 |
| List | `1,3,5` | 1, 3, 5 |
| Mixed | `1-3,7,10-12` | 1, 2, 3, 7, 10, 11, 12 |

---

## Claude Skill

A ready-made [Claude](https://claude.ai/) skill is included in
[`examples/claude-ocr-skill/SKILL.md`](examples/claude-ocr-skill/SKILL.md).
When installed, Claude will automatically invoke `mistralocr` whenever you share
a document path and ask it to read, extract, or summarise the file.

### Install

```bash
mkdir -p ~/.claude/skills/read-document
cp examples/claude-ocr-skill/SKILL.md ~/.claude/skills/read-document/SKILL.md
```

Or, if you haven't cloned the repo, download the skill file directly:

```bash
mkdir -p ~/.claude/skills/read-document
curl -fsSL https://raw.githubusercontent.com/pisanvs/mistralocr-cli/main/examples/claude-ocr-skill/SKILL.md \
  -o ~/.claude/skills/read-document/SKILL.md
```

### What it does

Once installed, Claude will:

1. Recognise when you provide a local file path and want its contents read.
2. Run `mistralocr <file> [options]` via its Bash tool.
3. Return the extracted Markdown for further summarisation, translation, or analysis.

### Prerequisites

- `mistralocr` must be installed globally (`npm install -g @pisanvs/mistralocr-cli`).
- The `MISTRAL_API_KEY` environment variable must be set in the environment where
  Claude runs its Bash tool.

---

## Development

```bash
# Clone the repository
git clone https://github.com/pisanvs/mistralocr-cli.git
cd mistralocr-cli

# Install dependencies
npm install

# Run in development mode (TypeScript, no build step)
npm run dev -- report.pdf

# Build to dist/
npm run build

# Type-check without building
npm run typecheck
```

---

## License

[MIT](https://opensource.org/licenses/MIT)
