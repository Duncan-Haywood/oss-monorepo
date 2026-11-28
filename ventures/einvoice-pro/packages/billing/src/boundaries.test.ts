// Boundary cases the red team found unguarded (2026-11-28): the edges of the pricing band and of
// quota derivation, and dates that fail to parse. Shared byte for byte by every billing copy
// (platform/ci/check_billing_copies.py notes a test file that drifts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWithinPastDueGrace, pastDueGraceUntil } from "./grace.ts";
import { periodKeyFor, quotaPeriodStart } from "./period.ts";
import { type BillablePlan, checkPricingBand, deriveLargestQuota } from "./pricing.ts";

const month = { cents: 100, interval: "month" } as const;
const plan: BillablePlan = { key: "p", priceCents: 100, annualPriceCents: null, purchasable: true };

describe("pricing band edges", () => {
  // $1 a month against $0.50 of cost is exactly 2x.
  const at2x = () => 500_000;
  it("a markup exactly on the band's minimum passes", () => {
    const [c] = checkPricingBand([plan], at2x, { min: 2, max: 10 });
    assert.equal(c?.markup, 2);
    assert.equal(c?.ok, true);
  });
  it("a markup exactly on the band's maximum passes", () => {
    const [c] = checkPricingBand([plan], at2x, { min: 1, max: 2 });
    assert.equal(c?.ok, true);
  });
  it("a markup just outside either edge fails", () => {
    assert.equal(checkPricingBand([plan], at2x, { min: 2.01, max: 10 })[0]?.ok, false);
    assert.equal(checkPricingBand([plan], at2x, { min: 1, max: 1.99 })[0]?.ok, false);
  });
});

describe("deriveLargestQuota edges", () => {
  it("returns 1 when exactly one unit fits the target", () => {
    // $1 a month: 1 unit costs $0.40 (2.5x), 2 units $0.80 (1.25x) against a 2x target.
    assert.equal(deriveLargestQuota([month], (q) => q * 400_000, 2), 1);
  });
  it("stops at the default cap of 1000 when every quota fits", () => {
    assert.equal(deriveLargestQuota([month], () => 1, 2), 1000);
  });
  it("stops at a caller's cap", () => {
    assert.equal(deriveLargestQuota([month], () => 1, 2, 7), 7);
  });
});

describe("dates that failed to parse", () => {
  const now = new Date("2026-11-28T12:00:00Z");
  const bad = new Date("not a date");
  it("an Invalid Date anchor falls back to the calendar month, not a NaN period", () => {
    assert.equal(periodKeyFor(bad, now), "2026-11");
    assert.equal(quotaPeriodStart(bad, now).toISOString(), "2026-11-01T00:00:00.000Z");
  });
  it("an Invalid Date past_due start gives no grace and no unprintable grace end", () => {
    assert.equal(pastDueGraceUntil("past_due", bad), null);
    assert.equal(isWithinPastDueGrace("past_due", bad, now), false);
  });
});
