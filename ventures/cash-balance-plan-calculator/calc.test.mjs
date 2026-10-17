import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS_2026, benefitLimit, catchUpFor, maxCashBalanceContribution,
  stackedDefinedContribution, cashBalanceEstimate, money,
} from "./calc.mjs";

test("2026 assumptions are the stated ones", () => {
  assert.equal(LIMITS_2026.benefit415b, 290_000);
  assert.equal(LIMITS_2026.additions415c, 72_000);
  assert.equal(LIMITS_2026.deferral, 24_500);
  assert.equal(LIMITS_2026.compensationLimit, 360_000);
});

test("catch-up by age", () => {
  assert.equal(catchUpFor(45), 0);
  assert.equal(catchUpFor(50), 8_000);
  assert.equal(catchUpFor(61), 11_250);
  assert.equal(catchUpFor(64), 8_000);
});

test("benefit limit is the lesser of the dollar cap and capped pay", () => {
  assert.equal(benefitLimit(1_000_000), 290_000);
  assert.equal(benefitLimit(200_000), 200_000);
  assert.equal(benefitLimit(-5), 0);
});

test("the maximum rises with age and the range is ordered", () => {
  const at = (age, scenario) => maxCashBalanceContribution({ age, compensation: 360_000, scenario });
  assert.ok(at(40) < at(45) && at(45) < at(50) && at(50) < at(55));
  for (const age of [40, 50, 58]) {
    assert.ok(at(age, "conservative") < at(age, "central"));
    assert.ok(at(age, "central") < at(age, "generous"));
  }
});

test("a 50-year-old with full pay lands in a plausible published band", () => {
  const c = maxCashBalanceContribution({ age: 50, compensation: 360_000 });
  assert.ok(c > 200_000 && c < 300_000, String(c));
});

test("lower pay lowers the limit proportionally below the dollar cap", () => {
  const hi = maxCashBalanceContribution({ age: 50, compensation: 360_000 });
  const lo = maxCashBalanceContribution({ age: 50, compensation: 180_000 });
  assert.ok(Math.abs(lo / hi - 180_000 / 290_000) < 1e-9);
});

test("stacked 401(k) adds deferral, catch-up and 6% profit sharing", () => {
  const s = stackedDefinedContribution({ age: 52, compensation: 400_000 });
  assert.equal(s.deferral, 32_500);
  assert.equal(s.profitSharing, 21_600);
  assert.equal(s.total, 54_100);
  const low = stackedDefinedContribution({ age: 45, compensation: 10_000 });
  assert.equal(low.deferral, 10_000);
});

test("tax saved is the deduction times the bracket, including employee cost", () => {
  const r = cashBalanceEstimate({
    age: 50, compensation: 360_000, income: 800_000, bracket: 0.35,
    employees: 2, employeePay: 60_000, employeeRate: 0.03,
  });
  assert.equal(r.employeeCost, 3_600);
  assert.ok(Math.abs(r.deduction - (r.ownerTotal + 3_600)) < 1e-6);
  assert.ok(Math.abs(r.taxSaved - r.deduction * 0.35) < 1e-6);
  assert.ok(Math.abs(r.netCostOfEmployees - 3_600 * 0.65) < 1e-6);
});

test("deduction is capped at business income and flagged", () => {
  const r = cashBalanceEstimate({ age: 55, compensation: 360_000, income: 100_000, bracket: 0.3 });
  assert.equal(r.deduction, 100_000);
  assert.ok(r.findings.some((f) => f.severity === "high"));
});

test("projection accumulates contributions and grows the balance", () => {
  const r = cashBalanceEstimate({ age: 50, compensation: 360_000, income: 800_000, years: 10, growth: 0 });
  const p = r.projection;
  assert.equal(p.rows.length, 10);
  assert.ok(Math.abs(p.endingBalance - p.cumContribution) < 1e-6);
  const grown = cashBalanceEstimate({ age: 50, compensation: 360_000, income: 800_000, years: 10, growth: 0.05 });
  assert.ok(grown.projection.endingBalance > p.endingBalance);
  assert.ok(Math.abs(p.afterTaxAtRetirement - p.endingBalance * 0.76) < 1e-6);
});

test("garbage input yields zeros, not NaN", () => {
  const r = cashBalanceEstimate({ age: "x", compensation: "y" });
  assert.equal(r.ownerTotal >= 0, true);
  assert.ok(Number.isFinite(r.taxSaved));
  assert.equal(money(1234.5), "$1,235");
});
