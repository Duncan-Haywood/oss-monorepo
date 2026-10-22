/**
 * Does the information selector's pool cap (INFO_POOL_CAP, 400) cost rank
 * accuracy on lists over 400 items? Same respondent and Glicko-2 loop as
 * `infoGainPairing.simulation.test.ts`; capped (default) against uncapped
 * (poolCap = Infinity) against the shipped selector, medians over seeded runs.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectNextPair, selectNextPairByInformation } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainPairing.simulation.test";

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

function cell(items: number, budget: number, n: number) {
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

describe("pool cap on long lists", () => {
  for (const [items, budget] of [[600, 600], [1000, 600]] as const) {
    it(`${items} items, ${budget} answers`, () => {
      const r = cell(items, budget, 3);
      appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE ${items} items ${budget} answers ${JSON.stringify(r)}\n`);
      // Measured 2026-10-22 (docs/INFORMATION-GAIN-SELECTOR.md): the cap costs no rank accuracy here.
      expect(r.capped.rank).toBeGreaterThan(r.shipped.rank);
      expect(r.capped.rank).toBeGreaterThanOrEqual(r.uncapped.rank - 0.02);
    }, 1_800_000);
  }
});
