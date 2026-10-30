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

/** One item's estimate under some other perspective of the same person. */
export type PriorEstimate = { rating: number; rd: number };

export type PairingInput = {
  items: PairItem[];
  timesShown: Map<string, number>;
  recentPairKeys: Set<string>;
  /** How many questions this person has already answered in this survey. */
  answeredCount?: number;
  /**
   * Share of this person's decided answers (not "equal") that picked the
   * first-listed option, 0 to 1. Only the staged hybrid reads it.
   */
  firstOptionShare?: number;
  /**
   * The same person's ratings for these items under their OTHER perspectives,
   * used only to choose which pair to show. See `selectionRating`.
   */
  priorRatings?: Map<string, PriorEstimate>;
  /**
   * Source of randomness for the weighted picks. Defaults to `Math.random`.
   *
   * Injectable so a simulation can be reproduced. Selection is deliberately
   * weighted-random rather than top-1, which means every convergence number
   * this repo quotes comes out of a stochastic process; without a seedable
   * stream those measurements cannot be re-derived, only re-rolled. The two
   * simulation suites pass a seeded PRNG, so a change in a median is a change
   * in the policy rather than a different roll.
   */
  rand?: () => number;
};

/**
 * Between-perspective spread, in Glicko rating points.
 *
 * How far one perspective's true rating of an item sits from another's. Taken
 * from the `tau` estimates in `docs/POOLING.md` — 60–91 at 90 answers per
 * perspective, 155–176 at 300 — rounded to the pessimistic end. Overstating it
 * is the safe direction: it weakens the prior's influence, so the worst case
 * is that selection falls back to what it did before.
 */
const BETWEEN_PERSPECTIVE_SD = 150;

/**
 * Cross-perspective priors for question selection. **Measured, and not wired
 * in — it buys nothing.** Kept, like `src/lib/pooling.ts`, so the finding is
 * reproducible rather than a claim in a document.
 *
 * ## The idea, which was a good one
 *
 * The informativeness term below prefers pairing items with close ratings,
 * because a near-toss-up shrinks Glicko-2's variance the most. But it reads
 * those ratings from the perspective being answered, and at the start of a
 * perspective every item sits at exactly 1500. Closeness is then identical for
 * every candidate, so the one term that decides how much each answer is worth
 * contributes nothing over the first several dozen questions — the stretch
 * where the budget is tightest. A person answers three perspectives over the
 * same items, and each restarts from that flat state having learned nothing
 * from the last.
 *
 * `docs/CONVERGENCE.md` listed this as the last of three ways to make the
 * couple screen reachable, and the only one `docs/POOLING.md` did not refute:
 * that document's objection is about what pooling does to an *estimate*, and a
 * pair chosen on prior data leaves the likelihood alone. A paired-comparison
 * likelihood does not depend on how the pair was chosen, so selecting on prior
 * data is ignorable — the same argument that already licenses every other
 * adaptive term here.
 *
 * ## What the measurement says
 *
 * Nothing. Across correlations of 0.37 to 0.85 and budgets of 90 and 300
 * answers, items reaching `rd < 200` and `rd < 150` move by at most one, in
 * both directions, and rank accuracy is flat to very slightly worse.
 *
 * The load-bearing run is the *oracle*: a prior that knows the truth exactly,
 * at `rd 20`. It changes nothing either. So the null is not "the prior is too
 * noisy to help" — it is that **the closeness term has almost no leverage over
 * how fast deviation falls.** Rating deviation is driven by how many
 * comparisons an item gets, which the coverage term and `activeSetSize` decide,
 * and `weightedPick` is soft enough that reshaping one multiplicative factor
 * barely moves the allocation.
 *
 * That is worth more than the feature would have been. It closes the third
 * option in `docs/CONVERGENCE.md`, and it says where the budget is *not* being
 * lost: no amount of cleverness about which pair to show next will make the
 * couple screen reachable. The remaining levers are the number of items and the
 * size of the promise.
 *
 * ## The blend, if it is ever revisited
 *
 * Precision-weighted, treating the prior as an observation carrying its own
 * deviation plus `BETWEEN_PERSPECTIVE_SD` of genuine between-perspective
 * disagreement. It dominates while this perspective knows nothing (rd 350
 * against a prior at rd 100 gives the prior ~79% of the weight) and fades out
 * on its own as answers arrive (at rd 100 the item's own rating carries ~76%).
 * Nothing switches at a threshold and nothing needs tuning per survey.
 *
 * @see src/lib/selectionPrior.simulation.test.ts — the measurement
 * @see docs/CONVERGENCE.md
 * @see docs/decisions/0007-no-selection-only-cross-perspective-priors.md
 */
