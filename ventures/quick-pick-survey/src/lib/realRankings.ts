/**
 * Replays the survey's own machinery on real people's rankings.
 *
 * Every earlier measurement (docs/CONVERGENCE.md, docs/INFORMATION-GAIN-SELECTOR.md)
 * drew respondents from a made-up logistic model. This takes published
 * rankings that real people wrote down (PrefLib "soc" files: one complete
 * strict order per person), lets each person answer the pairs the shipped
 * selector asks by their own order, rates them with the shipped Glicko-2
 * update, pools them with the shipped `groupRanking`, and scores the result
 * against the consensus of the people who were not asked.
 *
 * What is real: who prefers what, and how much people disagree. What is not:
 * the answering. A person's written ranking is taken as their answer to every
 * pair, so the only noise is the optional `lapse` share of coin-flip answers.
 * Used by scripts/real-rankings-eval.ts; results in docs/REAL-RANKINGS.md.
 */
import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import { clearlyAbove, groupRanking, type RangeRule, type RankedItem, type RatingRow } from "@/lib/groupRanking";
import { spearman } from "@/lib/infoGainSim";
import { pairKey, selectNextPair, selectNextPairByInformation, selectNextPairHybrid, type PairItem, type PairingInput } from "@/lib/pairing";

export type Panel = { names: string[]; orders: number[][] };

/**
 * Parses a PrefLib strict-complete-order file. Alternatives are numbered from 1
 * in the file; orders come back 0-based, best first, one per voter (a
 * "3: ..." line gives three identical voters).
 */
export function parseSoc(text: string): Panel {
  const names: string[] = [];
  const orders: number[][] = [];
  let declared: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const alt = /^# ALTERNATIVE NAME (\d+): (.*)$/.exec(line);
      if (alt) names[Number(alt[1]) - 1] = alt[2].trim();
      const n = /^# NUMBER ALTERNATIVES: (\d+)$/.exec(line);
      if (n) declared = Number(n[1]);
      continue;
    }
    const m = /^(\d+):\s*(.+)$/.exec(line);
    if (!m) throw new Error(`Not a soc order line: ${line.slice(0, 40)}`);
    if (m[2].includes("{")) throw new Error("Tied orders are not a soc file");
    const order = m[2].split(",").map((s) => Number(s.trim()) - 1);
    for (let c = 0; c < Number(m[1]); c++) orders.push(order);
  }
  const n = declared ?? names.length;
  // A missing name leaves a hole that .some() would skip, so index every slot.
  if (n < 2 || names.length !== n || Array.from({ length: n }, (_, i) => names[i]).some((x) => !x)) throw new Error("Alternative names missing");
  for (const o of orders) {
    if (o.length !== n || new Set(o).size !== n || o.some((x) => !(x >= 0 && x < n))) {
      throw new Error("An order does not rank every alternative exactly once");
    }
  }
  return { names, orders };
}

/** Mean position (0 = best) of each alternative over the given orders: the Borda consensus. */
export function meanPositions(orders: number[][], n: number): number[] {
  const sum = new Array<number>(n).fill(0);
  for (const o of orders) o.forEach((alt, pos) => (sum[alt] += pos));
  return sum.map((s) => s / Math.max(1, orders.length));
}

/** 1-based rank range of each alternative under a score where lower is better; ties share a range. */
export function rankRanges(score: number[]): { best: number; worst: number }[] {
  return score.map((s) => ({
    best: 1 + score.filter((t) => t < s - 1e-12).length,
    worst: score.filter((t) => t <= s + 1e-12).length,
  }));
}

export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "staged" is the survey setting of that name, with its default switch point. */
export type Selector = "shipped" | "information" | "staged" | "random";

function randomPair({ items, rand = Math.random }: PairingInput): [string, string] {
  const i = Math.floor(rand() * items.length);
  let j = Math.floor(rand() * (items.length - 1));
  if (j >= i) j++;
  return [items[i].id, items[j].id];
}

const SELECTORS: Record<Selector, (input: PairingInput) => [string, string]> = {
  shipped: selectNextPair,
  information: (input) => selectNextPairByInformation(input),
  staged: (input) => selectNextPairHybrid(input),
  random: randomPair,
};

/**
 * One respondent answering `budget` pairs by their own order, as the
 * /api/trials/next route would ask them (same inputs to the selector, the same
 * ten-pair repeat window, a fresh Glicko-2 state per person). Returns their
 * rows as the survey stores them.
 */
export function answerAsRespondent(order: number[], budget: number, selector: Selector, rand: () => number, lapse = 0, updateLapse = 0): RatingRow[] {
  const n = order.length;
  const position = new Array<number>(n);
  order.forEach((alt, pos) => (position[alt] = pos));
  const ids = Array.from({ length: n }, (_, i) => `alt-${i}`);
  const state = new Map<string, GlickoState>(ids.map((id) => [id, { ...DEFAULT_GLICKO_STATE }]));
  const timesShown = new Map<string, number>();
  const recent: string[] = [];
  for (let answered = 0; answered < budget; answered++) {
    const items: PairItem[] = ids.map((id) => ({ id, rating: state.get(id)!.rating, rd: state.get(id)!.rd, category: null }));
    const [aId, bId] = SELECTORS[selector]({ items, timesShown, recentPairKeys: new Set(recent), answeredCount: answered, rand });
    const a = Number(aId.slice(4));
    const b = Number(bId.slice(4));
    const firstWins = lapse > 0 && rand() < lapse ? rand() < 0.5 : position[a] < position[b];
    const next = applyComparison(state.get(aId)!, state.get(bId)!, firstWins ? "A" : "B", updateLapse);
    state.set(aId, next.a);
    state.set(bId, next.b);
    timesShown.set(aId, (timesShown.get(aId) ?? 0) + 1);
    timesShown.set(bId, (timesShown.get(bId) ?? 0) + 1);
    recent.push(pairKey(aId, bId));
    if (recent.length > 10) recent.shift();
  }
  return ids.map((id) => ({ itemId: id, rating: state.get(id)!.rating, rd: state.get(id)!.rd }));
}

