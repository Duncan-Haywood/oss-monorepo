// Workers AI adapters (OWNER: ingestion agent). Embeddings (bge-m3, 1024 dims), document -> markdown
// via env.AI.toMarkdown, and Whisper transcription (OWNER of WorkersAiTranscriber: interview agent).
import type { DocumentConverter } from "./document-converter";
import type { Embedder } from "./embedder";
import type { Transcriber } from "./transcriber";

/** Workers AI accepts up to 100 inputs per embedding call; stay well below. */
const EMBED_BATCH = 50;

export class EmbeddingError extends Error {
  override name = "EmbeddingError";
}

export class ConversionError extends Error {
  override name = "ConversionError";
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export class WorkersAiEmbedder implements Embedder {
  readonly dimensions = 1024;
  constructor(
    private ai: Ai,
    private model: string,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      out.push(...(await this.embedBatch(texts.slice(i, i + EMBED_BATCH))));
    }
    return out;
  }

  private async embedBatch(batch: string[]): Promise<number[][]> {
    // Empty strings make the model error; embed a single space instead.
    const text = batch.map((t) => (t.trim() ? t : " "));
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // EMBEDDING_MODEL is configured as "@cf/baai/bge-m3"; other models with the same
        // `{ text: string[] } -> { data: number[][] }` contract (bge-*) also work.
        const res = await this.ai.run(this.model as "@cf/baai/bge-m3", {
          text,
          truncate_inputs: true,
        });
        const data = "data" in res ? res.data : undefined;
        if (!Array.isArray(data) || data.length !== batch.length) {
          throw new EmbeddingError(
            `Embedding model returned ${Array.isArray(data) ? data.length : "no"} vectors for ${batch.length} inputs`,
          );
        }
        return data;
      } catch (e) {
        lastError = e;
        if (e instanceof EmbeddingError) break;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    if (lastError instanceof EmbeddingError) throw lastError;
    throw new EmbeddingError(`Embedding failed: ${errMsg(lastError)}`);
  }
}

const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
const RTF_MIMES = new Set(["application/rtf", "text/rtf"]);

export class WorkersAiConverter implements DocumentConverter {
  constructor(private ai: Ai) {}

  async toMarkdown(file: { name: string; mimeType: string; bytes: ArrayBuffer }) {
    const mime = file.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    // Plain text needs no model call.
    if (TEXT_MIMES.has(mime)) return { markdown: decodeText(file.bytes) };
    if (RTF_MIMES.has(mime)) return { markdown: rtfToText(decodeText(file.bytes)) };

    let res: ConversionResponse;
    try {
      res = await this.ai.toMarkdown({
        name: file.name,
        blob: new Blob([file.bytes], { type: mime }),
      });
    } catch (e) {
      const fallback = textFallback(mime, file.bytes);
      if (fallback !== null) return { markdown: fallback };
      throw new ConversionError(`Document conversion failed: ${errMsg(e)}`);
    }
    if (res.format === "error") {
      const fallback = textFallback(mime, file.bytes);
      if (fallback !== null) return { markdown: fallback };
      if (mime === "application/msword") {
        throw new ConversionError(
          "Legacy .doc files can't be read. Please save it as .docx or PDF and upload again.",
        );
      }
      throw new ConversionError(`Could not extract text from this file: ${res.error}`);
    }
    return { markdown: res.data };
  }
}

/** For text-based formats we can still produce something useful if conversion fails. */
function textFallback(mime: string, bytes: ArrayBuffer): string | null {
  if (mime === "text/csv") return decodeText(bytes);
  if (mime === "text/html" || mime === "application/xhtml+xml") {
    return decodeText(bytes)
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ");
  }
  return null;
}

export function decodeText(bytes: ArrayBuffer): string {
  // TextDecoder strips a leading BOM by default.
  return new TextDecoder("utf-8").decode(bytes);
}

/** Minimal RTF -> plain text: drops control words/groups, keeps paragraphs and \'hh escapes. */
export function rtfToText(rtf: string): string {
  if (!rtf.trimStart().startsWith("{\\rtf")) return rtf;
  const SKIP_GROUPS =
    /\{\\(?:\*|fonttbl|colortbl|stylesheet|info|pict|header|footer|listtable|listoverridetable)[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}/g;
  return rtf
    .replace(/\\\\/g, "\u0001")
    .replace(/\\\{/g, "\u0002")
    .replace(/\\\}/g, "\u0003")
    .replace(SKIP_GROUPS, "")
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => {
      const code = Number(n);
      return String.fromCharCode(code < 0 ? code + 65536 : code);
    })
    .replace(/\\(?:par|line)\b ?/g, "\n")
    .replace(/\\tab\b ?/g, "\t")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replaceAll("\u0001", "\\")
    .replaceAll("\u0002", "{")
    .replaceAll("\u0003", "}")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class WorkersAiTranscriber implements Transcriber {
  constructor(
    private ai: Ai,
    private model: string,
  ) {}
  /** whisper-large-v3-turbo takes the audio file as a base64 string (`audio: string`). */
  async transcribe(audio: ArrayBuffer, _mimeType: string) {
    const input: Ai_Cf_Openai_Whisper_Large_V3_Turbo_Input = {
      audio: toBase64(new Uint8Array(audio)),
      task: "transcribe",
      vad_filter: true,
    };
    const res = (await this.ai.run(
      this.model as "@cf/openai/whisper-large-v3-turbo",
      input,
    )) as Partial<Ai_Cf_Openai_Whisper_Large_V3_Turbo_Output>;
    const text =
      res.text ??
      (res.segments ?? [])
        .map((s) => s.text ?? "")
        .join(" ")
        .replace(/\s+/g, " ");
    return { text: text.trim() };
  }
}

/** Base64 in 32 KiB slices: linear time, no per-byte string concatenation or arg-length limits. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(""));
}
