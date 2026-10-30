/**
 * Two open questions from `longBudget.simulation.test.ts`: is the hybrid's dip
 * below the shipped selector at 300 answers (30 items) real or seed noise, and
 * do the selectors keep their lead when 20% of answers are random (an
 * inconsistent respondent)? 20 seeded respondents per cell, medians and means.
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
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

function cell(budget: number, lapse: number) {
  const seeds = Array.from({ length: 20 }, (_, i) => 5000 + i * 13);
  const row: Record<string, number> = {};
  for (const [name, p] of policies) {
    const acc = seeds.map((s) => simulate(p, 30, budget, s, lapse).rankAccuracy);
    row[`${name}_median`] = Number(median(acc).toFixed(3));
    row[`${name}_mean`] = Number(mean(acc).toFixed(3));
  }
  return row;
}

describe("hybrid dip and inconsistent respondent", () => {
  it("measures 30 items at 120, 300, 600 answers, lapse 0 and 0.2", () => {
    const out: Record<string, Record<string, number>> = {};
    for (const lapse of [0, 0.2]) for (const b of [120, 300, 600]) out[`lapse${lapse}_${b}`] = cell(b, lapse);
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE hybrid dip ${JSON.stringify(out)}\n`);
    for (const r of Object.values(out)) for (const v of Object.values(r)) expect(v).toBeGreaterThan(0.3);
  }, 1_800_000);
});