export function selectionRating(item: PairItem, priorRatings?: Map<string, PriorEstimate>): number {
  const prior = priorRatings?.get(item.id);
  if (!prior) return item.rating;

  const ownPrecision = 1 / (item.rd * item.rd);
  const priorSd = Math.hypot(prior.rd, BETWEEN_PERSPECTIVE_SD);
  const priorPrecision = 1 / (priorSd * priorSd);
  return (item.rating * ownPrecision + prior.rating * priorPrecision) / (ownPrecision + priorPrecision);
}

/**
 * Progressive broadening.
 *
 * Spreading a fixed answer budget evenly over every item is the worst way to
 * spend it. An item needs roughly eight to twelve comparisons before its
 * rating deviation falls far enough to say anything about a person, and each
 * answer supplies two item-appearances. So a survey of N items needs about
 * 5N answers before *any* of it is usable, and until then every item sits
 * just below its starting deviation — a complete ranking, uniformly worthless.
 *
 * Measured against the real pairing and the real Glicko-2 update
 * (`pairing.simulation.test.ts`): the 220-item combined survey put zero items
 * under rd 150 after 300 answers, and the couple comparison needs rd < 150
 * before it carries signal. Nobody answers 1,100 questions.
 *
 * The fix is to deepen before broadening. Only the first `activeSetSize`
 * items are eligible for pairing; the set starts at a core small enough to
 * finish and grows as answers arrive, so a person who stops early has a
 * small ranking they can trust rather than a large one they cannot. Items
 * outside the set keep the default deviation, which already excludes them
 * from every results screen.
 */
export const CORE_SET_SIZE = 14;

/** Item-appearances to aim for per active item before admitting more items. */
const APPEARANCES_PER_ITEM = 10;

/**
 * A survey this size or smaller is left alone. Its whole set already reaches
 * the bar inside a session someone will sit through, so staging it would only
 * postpone items that were going to finish anyway — measured as a real if
 * small loss on the 16- and 20-item surveys.
 */
const NO_STAGING_BELOW = 21;

export function activeSetSize(answeredCount: number, totalItems: number): number {
  if (totalItems <= NO_STAGING_BELOW) return totalItems;
  const earned = Math.floor((2 * answeredCount) / APPEARANCES_PER_ITEM);
  return Math.min(totalItems, Math.max(CORE_SET_SIZE, CORE_SET_SIZE + earned));
}

/**
 * Stable admission order: round-robin across categories, alphabetical within
 * each. Deterministic, so the set only ever grows between requests — an item
 * that has collected answers can never drop out and strand them — and
 * category-balanced, so the early core spans the space instead of covering
 * one corner of it.
 */
export function admissionOrder(items: PairItem[]): PairItem[] {
  const byCategory = new Map<string, PairItem[]>();
  for (const item of items) {
    const key = item.category ?? "";
    const group = byCategory.get(key);
    if (group) group.push(item);
    else byCategory.set(key, [item]);
  }

  const groups = [...byCategory.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, group]) => group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));

  const ordered: PairItem[] = [];
  for (let round = 0; ordered.length < items.length; round++) {
    for (const group of groups) {
      if (round < group.length) ordered.push(group[round]);
    }
  }
  return ordered;
}

/**
 * The items eligible for pairing right now. Anything already shown stays in
 * regardless of where the growing window has reached, so a set that shrinks
 * because items were seeded in a different order cannot strand answers.
 */
export function activeItems(
  items: PairItem[],
  answeredCount: number,
  timesShown: Map<string, number>
): PairItem[] {
  const size = activeSetSize(answeredCount, items.length);
  if (size >= items.length) return items;

  const ordered = admissionOrder(items);
  const active = new Set(ordered.slice(0, size).map((i) => i.id));
  for (const item of items) {
    if ((timesShown.get(item.id) ?? 0) > 0) active.add(item.id);
  }
  return items.filter((i) => active.has(i.id));
}

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

