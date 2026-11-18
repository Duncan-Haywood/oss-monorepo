/**
 * Pair mix of the staged (hybrid) selector against the shipped one, 1000 items,
 * 3000 answers, clean respondent, no database. The open question in
 * docs/INFORMATION-GAIN-SELECTOR.md ("The dip belongs to the staged selector"):
 * which pairs hurt settled items later on. Per 500 answers it logs the share of
 * pairs that are settled+settled, settled+open (one side rd >= 150) and
 * open+open, the share of pairs that touch an unseen item, the mean true gap of
 * the pair, and the Spearman of the "fixed set" (items rated at 500 answers).
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUDGET, pairMixParallel, STEP } from "@/lib/pairMix";

// The run itself lives in pairMix.ts (unchanged), so its six seeded runs can go
// on worker threads; pairMix.test.ts pins the parallel path to the serial one.
describe("pair mix, staged vs shipped", () => {
  it("logs pair classes and fixed-set Spearman per 500 answers", async () => {
    const seeds = [11, 12, 13];
    const out = await pairMixParallel(seeds);
    appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE pair mix ${JSON.stringify(out)}\n`);
    for (const rows of Object.values(out)) expect(rows.length).toBe(BUDGET / STEP);
  }, 3_000_000);
});
