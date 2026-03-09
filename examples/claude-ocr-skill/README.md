# Claude OCR Skill

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that lets Claude read documents using **mistralocr-cli**. Once configured, Claude can extract text from PDFs, images, and other documents directly within a conversation.

## How it works

This MCP server exposes a single `read_document` tool. When Claude calls it, the server runs `mistralocr` as a subprocess and returns the extracted Markdown text back to Claude.

```
Claude ──► read_document(filePath) ──► mistralocr CLI ──► Mistral OCR API
                                                        ◄── Markdown text
```

## Prerequisites

1. **Node.js 20+**
2. **mistralocr-cli** installed and on your `PATH`:
   ```bash
   npm install -g @pisanvs/mistralocr-cli
   ```
3. A **Mistral API key** — get one at <https://console.mistral.ai>

## Setup

Install the skill's dependencies and build it:

```bash
cd examples/claude-ocr-skill
npm install
npm run build
```

## Configure Claude Desktop

Add the server to your Claude Desktop configuration file.

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mistralocr": {
      "command": "node",
      "args": ["/absolute/path/to/examples/claude-ocr-skill/dist/index.js"],
      "env": {
        "MISTRAL_API_KEY": "your-mistral-api-key"
      }
    }
  }
}
```

> Replace `/absolute/path/to/examples/claude-ocr-skill` with the actual path on your system.

Restart Claude Desktop after saving the configuration.

## Usage

Once configured, you can ask Claude to read any document by providing a file path. Examples:

- *"Read the file `/home/user/report.pdf` and summarise it."*
- *"Extract pages 1-5 from `/tmp/manual.pdf` and list the key points."*
- *"What does `/home/user/invoice.png` say?"*

### Tool reference

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filePath` | string | ✅ | Path to the document or image file |
| `pages` | string | — | Page range, e.g. `"1-5"`, `"1,3,7"`, `"2-4,8"` |
| `includeImages` | boolean | — | Embed images as base64 in the returned Markdown |
| `model` | string | — | OCR model (default: `mistral-ocr-latest`) |

### Supported formats

| Documents | Images |
|---|---|
| PDF, DOCX, PPTX, EPUB, RTF, ODT, BIB, FB2, TEX | PNG, JPG/JPEG, AVIF, TIFF, GIF, HEIC, BMP, WEBP |

Legacy Office files (`.doc`, `.ppt`, `.xls`) are auto-converted if LibreOffice is installed.

## Development

Run a local type-check:

```bash
npm run build   # compile TypeScript → dist/
```

Start the server manually to test the stdio transport:

```bash
npm start
```
