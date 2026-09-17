import test from "node:test";
import assert from "node:assert/strict";

import { computeRates, PLACEMENTS, NICHES, READ_TYPES } from "./calculator.mjs";

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

test("zero downloads produces zero prices and a missing-input finding", () => {
  const result = computeRates({ downloads: 0, niche: "general", readType: "host-read" });
  assert.ok(findingIds(result).includes("missing-input"));
  for (const placement of PLACEMENTS) {
    assert.equal(result.rates[placement].low, 0);
    assert.equal(result.rates[placement].high, 0);
  }
});

test("a mid-size general show produces a sensible price range for a mid-roll", () => {
  const result = computeRates({ downloads: 10000, niche: "general", readType: "host-read" });
  assert.equal(result.perThousand, 10);
  assert.equal(result.rates.midroll.low, 200); // 10 * 20
  assert.equal(result.rates.midroll.high, 300); // 10 * 30
  assert.ok(result.rates.midroll.low < result.rates.midroll.high);
});

test("mid-roll always prices higher than pre-roll, which prices higher than post-roll", () => {
  const result = computeRates({ downloads: 25000, niche: "tech", readType: "host-read" });
  assert.ok(result.rates.midroll.low > result.rates.preroll.low);
  assert.ok(result.rates.preroll.low > result.rates.postroll.low);
});

test("business niche prices higher than general niche for the same show", () => {
  const input = { downloads: 20000, readType: "host-read" };
  const general = computeRates({ ...input, niche: "general" });
  const business = computeRates({ ...input, niche: "business" });
  for (const placement of PLACEMENTS) {
    assert.ok(business.rates[placement].low > general.rates[placement].low);
    assert.ok(business.rates[placement].high > general.rates[placement].high);
  }
});

test("an unrecognized niche falls back to general", () => {
  const a = computeRates({ downloads: 15000, niche: "not-a-real-niche", readType: "host-read" });
  const b = computeRates({ downloads: 15000, niche: "general", readType: "host-read" });
  assert.deepEqual(a.rates, b.rates);
});

test("an unrecognized read type falls back to host-read", () => {
  const a = computeRates({ downloads: 15000, niche: "general", readType: "nonsense" });
  const b = computeRates({ downloads: 15000, niche: "general", readType: "host-read" });
  assert.deepEqual(a.rates, b.rates);
});

test("produced ads price lower than host-read ads for the same show", () => {
  const input = { downloads: 20000, niche: "business" };
  const hostRead = computeRates({ ...input, readType: "host-read" });
  const produced = computeRates({ ...input, readType: "produced" });
  for (const placement of PLACEMENTS) {
    assert.ok(produced.rates[placement].low < hostRead.rates[placement].low);
    assert.ok(produced.rates[placement].high < hostRead.rates[placement].high);
  }
});

test("negative or non-numeric input does not throw and yields zero downloads priced", () => {
  assert.doesNotThrow(() => computeRates({ downloads: -50, niche: "general", readType: "host-read" }));
  assert.doesNotThrow(() => computeRates({ downloads: NaN, niche: "general", readType: "host-read" }));
  assert.doesNotThrow(() => computeRates({ downloads: undefined, niche: undefined, readType: undefined }));
  const result = computeRates({ downloads: -50, niche: "general", readType: "host-read" });
  assert.equal(result.perThousand, 0);
});

test("a show under 1,000 downloads/episode is flagged", () => {
  const result = computeRates({ downloads: 500, niche: "general", readType: "host-read" });
  assert.ok(findingIds(result).includes("small-show"));
});

test("a show at or above 1,000 downloads/episode is not flagged for size", () => {
  const result = computeRates({ downloads: 1000, niche: "general", readType: "host-read" });
  assert.ok(!findingIds(result).includes("small-show"));
});

test("a produced read is flagged with an informational discount note", () => {
  const result = computeRates({ downloads: 10000, niche: "general", readType: "produced" });
  assert.ok(findingIds(result).includes("produced-discount"));
  const finding = result.findings.find((f) => f.id === "produced-discount");
  assert.equal(finding.severity, "info");
});

test("a host-read is not flagged with the produced discount note", () => {
  const result = computeRates({ downloads: 10000, niche: "general", readType: "host-read" });
  assert.ok(!findingIds(result).includes("produced-discount"));
});

test("a mega-show above 500,000 downloads/episode is flagged as past benchmark territory", () => {
  const result = computeRates({ downloads: 600000, niche: "general", readType: "host-read" });
  assert.ok(findingIds(result).includes("large-show"));
});

test("every placement, niche, and read-type combination returns a low <= high range", () => {
  for (const niche of NICHES) {
    for (const readType of READ_TYPES) {
      for (const placement of PLACEMENTS) {
        const result = computeRates({ downloads: 12000, niche, readType });
        assert.ok(result.rates[placement].low <= result.rates[placement].high, `${niche}/${readType}/${placement}`);
      }
    }
  }
});
