import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, DEFAULTS, monthlyPayment, noiFor, parseExpenses } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Hand-worked with the defaults: rent 51 x 450 x 12 = 275,400; other 1,800 x 12 = 21,600;
// EGI 297,000. Fixed 101,500; mgmt 8% = 23,760; reserves 150 x 60 = 9,000; expenses 134,260;
// NOI 162,740. Value at 8.5% = 1,914,588.24. Implied cap on 1.4M = 11.624%.
test("base NOI, value and implied cap are hand-checkable", () => {
  const a = analyze(DEFAULTS);
  close(a.base.rentIncome, 275400);
  close(a.base.egi, 297000);
  close(a.fixed, 101500);
  close(a.base.expenses, 134260);
  close(a.base.noi, 162740);
  close(a.value, 162740 / 0.085);
  close(a.impliedCap, 162740 / 1400000);
});

test("rent increase: 51 -> 49 lots at $490 and the break-even move-outs", () => {
  const a = analyze(DEFAULTS);
  // rent 49 x 490 x 12 = 288,120; EGI 309,720; mgmt 24,777.6; expenses 135,277.6 + 9,000... computed below
  const n = noiFor(DEFAULTS, 49, 490, 101500);
  close(a.increase.after.noi, n.noi);
  close(n.noi, 309720 - (101500 + 309720 * 0.08 + 9000));
  assert.ok(a.increase.valueCreated > 0);
  // Largest k with NOI(51-k, 490) >= NOI(51, 450): verify k and k+1 straddle the base.
  const k = a.increase.breakEvenMoveOuts;
  assert.ok(noiFor(DEFAULTS, 51 - k, 490, 101500).noi >= a.base.noi);
  assert.ok(noiFor(DEFAULTS, 51 - k - 1, 490, 101500).noi < a.base.noi);
  assert.equal(k, 4);
});

test("a zero increase with zero move-outs changes nothing", () => {
  const a = analyze({ ...DEFAULTS, rentIncrease: 0, moveOuts: 0 });
  close(a.increase.valueCreated, 0);
});

test("loan payment matches the standard amortisation formula", () => {
  // $100,000 at 6% over 30 years = $599.55 a month.
  close(monthlyPayment(100000, 6, 30), 599.5505, 1e-3);
  close(monthlyPayment(120000, 0, 10), 1000);
  assert.equal(monthlyPayment(0, 6, 30), 0);
});

test("DSCR and cash on cash use the typed loan", () => {
  const a = analyze(DEFAULTS);
  close(a.loan, 980000);
  close(a.dscr, a.base.noi / a.debtService);
  close(a.cashOnCash, (a.base.noi - a.debtService) / 420000);
});

test("expense lines parse, labels may contain commas, bad lines are reported", () => {
  const p = parseExpenses("Repairs, parts and labor, 1200\nnonsense\n, 5\nTax, -3");
  assert.deepEqual(p.items, [{ label: "Repairs, parts and labor", amount: 1200 }]);
  assert.equal(p.skipped.length, 3);
});

test("occupied above total is capped and warned; blank inputs do not throw", () => {
  const a = analyze({ ...DEFAULTS, occupied: 99 });
  assert.equal(a.occupied, 60);
  assert.ok(a.warnings.length > 0);
  assert.doesNotThrow(() => analyze({ lots: "", occupied: "", capRate: "" }));
});

test("filling every vacant lot raises NOI", () => {
  const a = analyze(DEFAULTS);
  assert.ok(a.full.noi > a.base.noi);
});

test("value grid has a row per cap rate and a column per increase, falling as cap rises", () => {
  const a = analyze(DEFAULTS);
  assert.equal(a.grid.length, 5);
  assert.equal(a.grid[0].values.length, 5);
  assert.ok(a.grid[0].values[0] > a.grid[4].values[0]);
});
