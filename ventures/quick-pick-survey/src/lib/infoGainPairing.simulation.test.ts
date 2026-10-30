/**
 * Does choosing the pair by expected variance reduction beat the weighted-random
 * selector the app ships? Same synthetic respondent and Glicko-2 loop as
 * `pairing.simulation.test.ts`, 10 seeded respondents per cell.
 */
import { describe, expect, it } from "vitest";
import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import {
  expectedVarianceReduction,
  pairKey,
  selectNextPair,
  selectNextPairByInformation,
  selectNextPairHybrid,
  type InformationOptions,
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

type Policy = typeof selectNextPair;

/**
 * `lapse` is the share of answers given at random (an inconsistent respondent);
 * `positionBias` is the share of answers that take the first option shown whatever
 * the items are (negative: the second option). Both draw nothing extra at 0, so older seeds reproduce.
 */
export function simulate(policy: Policy, itemCount: number, budget: number, seed: number, lapse = 0, positionBias = 0) {
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
      firstOptionShare: answered > 0 ? firstPicks / answered : undefined,
      rand,
    });
    const pA = 1 / (1 + Math.exp(-2 * (truth.get(aId)! - truth.get(bId)!)));
    const pickedFirst = positionBias > 0 && rand() < positionBias ? true : positionBias < 0 && rand() < -positionBias ? false : lapse > 0 && rand() < lapse ? rand() < 0.5 : rand() < pA;
    if (pickedFirst) firstPicks++;
    const { a, b } = applyComparison(state.get(aId)!, state.get(bId)!, pickedFirst ? "A" : "B");
    state.set(aId, a);
    state.set(bId, b);
    timesShown.set(aId, (timesShown.get(aId) ?? 0) + 1);
    timesShown.set(bId, (timesShown.get(bId) ?? 0) + 1);
    recent.push(pairKey(aId, bId));
    if (recent.length > 10) recent.shift();
  }
  const entries = [...state.entries()];
  const under = (t: number) => entries.filter(([, s]) => s.rd < t).length;
  // Rank accuracy over every item, so a policy that finishes few items is not flattered.
  const rankAccuracy = spearman(
    entries.map(([id]) => truth.get(id)!),
    entries.map(([, s]) => s.rating)
  );
  return { under, rankAccuracy };
}

function spearman(xs: number[], ys: number[]): number {
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

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const seeds = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i * 7);

function compare(itemCount: number, budget: number, n = 10) {
  const run = (p: Policy) => {
    const rs = seeds(n).map((s) => simulate(p, itemCount, budget, s));
    return {
      under200: median(rs.map((r) => r.under(200))),
      under150: median(rs.map((r) => r.under(150))),
      rank: median(rs.map((r) => r.rankAccuracy)),
    };
  };
  const tuned = (opts: InformationOptions): Policy => (input) => selectNextPairByInformation(input, opts);
  return {
    shipped: run(selectNextPair),
    info: run(selectNextPairByInformation),
    conflict: run(tuned({ conflictBonus: 1.5 })),
    coverage: run(tuned({ conflictBonus: 1.5, coverageWeight: 0.5 })),
    hybrid: run((input) => selectNextPairHybrid(input)),
    hybrid60: run((input) => selectNextPairHybrid(input, { switchAt: 60 })),
    hybrid200: run((input) => selectNextPairHybrid(input, { switchAt: 200 })),
  };
}

describe("expectedVarianceReduction", () => {
  const mk = (rating: number, rd: number): PairItem => ({ id: "x", rating, rd });
  it("is larger for uncertain items than settled ones", () => {
    expect(expectedVarianceReduction(mk(1500, 300), mk(1500, 300))).toBeGreaterThan(
      expectedVarianceReduction(mk(1500, 80), mk(1500, 80))
    );
  });
  it("is larger for a toss-up than a lopsided pair", () => {
    expect(expectedVarianceReduction(mk(1500, 150), mk(1500, 150))).toBeGreaterThan(
      expectedVarianceReduction(mk(1500, 150), mk(2100, 150))
    );
  });
});

describe("information-gain selector vs the shipped selector", () => {
  for (const [items, budget] of [[41, 90], [41, 300], [220, 90], [220, 300]] as const) {
    it(`${items} items, ${budget} answers`, () => {
      const { shipped, info, conflict, coverage, hybrid, hybrid60, hybrid200 } = compare(items, budget);
      console.log(`MEASURE ${items} items ${budget} answers`, JSON.stringify({ shipped, info, conflict, coverage, hybrid, hybrid60, hybrid200 }));
      // Measured 2026-10-20 (docs/INFORMATION-GAIN-SELECTOR.md): rank accuracy is higher at every cell.
      expect(info.rank).toBeGreaterThan(shipped.rank);
      // Measured 2026-10-21: the hybrid (switch at 120 answers) never does worse than shipped on rank or rd<150.
      expect(hybrid.rank).toBeGreaterThanOrEqual(shipped.rank);
      expect(hybrid.under150).toBeGreaterThanOrEqual(shipped.under150);
    }, 120_000);
  }
});
