import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, declineFactor, monthlyFlows, presentValue, impliedReturn, num, money, DEFAULTS } from "./calc.mjs";

const flat = { currentMonthly: 1000, initialDecline: 0, b: 1, terminalDecline: 0, priceDrift: 0, shutInMonthly: 0, horizon: 10, newWellMonthly: 0, discountRate: 0, lumpTaxPct: 0, rentTaxPct: 0, depletionPct: 0 };

test("no decline and no price drift sums to months x check", () => {
  const a = analyze({ ...flat, offer: 60000 });
  assert.equal(a.undiscounted, 120000);
  assert.equal(a.paybackMonth, 60);
  assert.equal(a.monthsOfIncome, 60);
});

test("decline factor starts at 1 and the annual effective rate holds at 12 months for b=0", () => {
  assert.equal(declineFactor(0, 30, 1, 5), 1);
  assert.ok(Math.abs(declineFactor(12, 30, 0, 0) - 0.7) < 1e-9);
});

test("hyperbolic curve at 12 months equals 1 minus the effective decline", () => {
  assert.ok(Math.abs(declineFactor(12, 30, 1, 0) - 0.7) < 1e-9);
  assert.ok(Math.abs(declineFactor(12, 50, 1.5, 0) - 0.5) < 1e-9);
});

test("terminal decline floors the tail: more production than pure hyperbolic is impossible, less is", () => {
  const withTerm = declineFactor(240, 30, 1.5, 8);
  const pure = declineFactor(240, 30, 1.5, 0);
  assert.ok(withTerm < pure);
  assert.ok(withTerm > 0);
});

test("curve is continuous at the hyperbolic to exponential switch", () => {
  let prev = 1;
  for (let m = 1; m <= 400; m++) {
    const f = declineFactor(m, 35, 1.2, 6);
    assert.ok(f < prev && prev - f < 0.05, "month " + m);
    prev = f;
  }
});

test("shut-in stops the existing well once the royalty falls below the floor", () => {
  const rows = monthlyFlows({ ...flat, initialDecline: 50, b: 0, shutInMonthly: 300, horizon: 10 });
  const last = rows.filter((r) => r.existing > 0).length;
  assert.ok(last > 12 && last < 40);
  assert.equal(rows[rows.length - 1].existing, 0);
});

test("new well upside is probability weighted and starts after its year", () => {
  const rows = monthlyFlows({ ...flat, newWellMonthly: 1000, newWellYear: 3, newWellProb: 50, horizon: 5 });
  assert.equal(rows[23].upside, 0);
  assert.equal(rows[24].upside, 500);
});

test("present value of a level monthly stream matches the closed form", () => {
  const flows = Array(120).fill(1000);
  const r = 0.1;
  const mr = Math.pow(1 + r, 1 / 12) - 1;
  const closed = (1000 * (1 - Math.pow(1 + mr, -120))) / mr;
  assert.ok(Math.abs(presentValue(flows, 10) - closed) < 1e-6);
});

test("implied return recovers the rate a stream was priced at", () => {
  const flows = Array(180).fill(2000);
  const price = presentValue(flows, 14);
  assert.ok(Math.abs(impliedReturn(price, flows) - 0.14) < 1e-6);
});

test("a low offer implies a high buyer return and a negative gap", () => {
  const a = analyze({ ...DEFAULTS, offer: 15000 });
  assert.ok(a.gap < 0);
  assert.ok(a.irr > 0.5);
  const hi = analyze({ ...DEFAULTS, offer: 400000 });
  assert.ok(hi.gap > 0);
});

test("without the upside well the value is lower and never higher", () => {
  const a = analyze(DEFAULTS);
  assert.ok(a.pvNoUpside < a.pv);
  assert.ok(a.irrNoUpside <= a.irr);
});

test("depletion lowers the tax on royalty and so raises its after-tax value", () => {
  const a = analyze({ ...DEFAULTS, depletionPct: 0 });
  const b = analyze({ ...DEFAULTS, depletionPct: 15 });
  assert.ok(b.pvAfterTax > a.pvAfterTax);
});

test("price grid rises with the multiplier and falls with the rate", () => {
  const a = analyze(DEFAULTS);
  const row = a.grid[2].values;
  for (let i = 1; i < row.length; i++) assert.ok(row[i] > row[i - 1]);
  assert.ok(a.grid[0].values[2] > a.grid[4].values[2]);
});

test("per-acre figures use the net mineral acres typed", () => {
  const a = analyze({ ...DEFAULTS, offer: 50000, netMineralAcres: 10 });
  assert.equal(a.perAcre, 5000);
});

test("empty inputs warn instead of throwing", () => {
  const a = analyze({ currentMonthly: 0, offer: 0, horizon: 0 });
  assert.ok(a.warnings.length >= 2);
});

test("num and money parse and format", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});
