import test from "node:test";
import assert from "node:assert/strict";
import { comparisonMessage, normalizeComparison, targetMessage } from "./compare.mjs";

test("compares finite non-negative totals", () => {
  const result = normalizeComparison({ first: "1200", second: "1350" });
  assert.deepEqual(result, { first: 1200, second: 1350, equal: false, cheaper: "first", difference: 150, annualDifference: 1800 });
  assert.equal(comparisonMessage(result), "Quote A is lower by $150.00 per month at this volume ($1,800.00 per year).");
});
test("reports equal totals", () => assert.equal(comparisonMessage(normalizeComparison({ first: "100", second: "100" })), "Both normalized totals are equal."));
test("rejects malformed and negative totals", () => {
  assert.equal(normalizeComparison({ first: "", second: "100" }).error, "Enter a valid monthly total for both quotes.");
  assert.equal(normalizeComparison({ first: "-1", second: "100" }).error, "Monthly totals cannot be negative.");
});
test("compares both providers with an optional negotiation target", () => {
  const result = normalizeComparison({ first: "1200", second: "1350", target: "1250" });
  assert.equal(result.target, 1250);
  assert.equal(result.firstWithinTarget, true);
  assert.equal(result.secondWithinTarget, false);
  assert.equal(targetMessage(result), "Quote A is within the $1,250.00 target by $50.00. Quote B is above the $1,250.00 target by $100.00.");
});
test("rejects an invalid optional target", () => assert.equal(normalizeComparison({ first: "100", second: "120", target: "-1" }).error, "The target monthly total must be a non-negative number."));
