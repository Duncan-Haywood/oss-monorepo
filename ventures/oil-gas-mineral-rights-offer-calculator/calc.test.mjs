import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cashFlows, presentValue, impliedReturn, num, money, DEFAULTS } from "./calc.mjs";

const flat = { monthlyRoyalty: 1000, decline: 0, priceChange: 0, newWellRoyalty: 0, horizon: 10, offerYears: 10, discountRate: 0, lumpTaxPct: 0, royaltyTaxPct: 0 };

test("a flat 10-year royalty sums to 120,000 and pays back in year 9", () => {
  const a = analyze({ ...flat, offer: 100000 });
  assert.equal(a.undiscounted, 120000);
  assert.equal(a.paybackYear, 9);
  assert.equal(a.multiple, 100000 / 12000);
});

test("decline compounds yearly and starts in year 2", () => {
  const rows = cashFlows({ ...flat, decline: 25 });
  assert.equal(rows[0].existing, 12000);
  assert.ok(Math.abs(rows[1].existing - 9000) < 1e-9);
});

test("price change scales every year after the first", () => {
  const rows = cashFlows({ ...flat, priceChange: 10 });
  assert.equal(rows[0].existing, 12000);
  assert.ok(Math.abs(rows[1].existing - 13200) < 1e-9);
});

test("an undrilled well is weighted by its chance and starts in its year", () => {
  const rows = cashFlows({ ...flat, newWellRoyalty: 500, newWellYear: 3, newWellChance: 50 });
  assert.equal(rows[1].fresh, 0);
  assert.equal(rows[2].fresh, 3000);
});

test("present value: 12,000 a year declining 50% at 100% discount converges to 8,000", () => {
  const rows = cashFlows({ ...flat, decline: 50, horizon: 40 });
  const pv = presentValue(rows.map((r) => r.expected), 100);
  assert.ok(Math.abs(pv - 8000) < 1e-3);
});

test("implied return recovers the discount rate used to price the stream", () => {
  const flows = cashFlows({ ...flat, decline: 20 }).map((r) => r.expected);
  const price = presentValue(flows, 15);
  assert.ok(Math.abs(impliedReturn(price, flows) - 0.15) < 1e-6);
});

test("a bare-royalty view is worth no more than one with the new well", () => {
  const a = analyze({ ...DEFAULTS });
  assert.ok(a.pvSoldBare < a.pvSold);
  assert.ok(a.irrBare < a.irr);
});

test("selling part of the term values what is kept separately", () => {
  const a = analyze({ ...flat, offerYears: 4, offer: 10000, discountRate: 0 });
  assert.equal(a.sold, 4);
  assert.equal(a.pvSold, 48000);
  assert.equal(a.pvKept, 72000);
});

test("after-tax offer subtracts tax on offer minus basis", () => {
  const a = analyze({ ...flat, offer: 100000, basis: 20000, lumpTaxPct: 25 });
  assert.equal(a.lumpTax, 20000);
  assert.equal(a.offerAfterTax, 80000);
});

test("a faster decline lowers present value across the grid", () => {
  const a = analyze({ ...DEFAULTS });
  const row = a.grid.find((g) => g.rate === a.rate).values;
  for (let i = 1; i < row.length; i++) assert.ok(row[i] < row[i - 1]);
});

test("missing inputs produce warnings, not NaN output", () => {
  const a = analyze({ ...DEFAULTS, offer: 0, horizon: 0 });
  assert.ok(a.warnings.length >= 2);
  assert.equal(money(NaN), "n/a");
  assert.ok(Number.isNaN(num("")));
  assert.equal(num("$1,200"), 1200);
});
