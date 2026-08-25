import test from "node:test";
import assert from "node:assert/strict";
import { comparisonMessage, negotiationBrief, normalizeComparison } from "./compare.mjs";

test("compares finite non-negative totals", () => {
  const result = normalizeComparison({ first: "1200", second: "1350" });
  assert.deepEqual(result, { first: 1200, second: 1350, equal: false, cheaper: "first", difference: 150, annualDifference: 1800 });
  assert.equal(comparisonMessage(result), "Quote A is lower by $150.00 per month at this volume ($1,800.00 per year).");
});
test("reports equal totals", () => assert.equal(comparisonMessage(normalizeComparison({ first: "100", second: "100" })), "Both normalized totals are equal."));
test("creates a factual negotiation brief from the comparison", () => {
  const result = normalizeComparison({ first: "1200", second: "1350" });
  assert.equal(negotiationBrief(result), "Negotiation brief\nQuote A is lower by $150.00 per month ($1,800.00 per year) at this volume.\nAsk Quote B: Can you match or explain the $150.00 monthly gap, including every minimum, return fee, and volume assumption? Please confirm the final all-in monthly total in writing.");
});
test("gives a useful next step when totals are equal", () => assert.match(negotiationBrief(normalizeComparison({ first: "100", second: "100" })), /itemize minimums/));
test("rejects malformed and negative totals", () => {
  assert.equal(normalizeComparison({ first: "", second: "100" }).error, "Enter a valid monthly total for both quotes.");
  assert.equal(normalizeComparison({ first: "-1", second: "100" }).error, "Monthly totals cannot be negative.");
});
