import test from "node:test";
import assert from "node:assert/strict";
import { comparisonMessage, normalizeComparison } from "./compare.mjs";

test("compares finite non-negative totals", () => {
  const result = normalizeComparison({ first: "1200", second: "1350" });
  assert.deepEqual(result, { first: 1200, second: 1350, equal: false, cheaper: "first", difference: 150 });
  assert.equal(comparisonMessage(result), "Quote A is lower by $150.00 per month at this volume.");
});
test("reports equal totals", () => assert.equal(comparisonMessage(normalizeComparison({ first: "100", second: "100" })), "Both normalized totals are equal."));
test("rejects malformed and negative totals", () => {
  assert.equal(normalizeComparison({ first: "", second: "100" }).error, "Enter a valid monthly total for both quotes.");
  assert.equal(normalizeComparison({ first: "-1", second: "100" }).error, "Monthly totals cannot be negative.");
});
