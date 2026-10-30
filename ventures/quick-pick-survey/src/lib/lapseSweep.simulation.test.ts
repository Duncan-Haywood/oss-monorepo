/**
 * Follow-up to `hybridDip.simulation.test.ts`, which measured one lapse rate
 * (0.2). Does the hybrid stay at or above the shipped selector across lapse
 * rates 0.05 to 0.5 (share of answers given at random)? 30 items, 20 seeded
 * respondents per cell, mean rank accuracy.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectNextPair, selectNextPairByInformation, selectNextPairHybrid } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainPairing.simulation.test";

type Input = Parameters<typeof selectNextPair>[0];
const policies = [
  ["shipped", selectNextPair],
  ["info", (i: Input) => selectNextPairByInformation(i)],
  ["hybrid", (i: Input) => selectNextPairHybrid(i)],
] as const;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

function cell(budget: number, lapse: number) {
  const seeds = Array.from({ length: 20 }, (_, i) => 7000 + i * 17);
  const row: Record<string, number> = {};
  for (const [name, p] of policies) {
    row[name] = Number(mean(seeds.map((s) => simulate(p, 30, budget, s, lapse).rankAccuracy)).toFixed(3));
  }
  return row;
}

describe("lapse-rate sweep", () => {
  it("measures 30 items at 120 and 300 answers, lapse 0.05 to 0.5", () => {
    const out: Record<string, Record<string, number>> = {};
    for (const lapse of [0.05, 0.1, 0.35, 0.5]) for (const b of [120, 300]) out[`lapse${lapse}_${b}`] = cell(b, lapse);
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE lapse sweep ${JSON.stringify(out)}\n`);
    for (const r of Object.values(out)) for (const v of Object.values(r)) expect(v).toBeGreaterThan(0);
  }, 1_800_000);
});
