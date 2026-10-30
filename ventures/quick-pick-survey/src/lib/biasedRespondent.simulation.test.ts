/**
 * Follow-up to `lapseSweep.simulation.test.ts`: a respondent who takes the
 * first option shown on a share of answers (position bias), not a random one.
 * Does the hybrid still hold at or above the shipped selector? 30 items, 20
 * seeded respondents per cell, mean rank accuracy.
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

function cell(budget: number, bias: number) {
  const seeds = Array.from({ length: 20 }, (_, i) => 9100 + i * 13);
  const row: Record<string, number> = {};
  for (const [name, p] of policies) {
    row[name] = Number(mean(seeds.map((s) => simulate(p, 30, budget, s, 0, bias).rankAccuracy)).toFixed(3));
  }
  return row;
}

describe("position-bias sweep", () => {
  it("measures 30 items at 120 and 300 answers, bias 0.1 to 0.5", () => {
    const out: Record<string, Record<string, number>> = {};
    for (const bias of [0.1, 0.3, 0.5]) for (const b of [120, 300]) out[`bias${bias}_${b}`] = cell(b, bias);
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE position bias ${JSON.stringify(out)}\n`);
    for (const r of Object.values(out)) for (const v of Object.values(r)) expect(v).toBeGreaterThan(0);
  }, 1_800_000);
});

describe("first-option fallback", () => {
  it("measures the shipped hybrid with the detector, 30 items, 300 answers", () => {
    const out: Record<string, Record<string, number>> = {};
    for (const bias of [0, 0.1, 0.3, 0.5]) out[`bias${bias}_300`] = cell(300, bias);
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE fallback ${JSON.stringify(out)}\n`);
    for (const r of Object.values(out)) for (const v of Object.values(r)) expect(v).toBeGreaterThan(0);
  }, 1_800_000);
});

describe("second-option fallback", () => {
  it("measures the hybrid against a respondent who favours the second option, 30 items, 300 answers", () => {
    const out: Record<string, Record<string, number>> = {};
    for (const bias of [-0.1, -0.3, -0.5]) out[`bias${bias}_300`] = cell(300, bias);
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE second-option ${JSON.stringify(out)}\n`);
    for (const r of Object.values(out)) for (const v of Object.values(r)) expect(v).toBeGreaterThan(0);
  }, 1_800_000);
});
