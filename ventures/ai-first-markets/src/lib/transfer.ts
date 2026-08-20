import { realVentures, type RealVenture } from "@/data/ventures";

// Composite of a real venture's six dimension scores — same equal-weight sum
// scoreIdea() uses for the hypothetical ideas, so the two are comparable.
export function scoreVenture(v: RealVenture): number {
  return v.dimensions.reduce((sum, d) => sum + d.score, 0);
}

export function maxVentureScore(v: RealVenture): number {
  return v.dimensions.reduce((sum, d) => sum + d.maxScore, 0);
}

export interface RankedVenture {
  slug: string;
  score: number;
  dispatchable: boolean;
  rank: number; // 1-indexed position in the composite-score ranking
}

// Real ventures ordered by composite score, highest first. Ties break by slug
// so the order is deterministic.
export function getVentureScoreRanking(
  ventures: RealVenture[] = realVentures,
): RankedVenture[] {
  return [...ventures]
    .sort((a, b) => scoreVenture(b) - scoreVenture(a) || a.slug.localeCompare(b.slug))
    .map((v, i) => ({
      slug: v.slug,
      score: scoreVenture(v),
      dispatchable: v.dispatchable,
      rank: i + 1,
    }));
}

export interface MethodTransferResult {
  // True iff the top-k composite scorers (k = number of dispatchable ventures)
  // are exactly the dispatchable set — i.e. the business-quality ranking
  // reproduces the router's dispatchable-vs-blocked split.
  transfers: boolean;
  dispatchableCount: number;
  ranking: RankedVenture[];
  // 1-indexed positions of the dispatchable ventures within `ranking`.
  dispatchableRanks: number[];
  // The k slugs the router calls dispatchable, and the top-k slugs by score.
  dispatchableSlugs: string[];
  topKByScore: string[];
  reason: string;
}

// Tests whether scoring the real ventures on the six dimensions reproduces the
// router's dispatchable-vs-blocked split. For the map's method to "transfer"
// from the 8 hypothetical ideas to real ventures, the ventures a session can
// actually start (dispatchable) would have to be the ones the scoring ranks
// highest. They are not — dispatchability is set by evidence type and
// publication status, which none of the six business dimensions measures.
export function assessMethodTransfer(
  ventures: RealVenture[] = realVentures,
): MethodTransferResult {
  const ranking = getVentureScoreRanking(ventures);
  const dispatchableSlugs = ventures
    .filter((v) => v.dispatchable)
    .map((v) => v.slug)
    .sort();
  const k = dispatchableSlugs.length;
  const topKByScore = ranking.slice(0, k).map((r) => r.slug).sort();
  const dispatchableRanks = ranking
    .filter((r) => r.dispatchable)
    .map((r) => r.rank)
    .sort((a, b) => a - b);

  const transfers =
    k > 0 &&
    topKByScore.length === dispatchableSlugs.length &&
    topKByScore.every((slug, i) => slug === dispatchableSlugs[i]);

  const reason = transfers
    ? `The ${k} dispatchable ventures are exactly the top ${k} by composite score.`
    : `The ${k} dispatchable ventures rank ${dispatchableRanks.join(
        " and ",
      )} of ${ranking.length} by composite score, not the top ${k}. ` +
      `Business-quality score does not reproduce the router's split, because ` +
      `dispatchability is a function of evidence type and publication status — ` +
      `neither of which is one of the six scored dimensions.`;

  return {
    transfers,
    dispatchableCount: k,
    ranking,
    dispatchableRanks,
    dispatchableSlugs,
    topKByScore,
    reason,
  };
}