function weightedPick<T>(items: T[], weight: (item: T) => number, rand: () => number = Math.random): T {
  const weights = items.map((i) => Math.max(weight(i), 0.0001));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rand() * total;
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
  priorRatings,
  rand = Math.random,
}: PairingInput): [string, string] {
  if (items.length < 2) throw new Error("Need at least 2 items to pair");

  // Deepen a core set before broadening — see activeSetSize above.
  const pool = activeItems(items, answeredCount, timesShown);

  const shownCounts = pool.map((i) => timesShown.get(i.id) ?? 0);
  const avgShown = shownCounts.reduce((a, b) => a + b, 0) / pool.length;

  const priority = (item: PairItem) => {
    const shown = timesShown.get(item.id) ?? 0;
    const underShownBonus = Math.max(0, avgShown - shown) * 60;
    return item.rd + underShownBonus;
  };

  const first = weightedPick(pool, priority, rand);
  const candidates = pool.filter((i) => i.id !== first.id);

  // Early: reward crossing categories (broad structure). Later: reward
  // staying inside one (fine discrimination).
  const bias = sameCategoryBias(answeredCount);

  const firstDim = first.dimensions?.[0];
  // Only the closeness term reads this. The uncertainty term below stays on
  // the item's OWN rd on purpose: the point is to measure what THIS
  // perspective is unsure about, which another perspective cannot tell us.
  const firstSelectionRating = selectionRating(first, priorRatings);

  const score = (other: PairItem) => {
    const ratingDiff = Math.abs(selectionRating(other, priorRatings) - firstSelectionRating);
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

  const second = weightedPick(candidates, score, rand);
  return [first.id, second.id];
}

/**
 * Expected-information pair selection, an alternative to `selectNextPair`.
 *
 * Scores every candidate pair by how much one answer is expected to shrink the
 * two items' rating variance under the Glicko model: an answer carries
 * Fisher information `g(phi_opp)^2 * p * (1 - p)` for each side, so a pair
 * gains most when both ratings are uncertain and the outcome is close to a
 * coin flip. The pair with the largest summed variance reduction wins; ties and
 * a just-shown pair are handled by `repeatPenalty`. Deterministic given the
 * state, apart from the optional `rand` tie-breaker.
 *
 * Measured against `selectNextPair` in `infoGainPairing.simulation.test.ts`.
 */
const GLICKO_SCALE = 173.7178;

function glickoG(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** Expected total drop in squared rating deviation (Glicko scale) from one answer. */
export function expectedVarianceReduction(a: PairItem, b: PairItem): number {
  const phiA = a.rd / GLICKO_SCALE;
  const phiB = b.rd / GLICKO_SCALE;
  const mu = (a.rating - b.rating) / GLICKO_SCALE;
  const p = 1 / (1 + Math.exp(-glickoG(Math.hypot(phiA, phiB) / Math.SQRT2) * mu));
  const spread = p * (1 - p);
  const drop = (phi: number, phiOpp: number) => {
    const gain = glickoG(phiOpp) ** 2 * spread;
    return phi * phi - 1 / (1 / (phi * phi) + gain);
  };
  return (drop(phiA, phiB) + drop(phiB, phiA)) * GLICKO_SCALE * GLICKO_SCALE;
}

export type InformationOptions = {
  /** Multiplier for a pair whose primary dimensions differ (the shipped selector uses 1.5). */
  conflictBonus?: number;
  /** Extra weight per appearance an item is below the pool average, as a fraction of the score. */
  coverageWeight?: number;
  /** Most items scored pairwise; the rest wait. Cost is quadratic in the pool. Default INFO_POOL_CAP. */
  poolCap?: number;
};

/**
 * Past this many active items the information score keeps only the most
 * uncertain ones (largest rd, then least shown), so a 2,000-item list costs
 * what a 400-item one does. Lists up to the cap are untouched.
 */
export const INFO_POOL_CAP = 400;

export function capPool(pool: PairItem[], timesShown: Map<string, number>, cap: number): PairItem[] {
  if (pool.length <= cap) return pool;
  return [...pool]
    .sort((a, b) => b.rd - a.rd || (timesShown.get(a.id) ?? 0) - (timesShown.get(b.id) ?? 0) || (a.id < b.id ? -1 : 1))
    .slice(0, Math.max(2, cap));
}

export function selectNextPairByInformation(
  { items, timesShown, recentPairKeys, answeredCount = 0, rand = Math.random }: PairingInput,
  { conflictBonus = 1, coverageWeight = 0, poolCap = INFO_POOL_CAP }: InformationOptions = {}
): [string, string] {
  if (items.length < 2) throw new Error("Need at least 2 items to pair");
  const pool = capPool(activeItems(items, answeredCount, timesShown), timesShown, poolCap);
  const avgShown = pool.reduce((sum, i) => sum + (timesShown.get(i.id) ?? 0), 0) / pool.length;
  const lag = (i: PairItem) => Math.max(0, avgShown - (timesShown.get(i.id) ?? 0));

  let best: [string, string] | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const repeatPenalty = recentPairKeys.has(pairKey(pool[i].id, pool[j].id)) ? 0.05 : 1;
      // A sliver of noise breaks exact ties (all-default start) without
      // reordering pairs whose scores differ.
      const da = pool[i].dimensions?.[0];
      const db = pool[j].dimensions?.[0];
      const conflict = da && db && da !== db ? conflictBonus : 1;
      const coverage = 1 + coverageWeight * (lag(pool[i]) + lag(pool[j]));
      const score =
        expectedVarianceReduction(pool[i], pool[j]) * repeatPenalty * conflict * coverage * (1 + rand() * 1e-6);
      if (score > bestScore) {
        bestScore = score;
        best = [pool[i].id, pool[j].id];
      }
    }
  }
  return best!;
}

