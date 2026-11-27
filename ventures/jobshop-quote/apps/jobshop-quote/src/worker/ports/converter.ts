// Document text extraction for uploaded RFQ attachments (PDF drawings, text). Workers AI toMarkdown in
// production; the fake reads a real PDF's text with shared/pdf-text.ts (content streams and ToUnicode
// maps, enough for a drawing's title block and notes) and decodes anything else as text (tests upload
// text-bearing fixtures under a .pdf name).
import { extractPdfText } from "@shared/pdf-text";
import type { DocumentConverter } from "./document-converter";

export class ConversionError extends Error {
  override name = "ConversionError";
}

const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv"]);

const decodeText = (b: ArrayBuffer) => new TextDecoder("utf-8", { fatal: false }).decode(b);

export class WorkersAiConverter implements DocumentConverter {
  constructor(private ai: Ai) {}

  async toMarkdown(file: { name: string; mimeType: string; bytes: ArrayBuffer }) {
    const mime = file.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (TEXT_MIMES.has(mime)) return { markdown: decodeText(file.bytes) };
    let res: ConversionResponse;
    try {
      res = await this.ai.toMarkdown({
        name: file.name,
        blob: new Blob([file.bytes], { type: mime }),
      });
    } catch (e) {
      throw new ConversionError(
        `Could not read this file: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`,
      );
    }
    if (res.format === "error") throw new ConversionError(`Could not read this file: ${res.error}`);
    return { markdown: res.data };
  }
}

export class FakeDocumentConverter implements DocumentConverter {
  async toMarkdown(file: { name: string; mimeType: string; bytes: ArrayBuffer }) {
    // null: not a PDF at all (a text fixture named .pdf), read as text like before.
    const pdf = await extractPdfText(new Uint8Array(file.bytes));
    return { markdown: pdf ?? decodeText(file.bytes) };
  }
}
