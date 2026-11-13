/**
 * The pair-mix run behind pairMix.simulation.test.ts (moved here unchanged, so
 * a worker thread can import it; not a test file). One seeded run of the
 * shipped or staged selector, logged per 500 answers. The env knobs (MIX_*)
 * are read here as before; worker threads inherit process.env.
 *
 * `pairMixParallel` gives the same rows as calling `pairMixRun` in a loop, but
 * runs each (selector, seed) pair on its own worker thread (pairMix.worker.ts):
 * pairMix was the simulation suite's floor once the pool-cap cells went
 * parallel (docs/history/ci-perf-2026-11-13-qps-pairmix-workers.md). Each run
 * is seeded and shares nothing; pairMix.test.ts pins the two paths equal.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
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
export const N = Number(process.env.MIX_ITEMS ?? 1000);
export const BUDGET = Number(process.env.MIX_ANSWERS ?? 3000);
export const STEP = 500;
// MIX_ANSWERER=noiseless: the higher true value always wins, as in the route tests
// (noisyRespondents / deepBudget); default is the logistic answerer.
const NOISELESS = process.env.MIX_ANSWERER === "noiseless";

// MIX_ROUTE=1 mimics what /api/trials/next adds to the call: no injected rand
// (the selector uses Math.random), a first-option share only after 30 decided
// answers (slot A share), and a random A/B slot shuffle before the answer.
const ROUTE = process.env.MIX_ROUTE === "1";
// MIX_TRUTH_ORDER=1: the hidden value falls with the item's position (item-0000 best),
// as in the route tests (lower sortOrder wins) and unlike the loop's random truth.
const TRUTH_ORDER = process.env.MIX_TRUTH_ORDER === "1";
export const ONLY_SELECTOR = process.env.MIX_SELECTOR; // "staged" | "shipped"

type Policy = typeof selectNextPair;

function run(policy: Policy, seed: number, n = N, budget = BUDGET) {
  const rand = mulberry32(seed);
  const truth: number[] = [];
  const state: GlickoState[] = [];
  const items: PairItem[] = [];
  const timesShown = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    truth.push(TRUTH_ORDER ? 1 - (2 * i) / (n - 1) : rand() * 2 - 1);
    state.push({ ...DEFAULT_GLICKO_STATE });
    items.push({ id: `item-${String(i).padStart(4, "0")}`, rating: DEFAULT_GLICKO_STATE.rating, rd: DEFAULT_GLICKO_STATE.rd, category: `category-${i % 6}`, dimensions: [`dimension-${i % 4}`] });
  }
  const idx = new Map(items.map((it, i) => [it.id, i]));
  const recent: string[] = [];
  let firstPicks = 0;
  let fixed: number[] = [];
  const rows: Record<string, number>[] = [];
  let w = { ss: 0, so: 0, oo: 0, unseen: 0, gap: 0, n: 0 };
  for (let answered = 0; answered < budget; answered++) {
    const live = items.map((it, i) => ({ ...it, rating: state[i].rating, rd: state[i].rd }));
    const [pickedA, pickedB] = policy({ items: live, timesShown, recentPairKeys: new Set(recent), answeredCount: answered, firstOptionShare: ROUTE ? (answered >= 30 ? firstPicks / answered : undefined) : answered > 0 ? firstPicks / answered : undefined, ...(ROUTE ? {} : { rand }) });
    const [aId, bId] = ROUTE && rand() < 0.5 ? [pickedB, pickedA] : [pickedA, pickedB];
    const a = idx.get(aId)!, b = idx.get(bId)!;
    const settled = (i: number) => state[i].rd < SETTLED_RD;
    const k = Number(settled(a)) + Number(settled(b));
    if (k === 2) w.ss++; else if (k === 1) w.so++; else w.oo++;
    if (!timesShown.get(aId) || !timesShown.get(bId)) w.unseen++;
    w.gap += Math.abs(truth[a] - truth[b]);
    w.n++;
    const pA = 1 / (1 + Math.exp(-2 * (truth[a] - truth[b])));
    const pickedFirst = NOISELESS ? truth[a] > truth[b] : rand() < pA;
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

export const MIX_POLICIES = {
  shipped: selectNextPair,
  staged: (i: Parameters<Policy>[0]) => selectNextPairHybrid(i),
} as const;
export type MixPolicy = keyof typeof MIX_POLICIES;
export type MixRow = Record<string, number>;

/** One seeded run of one selector: the per-500-answer rows. */
export function pairMixRun(policy: MixPolicy, seed: number, n = N, budget = BUDGET): MixRow[] {
  return run(MIX_POLICIES[policy], seed, n, budget);
}

/** Mean of the seeds' rows, rounded as the simulation has always logged it. */
export function meanRows(runs: MixRow[][]): MixRow[] {
  return runs[0].map((_, r) => {
    const row: MixRow = {};
    for (const key of Object.keys(runs[0][r])) row[key] = +(runs.reduce((a, x) => a + x[r][key], 0) / runs.length).toFixed(3);
    return row;
  });
}

/** The selectors the simulation runs (MIX_SELECTOR narrows it to one). */
export const mixPolicies = (): MixPolicy[] => (["shipped", "staged"] as const).filter((p) => !ONLY_SELECTOR || p === ONLY_SELECTOR);

/** The serial form: every selector's seeds in turn, in this thread. */
export function pairMix(seeds: number[], n = N, budget = BUDGET): Record<string, MixRow[]> {
  const out: Record<string, MixRow[]> = {};
  for (const p of mixPolicies()) out[p] = meanRows(seeds.map((s) => pairMixRun(p, s, n, budget)));
  return out;
}

function runOnWorker(policy: MixPolicy, seed: number, n: number, budget: number): Promise<MixRow[]> {
  return new Promise((resolve, reject) => {
    // tsx loads the TypeScript entry and resolves the "@/" paths from tsconfig.json.
    const w = new Worker(new URL("./pairMix.worker.ts", import.meta.url), {
      workerData: { policy, seed, n, budget },
      execArgv: ["--import", "tsx"],
    });
    let result: MixRow[] | undefined;
    w.once("message", (m: MixRow[]) => (result = m));
    w.once("error", reject);
    w.once("exit", (code) => (result && code === 0 ? resolve(result) : reject(new Error(`pair-mix worker exited ${code} without a result`))));
  });
}

/** `pairMix`, with each (selector, seed) run on a worker thread (at most `threads` at a time). */
export async function pairMixParallel(seeds: number[], n = N, budget = BUDGET, threads = availableParallelism()): Promise<Record<string, MixRow[]>> {
  const jobs = mixPolicies().flatMap((p) => seeds.map((s) => ({ p, s })));
  const res: MixRow[][] = new Array(jobs.length);
  let next = 0;
  const lane = async () => {
    while (next < jobs.length) {
      const k = next++;
      res[k] = await runOnWorker(jobs[k].p, jobs[k].s, n, budget);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(threads, jobs.length)) }, lane));
  const out: Record<string, MixRow[]> = {};
  for (const p of mixPolicies()) out[p] = meanRows(res.filter((_, k) => jobs[k].p === p));
  return out;
}
