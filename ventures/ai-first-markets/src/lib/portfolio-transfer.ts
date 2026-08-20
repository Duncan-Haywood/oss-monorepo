import type { MethodTransferResult, PortfolioVenture } from "./types";
import { portfolioVentures } from "@/data/portfolio-ventures";

// The decision rule is fixed before the scores are read, so the result cannot
// be tuned to the answer. With eleven ventures and two dispatchable ones the
// smallest attainable p-value is 2/55 ≈ 0.036, so 0.05 is the only threshold
// this test can distinguish at all.
export const TRANSFER_ALPHA = 0.05;

export function scoreVenture(venture: PortfolioVenture): number {
  return venture.dimensions.reduce((sum, d) => sum + d.score, 0);
}

export function maxVentureScore(venture: PortfolioVenture): number {
  return venture.dimensions.reduce((sum, d) => sum + d.maxScore, 0);
}

// Ventures ordered by composite score, highest first, with ties sharing the
// average of the ranks they span (so the rank sum below stays unbiased).
function rankByScore(ventures: PortfolioVenture[]) {
  const scored = [...ventures]
    .map((venture) => ({ venture, score: scoreVenture(venture) }))
    .sort((a, b) => b.score - a.score);

  const ranked: { venture: PortfolioVenture; score: number; rank: number }[] = [];
  for (let i = 0; i < scored.length; ) {
    let j = i;
    while (j < scored.length && scored[j].score === scored[i].score) j++;
    const averageRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranked.push({ ...scored[k], rank: averageRank });
    }
    i = j;
  }
  return ranked;
}

// Exact one-tailed rank-sum test: over every way of choosing `k` of the
// ventures, what fraction land a rank sum at least as good (as low) as the one
// the dispatchable ventures actually got. Enumerated rather than approximated
// because portfolio-scale n makes that cheap and removes the normal
// approximation's small-sample error.
function exactRankSumPValue(ranks: number[], k: number, observed: number): number {
  let atLeastAsExtreme = 0;
  let total = 0;

  const walk = (start: number, chosen: number, sum: number) => {
    if (chosen === k) {
      total++;
      // Tolerance absorbs the halves that averaged ranks introduce.
      if (sum <= observed + 1e-9) atLeastAsExtreme++;
      return;
    }
    for (let i = start; i <= ranks.length - (k - chosen); i++) {
      walk(i + 1, chosen + 1, sum + ranks[i]);
    }
  };
  walk(0, 0, 0);

  return atLeastAsExtreme / total;
}

// Tests the claim that scoring the portfolio's own ventures on the idea map's
// six dimensions reproduces the router's dispatchable/blocked split — i.e. that
// dispatchable ventures cluster at the top of the score ranking.
export function evaluateMethodTransfer(
  ventures: PortfolioVenture[] = portfolioVentures,
): MethodTransferResult {
  const ranking = rankByScore(ventures);
  const dispatchable = ranking.filter((r) => r.venture.dispatchable);

  const dispatchableRankSum = dispatchable.reduce((sum, r) => sum + r.rank, 0);
  const expectedRankSumUnderChance = (dispatchable.length * (ventures.length + 1)) / 2;
  const pValue = exactRankSumPValue(
    ranking.map((r) => r.rank),
    dispatchable.length,
    dispatchableRankSum,
  );

  return {
    ranking,
    dispatchableRankSum,
    expectedRankSumUnderChance,
    pValue,
    alpha: TRANSFER_ALPHA,
    transfers: pValue <= TRANSFER_ALPHA,
    topBlocked: ranking.find((r) => !r.venture.dispatchable)!.venture,
  };
}