/**
 * Staged hybrid: the shipped selector while `answeredCount` is below
 * `switchAt`, the information selector after. The shipped one finishes more
 * items early (the bar the couple screen needs); the information one wins on
 * rank accuracy and on items under rd 150 once there are enough answers.
 * Measured in `infoGainPairing.simulation.test.ts`.
 */
export const HYBRID_SWITCH_ANSWERS = 120;

/**
 * A person whose first-option share is at or above this has too many answers
 * that carry no signal for the information selector (it fell to 0.421 against
 * 0.632 shipped at 300 answers and first-option bias 0.5, a share near 0.75;
 * docs/INFORMATION-GAIN-SELECTOR.md). Slots are randomised, so an unbiased
 * share sits near 0.5.
 */
export const FIRST_OPTION_FALLBACK_SHARE = 0.7;

/** True when the first-option share is far from half in either direction (first or second option favoured). */
function positionBiased(share: number | undefined): boolean {
  return share !== undefined && (share >= FIRST_OPTION_FALLBACK_SHARE || share <= 1 - FIRST_OPTION_FALLBACK_SHARE);
}

export function selectNextPairHybrid(
  input: PairingInput,
  { switchAt = HYBRID_SWITCH_ANSWERS, ...options }: InformationOptions & { switchAt?: number } = {}
): [string, string] {
  return (input.answeredCount ?? 0) < switchAt || positionBiased(input.firstOptionShare)
    ? selectNextPair(input)
    : selectNextPairByInformation(input, options);
}

/** Picks two distinct identity items for a CONJOINED-survey trial, favoring under-shown items. */
export function selectIdentityPair(
  items: PairItem[],
  timesShown: Map<string, number>,
  rand: () => number = Math.random
): [PairItem, PairItem] {
  if (items.length < 2) throw new Error("Need at least 2 items to pair");
  const shownCounts = items.map((i) => timesShown.get(i.id) ?? 0);
  const avgShown = shownCounts.reduce((a, b) => a + b, 0) / items.length;
  const priority = (item: PairItem) => {
    const shown = timesShown.get(item.id) ?? 0;
    return 1 + Math.max(0, avgShown - shown) * 3;
  };
  const first = weightedPick(items, priority, rand);
  const second = weightedPick(
    items.filter((i) => i.id !== first.id),
    priority,
    rand
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
