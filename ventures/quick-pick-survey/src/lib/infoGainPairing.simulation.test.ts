/**
 * Does choosing the pair by expected variance reduction beat the weighted-random
 * selector the app ships? Same synthetic respondent and Glicko-2 loop as
 * `pairing.simulation.test.ts`, 10 seeded respondents per cell.
 */
import { describe, expect, it } from "vitest";
import {
  expectedVarianceReduction,
  selectNextPair,
  selectNextPairByInformation,
  selectNextPairHybrid,
  type InformationOptions,
  type PairItem,
} from "@/lib/pairing";
import { simulate, type Policy } from "@/lib/infoGainSim";

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
