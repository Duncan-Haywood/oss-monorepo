import { describe, expect, it } from "vitest";
import { formatChunksForPrompt } from "./format";
import { bm25, queryTerms, reciprocalRankFusion, stem, tokenize } from "./ranking";

describe("tokenize / stem", () => {
  it("drops stopwords, keeps numbers, stems consistently", () => {
    expect(tokenize("The Trades Training program in 2025")).toEqual([
      "trad",
      "train",
      "program",
      "2025",
    ]);
    expect(stem("trading")).toBe(stem("trades"));
    expect(stem("trained")).toBe(stem("training"));
    expect(stem("houses")).toBe(stem("housing"));
    expect(stem("communities")).toBe("community");
  });

  it("queryTerms are distinct, LIKE-safe and most specific first", () => {
    const terms = queryTerms("What is the workforce % program? program_100 o'neil's 'trades'");
    expect(new Set(terms).size).toBe(terms.length);
    for (const t of terms) expect(t).toMatch(/^[a-z0-9]+$/);
    expect(terms[0]).toBe("workforc");
    expect(queryTerms("the and of")).toEqual([]);
    expect(queryTerms("a b c d e f g h i j k l m n o p q r s t u v w x y z alpha", 3)).toHaveLength(
      1,
    );
  });
});

describe("bm25", () => {
  const docs = [
    { id: "a", text: "Carpentry and welding trades training for Navajo youth in Gallup." },
    { id: "b", text: "Our annual gala raised funds. The gala was fun." },
    { id: "c", text: "Trades trades trades. Trade apprenticeships and trades certification." },
    { id: "d", text: "Housing repairs for elders on the reservation." },
  ];

  it("scores only matching docs, higher tf ranks higher", () => {
    const out = bm25(docs, queryTerms("trades training"));
    expect(out.map((s) => s.id)).toEqual(expect.arrayContaining(["a", "c"]));
    expect(out.find((s) => s.id === "b")).toBeUndefined();
    expect(out.find((s) => s.id === "d")).toBeUndefined();
    for (const s of out) expect(s.score).toBeGreaterThan(0);
  });

  it("rare terms outweigh common ones (idf)", () => {
    const out = bm25(docs, queryTerms("trades navajo"), { totalDocs: 100 });
    expect(out[0]?.id).toBe("a");
  });

  it("returns [] for no terms or no docs", () => {
    expect(bm25(docs, [])).toEqual([]);
    expect(bm25([], ["trad"])).toEqual([]);
  });
});

describe("reciprocalRankFusion", () => {
  it("rewards items ranked well in both lists", () => {
    const fused = reciprocalRankFusion([{ ids: ["x", "y", "z"] }, { ids: ["y", "w", "x"] }]);
    expect(fused[0]?.id).toBe("y");
    expect(fused.map((f) => f.id)).toEqual(["y", "x", "w", "z"]);
  });

  it("normalizes to 0..1 with 1 = first in every list", () => {
    const fused = reciprocalRankFusion([{ ids: ["a", "b"] }, { ids: ["a"] }]);
    expect(fused[0]).toEqual({ id: "a", score: 1 });
    for (const f of fused) expect(f.score).toBeLessThanOrEqual(1);
  });

  it("works with one empty list (keyword-only fallback)", () => {
    const fused = reciprocalRankFusion([{ ids: [] }, { ids: ["k1", "k2"] }]);
    expect(fused.map((f) => f.id)).toEqual(["k1", "k2"]);
    expect(fused[0]?.score).toBe(1);
    expect(reciprocalRankFusion([{ ids: [] }, { ids: [] }])).toEqual([]);
  });

  it("ignores duplicate ids within one list and respects weights", () => {
    const fused = reciprocalRankFusion([
      { ids: ["a", "a", "b"], weight: 1 },
      { ids: ["b"], weight: 3 },
    ]);
    expect(fused[0]?.id).toBe("b");
  });
});

describe("formatChunksForPrompt", () => {
  const chunks = [
    { chunkId: "chk_1", documentTitle: "Annual [Report] | 2025", text: "We trained 40 people." },
    { chunkId: "chk_2", documentTitle: "Mission", text: "x".repeat(500) },
  ];

  it("renders [chk_id | title] blocks with a sanitized title", () => {
    const out = formatChunksForPrompt(chunks.slice(0, 1), 1000);
    expect(out).toBe("[chk_1 | Annual Report 2025] We trained 40 people.");
  });

  it("never exceeds maxChars and truncates the last block", () => {
    const out = formatChunksForPrompt(chunks, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).toContain("[chk_2 | Mission] xxx");
    expect(out.endsWith("…")).toBe(true);
    expect(formatChunksForPrompt(chunks, 10)).toBe("");
  });
});
