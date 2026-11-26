import { describe, expect, it, vi } from "vitest";
import {
  ConversionError,
  EmbeddingError,
  rtfToText,
  WorkersAiConverter,
  WorkersAiEmbedder,
} from "./workers-ai";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

function fakeAi(overrides: { run?: unknown; toMarkdown?: unknown }) {
  return overrides as unknown as Ai;
}

describe("WorkersAiEmbedder", () => {
  it("embeds in batches of at most 50 and preserves order", async () => {
    const run = vi.fn(async (_model: string, input: { text: string[] }) => ({
      shape: [input.text.length, 3],
      data: input.text.map((t) => [Number(t), 0, 0]),
    }));
    const embedder = new WorkersAiEmbedder(fakeAi({ run }), "@cf/baai/bge-m3");
    const texts = Array.from({ length: 120 }, (_, i) => String(i));
    const out = await embedder.embed(texts);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map((c) => c[1].text.length)).toEqual([50, 50, 20]);
    expect(run.mock.calls[0]?.[0]).toBe("@cf/baai/bge-m3");
    expect(out.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it("throws EmbeddingError on a malformed response", async () => {
    const run = vi.fn(async () => ({ data: [[1, 2, 3]] }));
    const embedder = new WorkersAiEmbedder(fakeAi({ run }), "@cf/baai/bge-m3");
    await expect(embedder.embed(["a", "b"])).rejects.toBeInstanceOf(EmbeddingError);
  });

  it("retries once on a transient error", async () => {
    let calls = 0;
    const run = vi.fn(async (_m: string, input: { text: string[] }) => {
      calls++;
      if (calls === 1) throw new Error("3040: capacity");
      return { data: input.text.map(() => [1]) };
    });
    const embedder = new WorkersAiEmbedder(fakeAi({ run }), "@cf/baai/bge-m3");
    expect(await embedder.embed(["a"])).toEqual([[1]]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("WorkersAiConverter", () => {
  it("decodes plain text and markdown without calling the model", async () => {
    const toMarkdown = vi.fn();
    const conv = new WorkersAiConverter(fakeAi({ toMarkdown }));
    const res = await conv.toMarkdown({
      name: "a.md",
      mimeType: "text/markdown",
      bytes: bytes("# Hi"),
    });
    expect(res.markdown).toBe("# Hi");
    expect(toMarkdown).not.toHaveBeenCalled();
  });

  it("uses toMarkdown for PDFs and returns its data", async () => {
    const toMarkdown = vi.fn(async (doc: { name: string; blob: Blob }) => ({
      id: "1",
      name: doc.name,
      mimeType: doc.blob.type,
      format: "markdown",
      tokens: 3,
      data: "# Annual report",
    }));
    const conv = new WorkersAiConverter(fakeAi({ toMarkdown }));
    const res = await conv.toMarkdown({
      name: "r.pdf",
      mimeType: "application/pdf",
      bytes: bytes("%PDF"),
    });
    expect(res.markdown).toBe("# Annual report");
    expect(toMarkdown.mock.calls[0]?.[0].blob.type).toBe("application/pdf");
  });

  it("throws ConversionError for error results and failures", async () => {
    const errorResult = new WorkersAiConverter(
      fakeAi({
        toMarkdown: async () => ({
          id: "1",
          name: "x.pdf",
          mimeType: "application/pdf",
          format: "error",
          error: "corrupt",
        }),
      }),
    );
    await expect(
      errorResult.toMarkdown({ name: "x.pdf", mimeType: "application/pdf", bytes: bytes("x") }),
    ).rejects.toThrow(/corrupt/);
    const thrown = new WorkersAiConverter(
      fakeAi({
        toMarkdown: async () => {
          throw new Error("boom");
        },
      }),
    );
    await expect(
      thrown.toMarkdown({ name: "x.docx", mimeType: "application/msword", bytes: bytes("x") }),
    ).rejects.toBeInstanceOf(ConversionError);
  });

  it("falls back to raw text for CSV/HTML when conversion fails", async () => {
    const conv = new WorkersAiConverter(
      fakeAi({
        toMarkdown: async () => {
          throw new Error("unsupported");
        },
      }),
    );
    const csv = await conv.toMarkdown({
      name: "a.csv",
      mimeType: "text/csv",
      bytes: bytes("a,b\n1,2"),
    });
    expect(csv.markdown).toBe("a,b\n1,2");
    const html = await conv.toMarkdown({
      name: "a.html",
      mimeType: "text/html",
      bytes: bytes("<p>Hello <b>world</b></p><script>x()</script>"),
    });
    expect(html.markdown.replace(/\s+/g, " ").trim()).toBe("Hello world");
  });
});

describe("rtfToText", () => {
  it("strips control words and keeps paragraphs", () => {
    const rtf =
      "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Hello \\b world\\b0.\\par Second \\{line\\}.\\par}";
    expect(rtfToText(rtf)).toBe("Hello world.\nSecond {line}.");
  });
  it("returns non-RTF text unchanged", () => {
    expect(rtfToText("plain")).toBe("plain");
  });
});
