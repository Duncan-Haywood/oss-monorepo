// The marketing site's /machining-tolerances guide prints how this app's tolerance reader reads a list
// of callouts (apps/jobshop-site/src/site/tolerance-example.ts). This test runs every callout through
// the real reader, so the page cannot drift from what the RFQ review shows an estimator.
import { BAND_LIMITS_IN, readTolerances } from "@shared/tolerance";
import { describe, expect, it } from "vitest";
import { BANDS, CALLOUTS, ISO2768_ROWS } from "../../../jobshop-site/src/site/tolerance-example";

describe("site tolerance table", () => {
  for (const row of CALLOUTS) {
    it(`reads ${row.callout} as the page says`, () => {
      const { reads, tightest } = readTolerances(row.callout);
      expect(reads).toHaveLength(1);
      expect(tightest).toMatchObject({
        zoneIn: row.zoneIn,
        band: row.band,
        sizeAssumed: row.sizeAssumed,
      });
    });
  }

  it("lists the bands in the reader's order, tightest last", () => {
    expect(BANDS.map((b) => b.band)).toEqual(["standard", "close", "tight", "precision"]);
    expect(BAND_LIMITS_IN.map((b) => b.belowIn)).toEqual([0.001, 0.002, 0.01]);
  });

  it("prints the ISO 2768 6-30 mm column the reader uses", () => {
    for (const row of ISO2768_ROWS) {
      const half = row.plusMinusMm[2] as number;
      const zone = readTolerances(`ISO 2768-${row.cls}`).tightest?.zoneIn;
      expect(zone).toBe(Math.round(((2 * half) / 25.4) * 1e7) / 1e7);
    }
  });
});