export type PanelScore = {
  /** Spearman of the pooled ranking against the mean positions of the people not sampled. */
  vsPanel: number;
  /** Spearman against the mean positions of only the people sampled (what their answers could at best give). */
  vsSample: number;
  /** The pooled first place is a first place of the people not sampled. */
  top1: boolean;
  /** Share of options whose reported rank range holds their rank among the people not sampled. */
  rangeHolds: number;
  /** Mean width of the reported rank ranges, in ranks (1 = a single rank). */
  rangeWidth: number;
  /** Share of option pairs the report orders confidently (the same test the rank ranges use). */
  ordered: number;
  /** Of those confidently ordered pairs, the share the people not sampled order the other way. */
  orderedWrong: number;
};

/** Samples `respondents` people without replacement, has each answer `budget` pairs, pools, scores. */
export function scorePanel(panel: Panel, respondents: number, budget: number, selector: Selector, seed: number, lapse = 0, rule: RangeRule = "overlap", updateLapse = 0): PanelScore {
  const rand = mulberry32(seed);
  const n = panel.names.length;
  if (!(respondents >= 1 && respondents < panel.orders.length)) throw new Error("Need at least one respondent and someone left over to score against");
  const shuffled = panel.orders.map((o, i) => ({ o, k: rand(), i })).sort((x, y) => x.k - y.k || x.i - y.i).map((x) => x.o);
  const pick = shuffled.slice(0, respondents);
  // Scored against the people NOT asked: a new crowd from the same population.
  // Scoring against the whole panel would include the sampled people and
  // flatter large samples of a small panel.
  const others = shuffled.slice(respondents);
  const rows: RatingRow[] = [];
  for (const order of pick) rows.push(...answerAsRespondent(order, budget, selector, rand, lapse, updateLapse));
  const ranked = groupRanking(
    panel.names.map((label, i) => ({ id: `alt-${i}`, label })),
    rows,
    rule,
  );
  const byAlt = new Map<number, RankedItem>(ranked.map((r) => [Number(r.itemId.slice(4)), r]));
  const whole = meanPositions(others, n);
  const sample = meanPositions(pick, n);
  const pooled = Array.from({ length: n }, (_, i) => -byAlt.get(i)!.rating);
  const truthRange = rankRanges(whole);
  let holds = 0, width = 0;
  for (let i = 0; i < n; i++) {
    const r = byAlt.get(i)!;
    width += r.worstRank - r.bestRank + 1;
    if (r.bestRank <= truthRange[i].worst && r.worstRank >= truthRange[i].best) holds++;
  }
  let ordered = 0, wrong = 0, pairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs++;
      const ri = byAlt.get(i)!, rj = byAlt.get(j)!;
      const iAbove = clearlyAbove(ri, rj, rule), jAbove = clearlyAbove(rj, ri, rule);
      if (!iAbove && !jAbove) continue;
      ordered++;
      if ((iAbove && whole[i] > whole[j]) || (jAbove && whole[j] > whole[i])) wrong++;
    }
  }
  const bestWhole = Math.min(...whole);
  return {
    vsPanel: spearman(whole, pooled),
    vsSample: spearman(sample, pooled),
    top1: whole[Number(ranked[0].itemId.slice(4))] <= bestWhole + 1e-12,
    rangeHolds: holds / n,
    rangeWidth: width / n,
    ordered: ordered / pairs,
    orderedWrong: ordered === 0 ? 0 : wrong / ordered,
  };
}

export type CellSummary = { vsPanel: number; vsSample: number; top1: number; rangeHolds: number; rangeWidth: number; ordered: number; orderedWrong: number };

/** Means of `scorePanel` over `seeds` draws (seed 1..seeds). */
export function summarise(panel: Panel, respondents: number, budget: number, selector: Selector, seeds: number, lapse = 0, rule: RangeRule = "overlap", updateLapse = 0): CellSummary {
  const acc = { vsPanel: 0, vsSample: 0, top1: 0, rangeHolds: 0, rangeWidth: 0, ordered: 0, orderedWrong: 0 };
  for (let s = 1; s <= seeds; s++) {
    const r = scorePanel(panel, respondents, budget, selector, s * 7919 + respondents * 31 + budget, lapse, rule, updateLapse);
    acc.vsPanel += r.vsPanel;
    acc.vsSample += r.vsSample;
    acc.top1 += r.top1 ? 1 : 0;
    acc.rangeHolds += r.rangeHolds;
    acc.rangeWidth += r.rangeWidth;
    acc.ordered += r.ordered;
    acc.orderedWrong += r.orderedWrong;
  }
  for (const k of Object.keys(acc) as (keyof CellSummary)[]) acc[k] /= seeds;
  return acc;
}
