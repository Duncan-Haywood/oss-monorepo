/**
 * Shared cell runner for the pool-cap simulations (poolCap*.simulation.test.ts).
 * Not a test file: vitest's file-level parallelism runs each poolCap file on its
 * own worker, so the slow cells no longer queue behind each other.
 */
import { selectNextPair, selectNextPairByInformation } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainSim";

export const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

export function cell(items: number, budget: number, n: number) {
  const seeds = Array.from({ length: n }, (_, i) => 1000 + i * 7);
  const run = (p: typeof selectNextPair) => {
    const rs = seeds.map((s) => simulate(p, items, budget, s));
    return {
      under150: median(rs.map((r) => r.under(150))),
      rank: Number(median(rs.map((r) => r.rankAccuracy)).toFixed(3)),
    };
  };
  return {
    shipped: run(selectNextPair),
    capped: run((i) => selectNextPairByInformation(i)),
    uncapped: run((i) => selectNextPairByInformation(i, { poolCap: Infinity })),
  };
}

