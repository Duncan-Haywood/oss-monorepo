import { describe, expect, it } from "vitest";
import {
  assessMethodTransfer,
  getVentureScoreRanking,
  maxVentureScore,
  scoreVenture,
} from "./transfer";
import { realVentures } from "@/data/ventures";

describe("real-venture scoring", () => {
  it("scores every venture on the same six dimensions the ideas use", () => {
    for (const v of realVentures) {
      expect(v.dimensions).toHaveLength(6);
      expect(maxVentureScore(v)).toBe(60);
      expect(scoreVenture(v)).toBe(v.dimensions.reduce((s, d) => s + d.score, 0));
      expect(scoreVenture(v)).toBeLessThanOrEqual(maxVentureScore(v));
    }
  });

  it("covers all 11 portfolio ventures exactly once", () => {
    expect(realVentures).toHaveLength(11);
    expect(new Set(realVentures.map((v) => v.slug)).size).toBe(11);
  });
});

describe("getVentureScoreRanking", () => {
  it("orders by composite score, highest first, and is a 1..N ranking", () => {
    const ranking = getVentureScoreRanking();
    const scores = ranking.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(ranking.map((r) => r.rank)).toEqual(
      Array.from({ length: realVentures.length }, (_, i) => i + 1),
    );
  });

  it("does not mutate the source data", () => {
    const before = realVentures.map((v) => v.slug);
    getVentureScoreRanking();
    expect(realVentures.map((v) => v.slug)).toEqual(before);
  });
});

describe("assessMethodTransfer — the VENTURE.yaml hypothesis under test", () => {
  it("uses the router's dispatchable split as ground truth (2 of 11)", () => {
    const result = assessMethodTransfer();
    expect(result.dispatchableCount).toBe(2);
    expect(result.dispatchableSlugs).toEqual([
      "ai-first-markets",
      "photos-import-tools",
    ]);
  });

  // The finding: the method does NOT transfer. The two dispatchable ventures
  // are not the two top scorers — they are near the bottom, because the six
  // dimensions measure business attractiveness while the router's split
  // measures start-readiness (evidence type + publication). This assertion
  // guards the finding: a future re-scoring that would flip it will fail here
  // and force the VENTURE.yaml note to be revisited deliberately.
  it("refutes the transfer claim: score ranking != dispatchable split", () => {
    const result = assessMethodTransfer();
    expect(result.transfers).toBe(false);
    expect(result.topKByScore).not.toEqual(result.dispatchableSlugs);
    // Both dispatchable ventures fall in the bottom half of the score ranking.
    for (const rank of result.dispatchableRanks) {
      expect(rank).toBeGreaterThan(realVentures.length / 2);
    }
  });

  it("explains why, in the reason string", () => {
    const result = assessMethodTransfer();
    expect(result.reason).toMatch(/evidence type|publication/);
  });

  // A synthetic control: if dispatchability WERE aligned with score, the same
  // function reports transfer=true. This proves the false result above is a
  // property of the data, not a function that can never return true.
  it("reports transfer=true when the top scorers are the dispatchable ones", () => {
    const ranked = getVentureScoreRanking();
    const topTwo = new Set(ranked.slice(0, 2).map((r) => r.slug));
    const aligned = realVentures.map((v) => ({
      ...v,
      dispatchable: topTwo.has(v.slug),
    }));
    expect(assessMethodTransfer(aligned).transfers).toBe(true);
  });
});
