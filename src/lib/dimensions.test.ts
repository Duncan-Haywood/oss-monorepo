import { describe, expect, it } from "vitest";
import { describeDimensions, ScoredItem, scoreDimensions } from "./dimensions";

const item = (label: string, rating: number, rd: number, dimensions: string[]): ScoredItem => ({
  label,
  rating,
  rd,
  dimensions,
});

describe("scoreDimensions", () => {
  it("ranks a consistently-preferred dimension top", () => {
    const scores = scoreDimensions([
      item("kind", 1800, 100, ["warmth"]),
      item("patient", 1750, 100, ["warmth"]),
      item("ceo", 1200, 100, ["status"]),
      item("banker", 1250, 100, ["status"]),
    ]);
    expect(scores[0].key).toBe("warmth");
    expect(scores[scores.length - 1].key).toBe("status");
    expect(scores[0].delta).toBeGreaterThan(0);
  });

  it("ignores items that were never actually shown", () => {
    // rd >= 349 means the item is still at its untouched default.
    expect(scoreDimensions([item("unseen", 1500, 350, ["warmth"])])).toHaveLength(0);
  });

  it("ignores items carrying no dimensions", () => {
    expect(scoreDimensions([item("untagged", 1800, 80, [])])).toHaveLength(0);
  });

  it("lets a certain item outweigh an uncertain one", () => {
    // Same dimension, opposite signals: the low-RD (certain) item should win.
    const scores = scoreDimensions([
      item("certain-high", 1900, 40, ["warmth"]),
      item("unsure-low", 1100, 300, ["warmth"]),
      item("baseline", 1500, 40, ["status"]),
    ]);
    const warmth = scores.find((s) => s.key === "warmth")!;
    expect(warmth.score).toBeGreaterThan(1700);
  });

  it("counts an item toward every dimension it signals", () => {
    const scores = scoreDimensions([
      item("multi", 1800, 80, ["warmth", "family"]),
      item("other", 1400, 80, ["status"]),
    ]);
    expect(scores.find((s) => s.key === "warmth")!.n).toBe(1);
    expect(scores.find((s) => s.key === "family")!.n).toBe(1);
  });

  it("returns nothing for an empty input", () => {
    expect(scoreDimensions([])).toHaveLength(0);
  });
});

describe("describeDimensions", () => {
  it("says nothing when there isn't enough per-dimension data", () => {
    const scores = scoreDimensions([
      item("a", 1800, 80, ["warmth"]),
      item("b", 1200, 80, ["status"]),
    ]);
    // Only one item per dimension — below the n>=3 bar for a claim.
    expect(describeDimensions(scores, 20)).toBeNull();
  });

  it("hedges harder when the sample is small", () => {
    const many = [
      ...Array.from({ length: 4 }, (_, i) => item(`w${i}`, 1850, 60, ["warmth"])),
      ...Array.from({ length: 4 }, (_, i) => item(`s${i}`, 1150, 60, ["status"])),
    ];
    const scores = scoreDimensions(many);
    expect(describeDimensions(scores, 20)).toMatch(/^Early read/);
    expect(describeDimensions(scores, 150)).toMatch(/^Clear pattern/);
  });

  it("reports an even spread rather than inventing a lean", () => {
    const flat = [
      ...Array.from({ length: 4 }, (_, i) => item(`w${i}`, 1500, 60, ["warmth"])),
      ...Array.from({ length: 4 }, (_, i) => item(`s${i}`, 1505, 60, ["status"])),
    ];
    expect(describeDimensions(scoreDimensions(flat), 100)).toMatch(/fairly even/i);
  });
});
