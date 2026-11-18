/**
 * Shared cell runner for the pool-cap simulations (poolCap*.simulation.test.ts).
 * Not a test file: vitest's file-level parallelism runs each poolCap file on its
 * own worker, so the slow cells no longer queue behind each other.
 *
 * `cellParallel` gives the same result as `cell`, but runs each of the cell's
 * independent `simulate` calls (3 policies x n seeds) on its own worker thread
 * (`poolCapCell.worker.ts`). The 500-item, 4000-answer cell was the suite's
 * floor at about 150 s on one thread while the other files had finished
 * (docs/history/ci-perf-2026-11-13-qps-cell-workers.md). Each run is seeded and
 * shares nothing, so the numbers cannot depend on which thread ran it;
 * poolCapCell.test.ts pins the two paths equal.
 */
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { selectNextPair, selectNextPairByInformation } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainSim";

export const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

export const CELL_POLICIES = {
  shipped: selectNextPair,
  capped: (i: Parameters<typeof selectNextPair>[0]) => selectNextPairByInformation(i),
  uncapped: (i: Parameters<typeof selectNextPair>[0]) => selectNextPairByInformation(i, { poolCap: Infinity }),
} as const;
export type CellPolicy = keyof typeof CELL_POLICIES;
export type RunResult = { under150: number; rankAccuracy: number };

/** One seeded run of one policy, reduced to the two numbers a cell reports. */
export function cellRun(policy: CellPolicy, items: number, budget: number, seed: number): RunResult {
  const r = simulate(CELL_POLICIES[policy], items, budget, seed);
  return { under150: r.under(150), rankAccuracy: r.rankAccuracy };
}

const seedsFor = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i * 7);
const POLICIES: CellPolicy[] = ["shipped", "capped", "uncapped"];

function summarise(rs: RunResult[]) {
  return {
    under150: median(rs.map((r) => r.under150)),
    rank: Number(median(rs.map((r) => r.rankAccuracy)).toFixed(3)),
  };
}

export function cell(items: number, budget: number, n: number) {
  const seeds = seedsFor(n);
  const run = (p: CellPolicy) => summarise(seeds.map((s) => cellRun(p, items, budget, s)));
  return { shipped: run("shipped"), capped: run("capped"), uncapped: run("uncapped") };
}

function runOnWorker(policy: CellPolicy, items: number, budget: number, seed: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // tsx loads the TypeScript entry and resolves the "@/" paths from tsconfig.json.
    const w = new Worker(new URL("./poolCapCell.worker.ts", import.meta.url), {
      workerData: { policy, items, budget, seed },
      execArgv: ["--import", "tsx"],
    });
    let result: RunResult | undefined;
    w.once("message", (m: RunResult) => (result = m));
    w.once("error", reject);
    w.once("exit", (code) => (result && code === 0 ? resolve(result) : reject(new Error(`cell worker exited ${code} without a result`))));
  });
}

/** `cell`, with the runs spread over worker threads (at most `threads` at a time). */
export async function cellParallel(items: number, budget: number, n: number, threads = availableParallelism()) {
  const seeds = seedsFor(n);
  const jobs = POLICIES.flatMap((p) => seeds.map((s) => ({ p, s })));
  const out: RunResult[] = new Array(jobs.length);
  let next = 0;
  const lane = async () => {
    while (next < jobs.length) {
      const k = next++;
      out[k] = await runOnWorker(jobs[k].p, items, budget, jobs[k].s);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(threads, jobs.length)) }, lane));
  const by = (p: CellPolicy) => summarise(out.filter((_, k) => jobs[k].p === p));
  return { shipped: by("shipped"), capped: by("capped"), uncapped: by("uncapped") };
}
