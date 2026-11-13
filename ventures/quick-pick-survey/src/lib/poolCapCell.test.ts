import { describe, expect, it } from "vitest";
import { cell, cellParallel } from "@/lib/poolCapCell";

// cellParallel must report exactly what the single-threaded cell reports: the
// pool-cap simulations switched to it for speed only. The capped and uncapped
// policies only part ways past INFO_POOL_CAP (400) active items, hundreds of
// answers in, which is the simulations' job; here the shipped selector differs
// from the information one, so a run reported under the wrong policy or seed
// shows up.
describe("cellParallel", () => {
  for (const [items, budget, n] of [[40, 120, 3], [450, 60, 2]] as const) {
    it(`matches cell at ${items} items, ${budget} answers, ${n} seeds`, async () => {
      const serial = cell(items, budget, n);
      expect(serial.shipped).not.toEqual(serial.capped);
      expect(await cellParallel(items, budget, n, 2)).toEqual(serial);
    });
  }
});
