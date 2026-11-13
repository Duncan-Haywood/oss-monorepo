import { describe, expect, it } from "vitest";
import { pairMix, pairMixParallel, pairMixRun } from "@/lib/pairMix";

// pairMixParallel must report exactly what the serial loop reports: the
// pair-mix simulation switched to it for speed only. The shipped and staged
// selectors part ways from the first pairs, and seeds give different rows, so a
// run reported under the wrong selector or seed shows up.
describe("pairMixParallel", () => {
  for (const [items, budget, seeds] of [[60, 1000, [11, 12]], [200, 500, [11, 12, 13]]] as const) {
    it(`matches the serial loop at ${items} items, ${budget} answers, ${seeds.length} seeds`, async () => {
      const serial = pairMix([...seeds], items, budget);
      expect(serial.shipped).not.toEqual(serial.staged);
      expect(pairMixRun("shipped", seeds[0], items, budget)).not.toEqual(pairMixRun("shipped", seeds[1], items, budget));
      expect(await pairMixParallel([...seeds], items, budget, 2)).toEqual(serial);
    });
  }
});
