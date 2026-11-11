/**
 * Synthetic respondent and Glicko-2 loop shared by the *.simulation.test.ts files.
 * A plain module, not a test file: importing a test file registers its tests again
 * in every importer (each poolCap/longBudget/... file re-ran the infoGain suite).
 */
import { applyComparison, DEFAULT_GLICKO_STATE, GLICKO_SCALE, ratingToLogit, type GlickoState } from "@/lib/glicko2";
import {
  AGREEMENT_WINDOW,
  answerAgreement,
  FIRST_OPTION_MIN_DECIDED,
  type DecidedPick,
  pairKey,
  selectNextPair,
  type PairItem,
} from "@/lib/pairing";

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Policy = typeof selectNextPair;

/**
 * `lapse` is the share of answers given at random (an inconsistent respondent);
 * `positionBias` is the share of answers that take the first option shown whatever
 * the items are (negative: the second option). Both draw nothing extra at 0, so older seeds reproduce.
 * `updateLapse` is the lapse share the Glicko update assumes (glicko2.ts; 0 is the published update).
 * `coverage95` is the share of item pairs whose 95% interval on the rating
 * difference, sqrt(rd_a^2 + rd_b^2) wide each side, holds the true difference
 * (truth is on a logit scale with slope 2, so true mu difference = 2 dt).
 */
export function simulate(policy: Policy, itemCount: number, budget: number, seed: number, lapse = 0, positionBias = 0, lapseFrom = 0, useAgreement = false, onAnswer?: (answered: number, rds: number[]) => void, updateLapse = 0) {
  const rand = mulberry32(seed);
  const truth = new Map<string, number>();
  const state = new Map<string, GlickoState>();
  const timesShown = new Map<string, number>();
  const items: PairItem[] = [];
  for (let i = 0; i < itemCount; i++) {
    const id = `item-${String(i).padStart(3, "0")}`;
    truth.set(id, rand() * 2 - 1);
    state.set(id, { ...DEFAULT_GLICKO_STATE });
    items.push({
      id,
      rating: DEFAULT_GLICKO_STATE.rating,
      rd: DEFAULT_GLICKO_STATE.rd,
      category: `category-${i % 6}`,
      dimensions: [`dimension-${i % 4}`],
    });
  }
  const recent: string[] = [];
  const picks: DecidedPick[] = [];
  let firstPicks = 0;
  for (let answered = 0; answered < budget; answered++) {
    const live = items.map((item) => {
      const s = state.get(item.id)!;
      return { ...item, rating: s.rating, rd: s.rd };
    });
    const [aId, bId] = policy({
      items: live,
      timesShown,
      recentPairKeys: new Set(recent),
      answeredCount: answered,
      // As the route: no share until FIRST_OPTION_MIN_DECIDED answers (it was
      // passed from the first answer before 2026-11-10, which only mattered
      // once the staged selector could switch before 120 answers).
      firstOptionShare: answered >= FIRST_OPTION_MIN_DECIDED ? firstPicks / answered : undefined,
      answerAgreement: useAgreement ? answerAgreement(picks.slice(-AGREEMENT_WINDOW)) : undefined,
      rand,
    });
    const pA = 1 / (1 + Math.exp(-2 * (truth.get(aId)! - truth.get(bId)!)));
    const pickedFirst = positionBias > 0 && rand() < positionBias ? true : positionBias < 0 && rand() < -positionBias ? false : lapse > 0 && answered >= lapseFrom && rand() < lapse ? rand() < 0.5 : rand() < pA;
    if (pickedFirst) firstPicks++;
    { const sa = state.get(aId)!, sb = state.get(bId)!; picks.push(pickedFirst ? { picked: sa.rating, other: sb.rating, pickedRd: sa.rd, otherRd: sb.rd } : { picked: sb.rating, other: sa.rating, pickedRd: sb.rd, otherRd: sa.rd }); }
    const { a, b } = applyComparison(state.get(aId)!, state.get(bId)!, pickedFirst ? "A" : "B", updateLapse);
    state.set(aId, a);
    state.set(bId, b);
    timesShown.set(aId, (timesShown.get(aId) ?? 0) + 1);
    timesShown.set(bId, (timesShown.get(bId) ?? 0) + 1);
    recent.push(pairKey(aId, bId));
    if (recent.length > 10) recent.shift();
    onAnswer?.(answered + 1, [...state.values()].map((s) => s.rd));
  }
  const entries = [...state.entries()];
  const under = (t: number) => entries.filter(([, s]) => s.rd < t).length;
  // Rank accuracy over every item, so a policy that finishes few items is not flattered.
  const rankAccuracy = spearman(
    entries.map(([id]) => truth.get(id)!),
    entries.map(([, s]) => s.rating)
  );
  let pairs = 0, held = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ia, sa] = entries[i], [ib, sb] = entries[j];
      const est = ratingToLogit(sa.rating) - ratingToLogit(sb.rating);
      const real = 2 * (truth.get(ia)! - truth.get(ib)!);
      const half = (1.96 * Math.hypot(sa.rd, sb.rd)) / GLICKO_SCALE;
      pairs++;
      if (Math.abs(est - real) <= half) held++;
    }
  }
  const coverage95 = pairs === 0 ? 1 : held / pairs;
  return { under, rankAccuracy, coverage95, touched: timesShown.size, truth };
}

export function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => {
    const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    order.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const m = (n - 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - m) * (ry[i] - m);
    dx += (rx[i] - m) ** 2;
    dy += (ry[i] - m) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}
