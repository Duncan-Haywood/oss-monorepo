import { describe, expect, it } from "vitest";
import { chunkMarkdown, DEFAULT_CHUNK_OPTIONS, estimateTokens } from "./chunk";

const sentence = (i: number) =>
  `Sentence number ${i} describes the carpentry and welding training cohort in Gallup.`;
const paragraph = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => sentence(from + i)).join(" ");

function expectSlices(md: string, chunks: ReturnType<typeof chunkMarkdown>) {
  for (const c of chunks) {
    expect(md.slice(c.charStart, c.charEnd)).toBe(c.text);
    expect(c.text).toBe(c.text.trim());
    expect(c.tokenEstimate).toBe(estimateTokens(c.text));
  }
}

describe("chunkMarkdown", () => {
  it("returns no chunks for empty or whitespace-only input", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n\n\t \n")).toEqual([]);
  });

  it("keeps a short document in one chunk with its heading", () => {
    const md = "# Mission\n\nWe build homes and skills on the Navajo Nation.\n";
    const chunks = chunkMarkdown(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("Mission");
    expect(chunks[0]?.text).toBe("# Mission\n\nWe build homes and skills on the Navajo Nation.");
    expect(chunks[0]?.charStart).toBe(0);
    expectSlices(md, chunks);
  });

  it("starts new chunks at headings and records the heading breadcrumb", () => {
    const md = [
      "# Southwest Indian Foundation",
      "",
      paragraph(0, 4),
      "",
      "## Programs",
      "",
      "### Workforce Development",
      "",
      paragraph(10, 4),
      "",
      "## Finances",
      "",
      paragraph(20, 4),
    ].join("\n");
    const chunks = chunkMarkdown(md, { targetTokens: 120, overlapTokens: 10 });
    expectSlices(md, chunks);
    expect(chunks.map((c) => c.heading)).toEqual([
      "Southwest Indian Foundation",
      "Southwest Indian Foundation > Programs > Workforce Development",
      "Southwest Indian Foundation > Finances",
    ]);
    // Headings are included at the start of their chunk, never dangling at the end of the previous one.
    expect(chunks[1]?.text.startsWith("## Programs\n\n### Workforce Development")).toBe(true);
    expect(chunks[0]?.text.includes("## Programs")).toBe(false);
  });

  it("merges tiny sections instead of emitting tiny chunks", () => {
    const md = "## A\n\nShort.\n\n## B\n\nAlso short.\n\n## C\n\nTiny.";
    const chunks = chunkMarkdown(md, { targetTokens: 200, overlapTokens: 20 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("A");
    expectSlices(md, chunks);
  });

  it("overlaps consecutive chunks within a long section", () => {
    const md = `## Outcomes\n\n${Array.from({ length: 12 }, (_, i) => paragraph(i * 3, 3)).join("\n\n")}`;
    const chunks = chunkMarkdown(md, { targetTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(3);
    expectSlices(md, chunks);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const next = chunks[i];
      if (!prev || !next) throw new Error("missing chunk");
      expect(next.charStart).toBeLessThan(prev.charEnd);
      expect(next.charStart).toBeGreaterThan(prev.charStart);
      expect(prev.text.endsWith(md.slice(next.charStart, prev.charEnd))).toBe(true);
      expect(prev.charEnd - next.charStart).toBeLessThanOrEqual(80);
      expect(next.heading).toBe("Outcomes");
    }
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(400);
    expect(chunks.at(-1)?.charEnd).toBe(md.length);
  });

  it("splits a single very long paragraph at sentence boundaries and covers all of it", () => {
    const md = paragraph(0, 80);
    const chunks = chunkMarkdown(md, { targetTokens: 100, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(5);
    expectSlices(md, chunks);
    expect(chunks[0]?.charStart).toBe(0);
    expect(chunks.at(-1)?.charEnd).toBe(md.length);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (!c) throw new Error("missing chunk");
      expect(c.text.length).toBeLessThanOrEqual(400);
      // No gaps between consecutive chunks.
      if (i > 0) expect(c.charStart).toBeLessThanOrEqual(chunks[i - 1]?.charEnd ?? 0);
      if (i < chunks.length - 1) expect(c.text.endsWith(".")).toBe(true);
      expect(c.heading).toBeNull();
    }
  });

  it("hard-splits text without any whitespace", () => {
    const md = "x".repeat(1000);
    const chunks = chunkMarkdown(md, { targetTokens: 50, overlapTokens: 0 });
    expectSlices(md, chunks);
    expect(chunks.map((c) => c.text).join("")).toBe(md);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(200);
  });

  it("does not treat # lines inside code fences as headings", () => {
    const md = "## Setup\n\n```sh\n# not a heading\n\necho hi\n```\n\nAfter the fence.";
    const chunks = chunkMarkdown(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("Setup");
    expectSlices(md, chunks);
  });

  it("handles CRLF line endings", () => {
    const md = "# Title\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph.\r\n";
    const chunks = chunkMarkdown(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("Title");
    expectSlices(md, chunks);
  });

  it("uses the 700/80 defaults and splits long tables by rows", () => {
    expect(DEFAULT_CHUNK_OPTIONS).toEqual({ targetTokens: 700, overlapTokens: 80 });
    const rows = Array.from(
      { length: 400 },
      (_, i) => `| ${2000 + (i % 26)} | Trainee ${i} | Carpentry |`,
    );
    const md = `| Year | Name | Trade |\n|---|---|---|\n${rows.join("\n")}`;
    const chunks = chunkMarkdown(md);
    expect(chunks.length).toBeGreaterThan(2);
    expectSlices(md, chunks);
    for (const c of chunks) {
      expect(c.tokenEstimate).toBeLessThanOrEqual(700);
      expect(c.text.endsWith("|")).toBe(true);
    }
  });
});
