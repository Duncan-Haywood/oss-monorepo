import test from "node:test";
import assert from "node:assert/strict";

import { computeRates, PLACEMENTS, NICHES } from "./calculator.mjs";

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

test("zero subscribers or zero open rate produces zero prices and a missing-input finding", () => {
  const result = computeRates({ subscribers: 0, openRate: 40, niche: "general" });
  assert.ok(findingIds(result).includes("missing-input"));
  for (const placement of PLACEMENTS) {
    assert.equal(result.rates[placement].low, 0);
    assert.equal(result.rates[placement].high, 0);
  }
});

test("a mid-size general list produces a sensible price range for a primary placement", () => {
  const result = computeRates({ subscribers: 10000, openRate: 40, niche: "general" });
  // opens = 4000, perThousandOpens = 4
  assert.equal(result.opens, 4000);
  assert.equal(result.rates.primary.low, 80); // 4 * 20
  assert.equal(result.rates.primary.high, 140); // 4 * 35
  assert.ok(result.rates.primary.low < result.rates.primary.high);
});

test("dedicated send always prices higher than primary, which prices higher than classified", () => {
  const result = computeRates({ subscribers: 25000, openRate: 35, niche: "tech" });
  assert.ok(result.rates.dedicated.low > result.rates.primary.low);
  assert.ok(result.rates.primary.low > result.rates.secondary.low);
  assert.ok(result.rates.secondary.low > result.rates.classified.low);
});

test("finance niche prices higher than general niche for the same list", () => {
  const input = { subscribers: 20000, openRate: 45 };
  const general = computeRates({ ...input, niche: "general" });
  const finance = computeRates({ ...input, niche: "finance" });
  for (const placement of PLACEMENTS) {
    assert.ok(finance.rates[placement].low > general.rates[placement].low);
    assert.ok(finance.rates[placement].high > general.rates[placement].high);
  }
});

test("an unrecognized niche falls back to general", () => {
  const a = computeRates({ subscribers: 15000, openRate: 30, niche: "not-a-real-niche" });
  const b = computeRates({ subscribers: 15000, openRate: 30, niche: "general" });
  assert.deepEqual(a.rates, b.rates);
});

test("open rate above 100 is clamped to 100", () => {
  const clamped = computeRates({ subscribers: 10000, openRate: 250, niche: "general" });
  const full = computeRates({ subscribers: 10000, openRate: 100, niche: "general" });
  assert.deepEqual(clamped.rates, full.rates);
});

test("negative or non-numeric input does not throw and yields zero opens", () => {
  assert.doesNotThrow(() => computeRates({ subscribers: -50, openRate: 40, niche: "general" }));
  assert.doesNotThrow(() => computeRates({ subscribers: NaN, openRate: 40, niche: "general" }));
  assert.doesNotThrow(() => computeRates({ subscribers: undefined, openRate: undefined, niche: undefined }));
  const result = computeRates({ subscribers: -50, openRate: 40, niche: "general" });
  assert.equal(result.opens, 0);
});

test("a list under 1,000 subscribers is flagged", () => {
  const result = computeRates({ subscribers: 500, openRate: 40, niche: "general" });
  assert.ok(findingIds(result).includes("small-list"));
});

test("a list at or above 1,000 subscribers is not flagged for size", () => {
  const result = computeRates({ subscribers: 1000, openRate: 40, niche: "general" });
  assert.ok(!findingIds(result).includes("small-list"));
});

test("an open rate below 15% is flagged", () => {
  const result = computeRates({ subscribers: 10000, openRate: 10, niche: "general" });
  assert.ok(findingIds(result).includes("low-open-rate"));
});

test("an open rate above 70% is flagged as unusually high, not as a problem", () => {
  const result = computeRates({ subscribers: 10000, openRate: 85, niche: "general" });
  assert.ok(findingIds(result).includes("high-open-rate"));
  const finding = result.findings.find((f) => f.id === "high-open-rate");
  assert.equal(finding.severity, "info");
});

test("a typical open rate between 15% and 70% is not flagged either way", () => {
  const result = computeRates({ subscribers: 10000, openRate: 40, niche: "general" });
  assert.ok(!findingIds(result).includes("low-open-rate"));
  assert.ok(!findingIds(result).includes("high-open-rate"));
});

test("every placement and niche combination returns a low <= high range", () => {
  for (const niche of NICHES) {
    for (const placement of PLACEMENTS) {
      const result = computeRates({ subscribers: 12000, openRate: 33, niche });
      assert.ok(result.rates[placement].low <= result.rates[placement].high, `${niche}/${placement}`);
    }
  }
});
