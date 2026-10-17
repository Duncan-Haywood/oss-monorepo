import { test } from "node:test";
import assert from "node:assert/strict";
import { regularTax, amtExemption, tentativeMinimumTax, amtFor, crossoverSpread, analyze, sampleInput, reportCsv, parseNum, money } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const Y = (o = {}) => ({ status: "single", wages: 210000, pretax: 23500, itemized: 0, salt: 0, ...o });

test("regular tax follows the 2026 brackets", () => {
  near(regularTax(12400, "single"), 1240);
  near(regularTax(170400, "single"), 1240 + 4560 + 0.22 * 55300 + 0.24 * (170400 - 105700));
  near(regularTax(100000, "mfj"), 2480 + 0.12 * 75200);
});

test("AMT exemption phases out at half a dollar per dollar over the start", () => {
  near(amtExemption(400000, "single"), 90100);
  near(amtExemption(600000, "single"), 90100 - 50000);
  near(amtExemption(2000000, "single"), 0);
  near(amtExemption(1000000, "mfj"), 140200);
  near(amtExemption(1200000, "mfj"), 140200 - 100000);
  near(amtExemption(600000, "hoh"), 40100);
});

test("tentative minimum tax is 26% then 28% above the threshold", () => {
  near(tentativeMinimumTax(90100, "single"), 0);
  near(tentativeMinimumTax(90100 + 100000, "single"), 26000);
  near(tentativeMinimumTax(90100 + 344500, "single"), 0.26 * 244500 + 0.28 * 100000);
});

test("standard deduction is added back for AMT, so AMTI exceeds regular taxable income", () => {
  const r = amtFor(Y(), 0);
  near(r.amti, 210000 - 23500);
  near(r.regularTaxable, 210000 - 23500 - 16100);
});

test("itemizers keep their deductions for AMT except state and local taxes", () => {
  const r = amtFor(Y({ itemized: 60000, salt: 40000 }), 0);
  near(r.regularTaxable, 210000 - 23500 - 60000);
  near(r.amti, 210000 - 23500 - 20000);
});

test("crossover is the largest spread with no AMT", () => {
  const y = Y();
  const x = crossoverSpread(y);
  assert.ok(x > 0);
  assert.ok(amtFor(y, x).amt < 0.01);
  assert.ok(amtFor(y, x + 100).amt > 0);
});

test("crossover is zero when AMT is already owed and the cap when it never bites", () => {
  assert.equal(crossoverSpread(Y({ wages: 600000, pretax: 0, itemized: 120000, salt: 120000 })), 0);
  assert.equal(crossoverSpread(Y({ wages: 0, pretax: 0 }), 50000), 50000);
  near(crossoverSpread(Y({ wages: 0, pretax: 0 })), 90100, 0.1);
});

test("analyze on the sample: rows ordered, cash = cost + AMT, crossover in the table", () => {
  const a = analyze(sampleInput());
  assert.ok(!a.error, a.error);
  assert.equal(a.perOption, 11.5);
  const opts = a.rows.map((r) => r.options);
  assert.deepEqual(opts, [...opts].sort((x, y) => x - y));
  assert.ok(a.rows.some((r) => r.isCrossover && r.amt < 0.01));
  for (const r of a.rows) near(r.cash, r.cost + r.amt);
  const all = a.rows.find((r) => r.isAll);
  assert.equal(all.options, 20000);
  assert.ok(all.amt > 0);
  assert.equal(a.amtDueDate, "2027-01-15");
});

test("exercising everything with room to spare reports no AMT", () => {
  const a = analyze({ ...sampleInput(), options: "100" });
  assert.equal(a.crossoverOptions, 100);
  assert.ok(a.findings.some((f) => /without AMT/.test(f.title)));
});

test("AMT never falls as more options are exercised", () => {
  const a = analyze(sampleInput());
  for (let i = 1; i < a.rows.length; i++) assert.ok(a.rows[i].amt >= a.rows[i - 1].amt);
});

test("bad input gets a named message", () => {
  const ok = sampleInput();
  assert.match(analyze({ ...ok, status: "" }).error, /filing status/);
  assert.match(analyze({ ...ok, wages: "x" }).error, /wages/);
  assert.match(analyze({ ...ok, fmv: "" }).error, /fair market value/);
  assert.match(analyze({ ...ok, fmv: "2" }).error, /above the strike/);
  assert.match(analyze({ ...ok, options: "1.5" }).error, /whole number/);
  assert.match(analyze({ ...ok, strike: "-1" }).error, /strike/);
  assert.match(analyze({ ...ok, itemized: "1000", salt: "5000" }).error, /cannot exceed/);
  assert.match(analyze({ ...ok, salePrice: "abc" }).error, /sale price/);
});

test("parseNum and money", () => {
  assert.equal(parseNum("$1,234.5"), 1234.5);
  assert.ok(Number.isNaN(parseNum("1e3")));
  assert.equal(money(1234.6), "1,235");
});

test("CSV has the header, the crossover and the due date", () => {
  const csv = reportCsv(analyze(sampleInput()));
  assert.match(csv, /^Options exercised,Exercise cost,Spread/);
  assert.match(csv, /no AMT/);
  assert.match(csv, /2027-01-15/);
});
