import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cashFlows, presentValue, impliedReturn, num, money, DEFAULTS } from "./calc.mjs";

const flat = { monthlyRent: 1000, escalator: 0, colocRent: 0, churn: 0, horizon: 10, offerYears: 10, discountRate: 0, lumpTaxPct: 0, rentTaxPct: 0 };

test("a flat 10-year lease with no churn sums to 120,000", () => {
  const a = analyze({ ...flat, offer: 100000 });
  assert.equal(a.undiscounted, 120000);
  assert.equal(a.paybackYear, 9);
  assert.equal(a.multiple, 100000 / 12000);
});

test("escalator compounds yearly and starts in year 2", () => {
  const rows = cashFlows({ ...flat, escalator: 3 });
  assert.equal(rows[0].rent, 12000);
  assert.ok(Math.abs(rows[1].rent - 12360) < 1e-9);
});

test("colocation rent starts in its year and escalates from there", () => {
  const rows = cashFlows({ ...flat, colocRent: 500, colocYear: 3, escalator: 0 });
  assert.equal(rows[1].coloc, 0);
  assert.equal(rows[2].coloc, 6000);
});

test("churn shrinks expected cash flow geometrically", () => {
  const rows = cashFlows({ ...flat, churn: 10 });
  assert.ok(Math.abs(rows[1].expected - 12000 * 0.81) < 1e-9);
});

test("present value of a level annuity matches the closed form", () => {
  const pv = presentValue(Array(10).fill(1000), 5);
  assert.ok(Math.abs(pv - (1000 * (1 - Math.pow(1.05, -10))) / 0.05) < 1e-6);
});

test("implied return recovers the rate a stream was priced at", () => {
  const flows = Array(15).fill(10000);
  const price = presentValue(flows, 8);
  assert.ok(Math.abs(impliedReturn(price, flows) - 0.08) < 1e-6);
});

test("an offer worth more than the cash is a negative return, and zero offer has none", () => {
  assert.ok(impliedReturn(50000, [10000, 10000]) < 0);
  assert.ok(Number.isNaN(impliedReturn(0, [10000])));
});

test("selling only part of the term leaves the rest as kept value", () => {
  const a = analyze({ ...flat, discountRate: 5, offer: 50000, offerYears: 4 });
  assert.equal(a.sold, 4);
  assert.ok(a.pvKept > 0);
  assert.ok(Math.abs(a.pvSold + a.pvKept - presentValue(Array(10).fill(12000), 5)) < 1e-6);
});

test("an offer equal to PV at your rate has a ~zero gap and implied return equal to your rate", () => {
  const base = analyze({ ...DEFAULTS });
  const a = analyze({ ...DEFAULTS, offer: base.pvSold });
  assert.ok(Math.abs(a.gap) < 1e-6);
  assert.ok(Math.abs(a.irr - DEFAULTS.discountRate / 100) < 1e-6);
});

test("tax on the lump sum uses basis; after-tax offer is lower than the offer", () => {
  const a = analyze({ ...DEFAULTS, basis: 30000, lumpTaxPct: 20 });
  assert.equal(a.lumpTax, (DEFAULTS.offer - 30000) * 0.2);
  assert.equal(a.offerAfterTax, DEFAULTS.offer - a.lumpTax);
});

test("removing colocation lowers the bare value and the return the offer implies (the buyer is paying less per dollar of certain cash)", () => {
  const a = analyze({ ...DEFAULTS });
  assert.ok(a.pvSoldBare < a.pvSold);
  assert.ok(a.irrBare < a.irr);
});

test("the sensitivity grid is monotone: higher discount rate and higher churn both lower value", () => {
  const a = analyze({ ...DEFAULTS });
  for (const row of a.grid) for (let i = 1; i < row.values.length; i++) assert.ok(row.values[i] <= row.values[i - 1]);
  for (let r = 1; r < a.grid.length; r++) assert.ok(a.grid[r].values[0] < a.grid[r - 1].values[0]);
});

test("bad inputs warn rather than throw", () => {
  const a = analyze({ monthlyRent: 0, horizon: 0, offer: 0 });
  assert.ok(a.warnings.length >= 2);
  assert.doesNotThrow(() => analyze({}));
});

test("num and money parse and format", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});
