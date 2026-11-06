/**
 * Pair mix of the staged (hybrid) selector against the shipped one, 1000 items,
 * 3000 answers, clean respondent, no database. The open question in
 * docs/INFORMATION-GAIN-SELECTOR.md ("The dip belongs to the staged selector"):
 * which pairs hurt settled items later on. Per 500 answers it logs the share of
 * pairs that are settled+settled, settled+open (one side rd >= 150) and
 * open+open, the share of pairs that touch an unseen item, the mean true gap of
 * the pair, and the Spearman of the "fixed set" (items rated at 500 answers).
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import { pairKey, selectNextPair, selectNextPairHybrid, type PairItem } from "@/lib/pairing";
import { spearman } from "@/lib/infoGainSim";

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

const SETTLED_RD = 150;
const N = Number(process.env.MIX_ITEMS ?? 1000);
const BUDGET = Number(process.env.MIX_ANSWERS ?? 3000);
const STEP = 500;

type Policy = typeof selectNextPair;

function run(policy: Policy, seed: number) {
  const rand = mulberry32(seed);
  const truth: number[] = [];
  const state: GlickoState[] = [];
  const items: PairItem[] = [];
  const timesShown = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    truth.push(rand() * 2 - 1);
    state.push({ ...DEFAULT_GLICKO_STATE });
    items.push({ id: `item-${String(i).padStart(4, "0")}`, rating: DEFAULT_GLICKO_STATE.rating, rd: DEFAULT_GLICKO_STATE.rd, category: `category-${i % 6}`, dimensions: [`dimension-${i % 4}`] });
  }
  const idx = new Map(items.map((it, i) => [it.id, i]));
  const recent: string[] = [];
  let firstPicks = 0;
  let fixed: number[] = [];
  const rows: Record<string, number>[] = [];
  let w = { ss: 0, so: 0, oo: 0, unseen: 0, gap: 0, n: 0 };
  for (let answered = 0; answered < BUDGET; answered++) {
    const live = items.map((it, i) => ({ ...it, rating: state[i].rating, rd: state[i].rd }));
    const [aId, bId] = policy({ items: live, timesShown, recentPairKeys: new Set(recent), answeredCount: answered, firstOptionShare: answered > 0 ? firstPicks / answered : undefined, rand });
    const a = idx.get(aId)!, b = idx.get(bId)!;
    const settled = (i: number) => state[i].rd < SETTLED_RD;
    const k = Number(settled(a)) + Number(settled(b));
    if (k === 2) w.ss++; else if (k === 1) w.so++; else w.oo++;
    if (!timesShown.get(aId) || !timesShown.get(bId)) w.unseen++;
    w.gap += Math.abs(truth[a] - truth[b]);
    w.n++;
    const pA = 1 / (1 + Math.exp(-2 * (truth[a] - truth[b])));
    const pickedFirst = rand() < pA;
    if (pickedFirst) firstPicks++;
    const r = applyComparison(state[a], state[b], pickedFirst ? "A" : "B");
    state[a] = r.a; state[b] = r.b;
    for (const id of [aId, bId]) timesShown.set(id, (timesShown.get(id) ?? 0) + 1);
    recent.push(pairKey(aId, bId));
    if (recent.length > 10) recent.shift();
    if ((answered + 1) % STEP === 0) {
      const rated = items.map((_, i) => i).filter((i) => timesShown.get(items[i].id));
      if (fixed.length === 0) fixed = rated;
      const sp = (set: number[]) => spearman(set.map((i) => truth[i]), set.map((i) => state[i].rating));
      rows.push({
        answers: answered + 1, rated: rated.length, all: +sp(rated).toFixed(3), fixed: +sp(fixed).toFixed(3),
        ss: +(w.ss / w.n).toFixed(3), so: +(w.so / w.n).toFixed(3), oo: +(w.oo / w.n).toFixed(3),
        unseen: +(w.unseen / w.n).toFixed(3), gap: +(w.gap / w.n).toFixed(3),
      });
      w = { ss: 0, so: 0, oo: 0, unseen: 0, gap: 0, n: 0 };
    }
  }
  return rows;
}

describe("pair mix, staged vs shipped", () => {
  it("logs pair classes and fixed-set Spearman per 500 answers", () => {
    const seeds = [11, 12, 13];
    const out: Record<string, Record<string, number>[]> = {};
    for (const [name, p] of [["shipped", selectNextPair], ["staged", (i: Parameters<Policy>[0]) => selectNextPairHybrid(i)]] as const) {
      const runs = seeds.map((s) => run(p, s));
      out[name] = runs[0].map((_, r) => {
        const row: Record<string, number> = {};
        for (const key of Object.keys(runs[0][r])) row[key] = +(runs.reduce((a, x) => a + x[r][key], 0) / runs.length).toFixed(3);
        return row;
      });
    }
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE pair mix ${JSON.stringify(out)}\n`);
    for (const rows of Object.values(out)) expect(rows.length).toBe(BUDGET / STEP);
  }, 3_000_000);
});
