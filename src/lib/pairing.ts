/**
 * Adaptive pair selection. Goals, in priority order:
 *  1. Coverage — every item gets shown roughly the same number of times.
 *  2. Information gain — prefer pairing items with close ratings, since a
 *     near-toss-up comparison shrinks Glicko-2 variance the most.
 *  3. Uncertainty — bias toward items with high rating deviation (RD),
 *     since those are the ones the ranking is least confident about.
 *  4. Variety — avoid re-showing a pair that was just shown.
 * Selection is weighted-random (not deterministic top-1) so two runs with
 * identical state don't produce identical sequences.
 */

export type PairItem = {
  id: string;
  rating: number;
  rd: number;
  category?: string | null;
  /** Dimensions this item signals; first is primary. */
  dimensions?: string[];
};

export type PairingInput = {
  items: PairItem[];
  timesShown: Map<string, number>;
  recentPairKeys: Set<string>;
  /** How many questions this person has already answered in this survey. */
  answeredCount?: number;
};

/**
 * Coarse-to-fine progression. Early on, pair items from DIFFERENT
 * categories: a handful of cross-category comparisons pins down the broad
 * shape of someone's taste far faster than the same number of within-category
 * ones. Once that structure exists, switch to same-category pairs, which are
 * the genuinely hard discriminations and where the remaining uncertainty is.
 */
const COARSE_PHASE_ANSWERS = 12;
const FINE_PHASE_ANSWERS = 30;

export function sameCategoryBias(answeredCount: number): number {
  if (answeredCount <= COARSE_PHASE_ANSWERS) return 0.1;
  if (answeredCount >= FINE_PHASE_ANSWERS) return 0.8;
  const t = (answeredCount - COARSE_PHASE_ANSWERS) / (FINE_PHASE_ANSWERS - COARSE_PHASE_ANSWERS);
  return 0.1 + t * 0.7;
}

export function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("::");
}

function weightedPick<T>(items: T[], weight: (item: T) => number): T {
  const weights = items.map((i) => Math.max(weight(i), 0.0001));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function selectNextPair({
  items,
  timesShown,
  recentPairKeys,
  answeredCount = 0,
}: PairingInput): [string, string] {
  if (items.length < 2) throw new Error("Need at least 2 items to pair");

  const shownCounts = items.map((i) => timesShown.get(i.id) ?? 0);
  const avgShown = shownCounts.reduce((a, b) => a + b, 0) / items.length;

  const priority = (item: PairItem) => {
    const shown = timesShown.get(item.id) ?? 0;
    const underShownBonus = Math.max(0, avgShown - shown) * 60;
    return item.rd + underShownBonus;
  };

  const first = weightedPick(items, priority);
  const candidates = items.filter((i) => i.id !== first.id);

  // Early: reward crossing categories (broad structure). Later: reward
  // staying inside one (fine discrimination).
  const bias = sameCategoryBias(answeredCount);

  const firstDim = first.dimensions?.[0];

  const score = (other: PairItem) => {
    const ratingDiff = Math.abs(other.rating - first.rating);
    const closeness = 1 / (1 + ratingDiff / 100);
    const uncertaintyBonus = other.rd / 350;

    const sameCategory = !!first.category && first.category === other.category;
    const phaseFactor = sameCategory ? bias : 1 - bias;

    // A pair of items whose PRIMARY dimensions differ is the only kind that
    // produces a real trade-off observation ("what wins when warmth and
    // ambition collide"). Same-dimension pairs still refine the ranking, so
    // they aren't excluded — just weighted down.
    const otherDim = other.dimensions?.[0];
    const conflicts = !!firstDim && !!otherDim && firstDim !== otherDim;
    const conflictBonus = conflicts ? 1.5 : 1;

    const key = pairKey(first.id, other.id);
    const repeatPenalty = recentPairKeys.has(key) ? 0.05 : 1;
    return (closeness * 2 + uncertaintyBonus) * (0.25 + 1.75 * phaseFactor) * conflictBonus * repeatPenalty;
  };

  const second = weightedPick(candidates, score);
  return [first.id, second.id];
}

/** Picks two distinct identity items for a CONJOINED-survey trial, favoring under-shown items. */
export function selectIdentityPair(items: PairItem[], timesShown: Map<string, number>): [PairItem, PairItem] {
  if (items.length < 2) throw new Error("Need at least 2 items to pair");
  const shownCounts = items.map((i) => timesShown.get(i.id) ?? 0);
  const avgShown = shownCounts.reduce((a, b) => a + b, 0) / items.length;
  const priority = (item: PairItem) => {
    const shown = timesShown.get(item.id) ?? 0;
    return 1 + Math.max(0, avgShown - shown) * 3;
  };
  const first = weightedPick(items, priority);
  const second = weightedPick(
    items.filter((i) => i.id !== first.id),
    priority
  );
  return [first, second];
}

/** Simple aggregate confidence signal shown as a progress bar in the UI. */
export function surveyConfidence(items: { rd: number }[]): number {
  if (items.length === 0) return 0;
  const avgRd = items.reduce((sum, i) => sum + i.rd, 0) / items.length;
  const clamped = Math.min(350, Math.max(50, avgRd));
  return 1 - (clamped - 50) / (350 - 50);
}
