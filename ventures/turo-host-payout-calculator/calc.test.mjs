import test from "node:test";
import assert from "node:assert/strict";

import {
  EARNINGS_PLANS,
  BOOKING_WINDOWS,
  DAMAGE_RESPONSIBILITY_CAP,
  HOST_SHARE,
  hostShareFor,
  computeTripPayout,
  comparePlans,
  compareBookingWindows,
  estimateMonthly,
} from "./calc.mjs";

test("hostShareFor reads the plan x window matrix directly", () => {
  assert.equal(hostShareFor("peace_of_mind", "0_2"), 0.65);
  assert.equal(hostShareFor("balanced", "14_27"), 0.85);
  assert.equal(hostShareFor("more_earnings", "28_plus"), 1.0);
});

test("hostShareFor falls back to balanced / 3-13 for an unknown plan or window", () => {
  assert.equal(hostShareFor("bogus", "0_2"), HOST_SHARE.balanced["0_2"]);
  assert.equal(hostShareFor("balanced", "bogus"), HOST_SHARE.balanced["3_13"]);
});

test("every plan x window cell is a fraction between 0 and 1", () => {
  for (const plan of EARNINGS_PLANS) {
    for (const window of BOOKING_WINDOWS) {
      const share = HOST_SHARE[plan][window];
      assert.ok(share > 0 && share <= 1, `${plan}/${window} out of range: ${share}`);
    }
  }
});

test("computeTripPayout splits the trip price at the plan/window's host share", () => {
  const result = computeTripPayout({ tripPrice: 200, plan: "balanced", bookingWindow: "3_13" });
  // Balanced / 3-13 days ahead = 80% host share
  assert.equal(result.hostShare, 0.8);
  assert.equal(result.hostPayout, 160);
  assert.equal(result.turoCut, 40);
  assert.equal(result.splitEligible, 200);
});

test("computeTripPayout includes extra-mileage, late-return, and additional-usage fees in the split", () => {
  const result = computeTripPayout({
    tripPrice: 200,
    plan: "balanced",
    bookingWindow: "3_13",
    extraMileageFee: 30,
    lateReturnFee: 20,
    additionalUsageFee: 10,
  });
  assert.equal(result.splitEligible, 260);
  assert.equal(result.hostPayout, 208); // 260 * 0.8
  assert.equal(result.turoCut, 52);
});

test("computeTripPayout divides the host payout across the stated number of days", () => {
  const result = computeTripPayout({ tripPrice: 300, plan: "balanced", bookingWindow: "28_plus", days: 3 });
  assert.equal(result.hostPayout, 270); // 300 * 0.9
  assert.equal(result.perDay, 90);
});

test("computeTripPayout treats a missing/zero days as one day rather than dividing by zero", () => {
  const result = computeTripPayout({ tripPrice: 100, plan: "more_earnings", bookingWindow: "28_plus", days: 0 });
  assert.equal(result.perDay, result.hostPayout);
  assert.ok(Number.isFinite(result.perDay));
});

test("computeTripPayout treats negative or non-numeric inputs as zero, never NaN or negative", () => {
  const result = computeTripPayout({ tripPrice: -50, plan: "balanced", bookingWindow: "3_13", extraMileageFee: "abc" });
  assert.equal(result.splitEligible, 0);
  assert.equal(result.hostPayout, 0);
  assert.equal(result.turoCut, 0);
  assert.ok(!Number.isNaN(result.hostPayout));
});

test("computeTripPayout flags a zero trip price", () => {
  const result = computeTripPayout({ tripPrice: 0, plan: "balanced", bookingWindow: "3_13" });
  assert.ok(result.findings.some((f) => f.id === "missing-input"));
});

test("computeTripPayout flags the last-minute booking window", () => {
  const result = computeTripPayout({ tripPrice: 200, plan: "balanced", bookingWindow: "0_2" });
  assert.ok(result.findings.some((f) => f.id === "last-minute-booking"));
});

test("computeTripPayout does not flag last-minute booking outside the 0-2 window", () => {
  const result = computeTripPayout({ tripPrice: 200, plan: "balanced", bookingWindow: "28_plus" });
  assert.ok(!result.findings.some((f) => f.id === "last-minute-booking"));
});

test("computeTripPayout flags choosing Peace of Mind so the cap trade-off is visible", () => {
  const result = computeTripPayout({ tripPrice: 200, plan: "peace_of_mind", bookingWindow: "3_13" });
  assert.ok(result.findings.some((f) => f.id === "lowest-cap-plan"));
});

test("comparePlans returns all three plans for the same trip, marking the selected one", () => {
  const { rows, swing } = comparePlans({ tripPrice: 400, bookingWindow: "3_13", selectedPlan: "peace_of_mind" });
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.plan === "peace_of_mind").selected, true);
  assert.equal(rows.filter((r) => r.selected).length, 1);
  // More Earnings pays more than Peace of Mind for the same trip and window.
  const peaceOfMind = rows.find((r) => r.plan === "peace_of_mind");
  const moreEarnings = rows.find((r) => r.plan === "more_earnings");
  assert.ok(moreEarnings.hostPayout > peaceOfMind.hostPayout);
  assert.equal(swing, round2Local(moreEarnings.hostPayout - peaceOfMind.hostPayout));
});

test("comparePlans carries each plan's damage-responsibility cap for context", () => {
  const { rows } = comparePlans({ tripPrice: 400, bookingWindow: "3_13", selectedPlan: "balanced" });
  for (const row of rows) {
    assert.equal(row.damageCap, DAMAGE_RESPONSIBILITY_CAP[row.plan]);
  }
});

test("compareBookingWindows returns all four windows for the same trip and plan", () => {
  const { rows, swing } = compareBookingWindows({ tripPrice: 500, plan: "balanced", selectedWindow: "0_2" });
  assert.equal(rows.length, 4);
  assert.equal(rows.filter((r) => r.selected).length, 1);
  const earliest = rows.find((r) => r.bookingWindow === "0_2");
  const latest = rows.find((r) => r.bookingWindow === "28_plus");
  assert.ok(latest.hostPayout > earliest.hostPayout);
  assert.equal(swing, round2Local(latest.hostPayout - earliest.hostPayout));
});

test("estimateMonthly multiplies a per-trip payout by a rounded trip count", () => {
  const result = estimateMonthly(150.5, 8);
  assert.equal(result.trips, 8);
  assert.equal(result.monthly, 1204);
  assert.equal(result.annual, 14448);
});

test("estimateMonthly rounds a fractional trip count and floors negative input at zero", () => {
  assert.equal(estimateMonthly(100, 2.6).trips, 3);
  assert.equal(estimateMonthly(100, -5).trips, 0);
  assert.equal(estimateMonthly(100, -5).monthly, 0);
});

function round2Local(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
