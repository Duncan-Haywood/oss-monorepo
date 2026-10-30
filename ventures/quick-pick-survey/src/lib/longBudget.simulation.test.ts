/**
 * Budgets well past the list length: 30 items answered 30 to 1200 times. Does
 * the information selector (or the staged hybrid) keep improving rank accuracy
 * once most pairs have been seen, or does it stall or fall behind the shipped
 * selector? Same respondent and loop as `infoGainPairing.simulation.test.ts`,
 * medians over seeded runs.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectNextPair, selectNextPairByInformation, selectNextPairHybrid } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainPairing.simulation.test";

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

describe("budget well past the list length", () => {
  it("30 items, 30 to 1200 answers", () => {
    const seeds = Array.from({ length: 5 }, (_, i) => 2000 + i * 11);
    const out: Record<string, Record<string, number>> = {};
    for (const budget of [30, 120, 300, 600, 1200]) {
      const row: Record<string, number> = {};
      for (const [name, p] of [
        ["shipped", selectNextPair],
        ["info", (i: Parameters<typeof selectNextPair>[0]) => selectNextPairByInformation(i)],
        ["hybrid", (i: Parameters<typeof selectNextPair>[0]) => selectNextPairHybrid(i)],
      ] as const) {
        const rs = seeds.map((s) => simulate(p, 30, budget, s));
        row[name] = Number(median(rs.map((r) => r.rankAccuracy)).toFixed(3));
        row[`${name}_under100`] = median(rs.map((r) => r.under(100)));
      }
      out[budget] = row;
    }
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE long budget ${JSON.stringify(out)}\n`);
    // Measured 2026-10-26 (docs/INFORMATION-GAIN-SELECTOR.md): no stall, and both new selectors lead at 600 and 1200.
    expect(out[1200].hybrid).toBeGreaterThanOrEqual(out[300].hybrid);
    for (const b of [600, 1200]) {
      expect(out[b].info).toBeGreaterThan(out[b].shipped);
      expect(out[b].hybrid).toBeGreaterThan(out[b].shipped);
    }
  }, 1_800_000);
});
