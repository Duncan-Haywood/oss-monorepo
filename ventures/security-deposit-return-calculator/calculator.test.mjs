import test from "node:test";
import assert from "node:assert/strict";

import { computeProratedRent, computeDepositSettlement } from "./calculator.mjs";

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

test("prorated rent: a half-occupied 30-day month is half the monthly rent", () => {
  const result = computeProratedRent({ monthlyRent: 3000, daysInMonth: 30, daysOccupied: 15 });
  assert.equal(result.dailyRate, 100);
  assert.equal(result.proratedAmount, 1500);
});

test("prorated rent: full occupancy equals the full monthly rent", () => {
  const result = computeProratedRent({ monthlyRent: 1550, daysInMonth: 31, daysOccupied: 31 });
  assert.equal(result.proratedAmount, 1550);
});

test("prorated rent: zero days occupied is zero owed", () => {
  const result = computeProratedRent({ monthlyRent: 2000, daysInMonth: 30, daysOccupied: 0 });
  assert.equal(result.proratedAmount, 0);
});

test("prorated rent: zero or missing rent is flagged", () => {
  const result = computeProratedRent({ monthlyRent: 0, daysInMonth: 30, daysOccupied: 10 });
  assert.ok(findingIds(result).includes("missing-rent"));
});

test("prorated rent: days occupied beyond the month is capped and flagged", () => {
  const result = computeProratedRent({ monthlyRent: 3000, daysInMonth: 30, daysOccupied: 45 });
  assert.equal(result.proratedAmount, 3000);
  assert.ok(findingIds(result).includes("days-exceed-month"));
});

test("prorated rent: negative or non-numeric input does not throw", () => {
  assert.doesNotThrow(() => computeProratedRent({ monthlyRent: -100, daysInMonth: 30, daysOccupied: 10 }));
  assert.doesNotThrow(() => computeProratedRent({ monthlyRent: NaN, daysInMonth: NaN, daysOccupied: NaN }));
  const result = computeProratedRent({ monthlyRent: undefined, daysInMonth: undefined, daysOccupied: undefined });
  assert.equal(result.proratedAmount, 0);
});

test("deposit settlement: no deductions refunds the full deposit", () => {
  const result = computeDepositSettlement({ depositAmount: 1500, deductions: [] });
  assert.equal(result.totalDeductions, 0);
  assert.equal(result.refundDue, 1500);
  assert.equal(result.balanceOwed, 0);
  assert.ok(findingIds(result).includes("no-deductions"));
});

test("deposit settlement: deductions below the deposit produce a partial refund", () => {
  const result = computeDepositSettlement({
    depositAmount: 1500,
    deductions: [
      { description: "carpet cleaning", amount: 200 },
      { description: "broken blind", amount: 50 },
    ],
  });
  assert.equal(result.totalDeductions, 250);
  assert.equal(result.refundDue, 1250);
  assert.equal(result.balanceOwed, 0);
  assert.ok(!findingIds(result).includes("balance-owed"));
});

test("deposit settlement: deductions exceeding the deposit produce a balance owed, not a negative refund", () => {
  const result = computeDepositSettlement({
    depositAmount: 500,
    deductions: [{ description: "carpet replacement", amount: 900 }],
  });
  assert.equal(result.refundDue, 0);
  assert.equal(result.balanceOwed, 400);
  assert.ok(findingIds(result).includes("balance-owed"));
});

test("deposit settlement: a deduction with no description is flagged", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [{ description: "", amount: 100 }],
  });
  assert.ok(findingIds(result).includes("unitemized-deduction"));
});

test("deposit settlement: a deduction with a description is not flagged as unitemized", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [{ description: "wall patch and paint, bedroom", amount: 100 }],
  });
  assert.ok(!findingIds(result).includes("unitemized-deduction"));
});

test("deposit settlement: zero or negative deduction amounts are dropped, not counted", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [
      { description: "typo row", amount: 0 },
      { description: "negative row", amount: -50 },
      { description: "real charge", amount: 75 },
    ],
  });
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.totalDeductions, 75);
});

test("deposit settlement: the jurisdiction note is always present", () => {
  const result = computeDepositSettlement({ depositAmount: 1000, deductions: [] });
  assert.ok(findingIds(result).includes("jurisdiction-note"));
});

test("deposit settlement: negative or non-numeric input does not throw", () => {
  assert.doesNotThrow(() => computeDepositSettlement({ depositAmount: -100, deductions: null }));
  assert.doesNotThrow(() => computeDepositSettlement({ depositAmount: NaN, deductions: undefined }));
  const result = computeDepositSettlement({ depositAmount: undefined, deductions: undefined });
  assert.equal(result.totalDeductions, 0);
  assert.equal(result.refundDue, 0);
});

test("deposit settlement: rounds to the cent rather than accumulating float drift", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [
      { description: "a", amount: 10.1 },
      { description: "b", amount: 20.2 },
      { description: "c", amount: 30.3 },
    ],
  });
  assert.equal(result.totalDeductions, 60.6);
});
