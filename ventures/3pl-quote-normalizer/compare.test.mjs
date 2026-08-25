import test from "node:test";
import assert from "node:assert/strict";
import { comparisonMessage, normalizeComparison, savingsPercent } from "./compare.mjs";

test("compares finite non-negative totals", () => {
  const result = normalizeComparison({ first: "1200", second: "1350" });
  assert.deepEqual(result, { first: 1200, second: 1350, equal: false, cheaper: "first", difference: 150, annualDifference: 1800 });
  assert.equal(comparisonMessage(result), "Quote A is lower by $150.00 per month at this volume ($1,800.00 per year).");
});
test("reports equal totals", () => assert.equal(comparisonMessage(normalizeComparison({ first: "100", second: "100" })), "Both normalized totals are equal."));
test("calculates savings against the higher quote", () => {
  assert.equal(savingsPercent(normalizeComparison({ first: "800", second: "1000" })), 20);
  assert.equal(savingsPercent(normalizeComparison({ first: "0", second: "0" })), 0);
});
test("rejects malformed and negative totals", () => {
  assert.equal(normalizeComparison({ first: "", second: "100" }).error, "Enter a valid monthly total for both quotes.");
  assert.equal(normalizeComparison({ first: "-1", second: "100" }).error, "Monthly totals cannot be negative.");
});
