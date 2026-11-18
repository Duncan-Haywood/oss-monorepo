/**
 * Deep-budget cell (500 items, 4000 answers), split from poolCap.simulation.test.ts so it runs on its own worker.
 * Does the information selector's pool cap (INFO_POOL_CAP, 400) cost rank
 * accuracy on lists over 400 items? Same respondent and Glicko-2 loop as
 * `infoGainPairing.simulation.test.ts`; capped (default) against uncapped
 * (poolCap = Infinity) against the shipped selector, medians over seeded runs.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cellParallel } from "@/lib/poolCapCell";

describe("pool cap with budgets well past the list length", () => {
  // 500 items is above the cap of 400; 2000 answers is 4 per item, 4000 is 8 per item.
  for (const [items, budget] of [[500, 4000]] as const) {
    it(`${items} items, ${budget} answers`, async () => {
      const r = await cellParallel(items, budget, 2);
      appendFileSync(process.env.MEASURE_OUT ?? "/dev/null", `MEASURE ${items} items ${budget} answers ${JSON.stringify(r)}\n`);
      // Question, not a claim: does the cap hide items once the budget is deep? Allow 0.02 as in the cells above.
      expect(r.capped.rank).toBeGreaterThanOrEqual(r.uncapped.rank - 0.02);
    }, 3_600_000);
  }
});
