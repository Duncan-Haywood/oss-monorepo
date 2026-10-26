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

describe("pool cap at 3000 items (no uncapped run: minutes each)", () => {
  it("3000 items, 600 answers: capped beats the shipped selector", () => {
    const seeds = [1000, 1007];
    const run = (p: typeof selectNextPair) => {
      const rs = seeds.map((s) => simulate(p, 3000, 600, s));
      return {
        under150: median(rs.map((r) => r.under(150))),
        rank: Number(median(rs.map((r) => r.rankAccuracy)).toFixed(3)),
      };
    };
    const r = { shipped: run(selectNextPair), capped: run((i) => selectNextPairByInformation(i)) };
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE 3000 items 600 answers ${JSON.stringify(r)}\n`);
    expect(r.capped.rank).toBeGreaterThan(r.shipped.rank);
  }, 3_600_000);
});

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

describe("pool cap with budgets well past the list length", () => {
  // 500 items is above the cap of 400; 2000 answers is 4 per item, 4000 is 8 per item.
  for (const [items, budget] of [[500, 2000], [500, 4000]] as const) {
    it(`${items} items, ${budget} answers`, () => {
      const r = cell(items, budget, 2);
      appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE ${items} items ${budget} answers ${JSON.stringify(r)}\n`);
      // Question, not a claim: does the cap hide items once the budget is deep? Allow 0.02 as in the cells above.
      expect(r.capped.rank).toBeGreaterThanOrEqual(r.uncapped.rank - 0.02);
    }, 3_600_000);
  }
});
