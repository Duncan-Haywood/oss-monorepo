import { describe, expect, it } from "vitest";
import {
  TRANSFER_ALPHA,
  evaluateMethodTransfer,
  maxVentureScore,
  scoreVenture,
} from "./portfolio-transfer";
import { portfolioVentures } from "@/data/portfolio-ventures";

describe("portfolio venture dataset", () => {
  it("scores all eleven real ventures on the six-dimension rubric", () => {
    expect(portfolioVentures).toHaveLength(11);
    for (const venture of portfolioVentures) {
      expect(venture.dimensions).toHaveLength(6);
      expect(scoreVenture(venture)).toBeLessThanOrEqual(maxVentureScore(venture));
      expect(maxVentureScore(venture)).toBe(60);
    }
  });

  it("has no duplicate venture slugs", () => {
    const slugs = portfolioVentures.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("marks exactly the two in-repo tools dispatchable", () => {
    const dispatchable = portfolioVentures.filter((v) => v.dispatchable).map((v) => v.slug).sort();
    expect(dispatchable).toEqual(["ai-first-markets", "photos-import-tools"]);
  });
});

describe("evaluateMethodTransfer", () => {
  const result = evaluateMethodTransfer();

  it("ranks every venture exactly once", () => {
    expect(result.ranking).toHaveLength(portfolioVentures.length);
    expect(new Set(result.ranking.map((r) => r.venture.slug)).size).toBe(
      portfolioVentures.length,
    );
  });

  it("orders the ranking by composite score, highest first", () => {
    const scores = result.ranking.map((r) => scoreVenture(r.venture));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  // The load-bearing finding: dispatchability is orthogonal to business score,
  // so the idea-scoring method does NOT reproduce the router's split. If a
  // future rescore flips this, the hypothesis note must be revisited.
  it("refutes the transfer claim — dispatchable ventures do not cluster at the top", () => {
    expect(result.transfers).toBe(false);
    expect(result.pValue).toBeGreaterThan(TRANSFER_ALPHA);
    // Dispatchable ventures land a worse (higher) rank sum than random chance.
    expect(result.dispatchableRankSum).toBeGreaterThan(result.expectedRankSumUnderChance);
  });

  it("reports the exact rank-sum statistics behind that verdict", () => {
    expect(result.dispatchableRankSum).toBe(15);
    expect(result.expectedRankSumUnderChance).toBe(12);
    expect(result.pValue).toBeCloseTo(0.8364, 3);
  });

  it("still yields a usable pick: the top-scoring blocked venture", () => {
    expect(result.topBlocked.dispatchable).toBe(false);
    expect(result.topBlocked.slug).toBe("local-site-studio");
    // It outranks both dispatchable ventures on business merit.
    const blockedRank = result.ranking.find(
      (r) => r.venture.slug === result.topBlocked.slug,
    )!.rank;
    const dispatchableRanks = result.ranking
      .filter((r) => r.venture.dispatchable)
      .map((r) => r.rank);
    for (const rank of dispatchableRanks) expect(blockedRank).toBeLessThan(rank);
  });

  it("computes an exact p-value that is a valid probability", () => {
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});
