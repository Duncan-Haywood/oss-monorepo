import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, simulate, payment, breakEvenRent, num, toCsv } from "./calc.mjs";

test("payment matches the standard amortisation figure", () => {
  assert.ok(Math.abs(payment(360000, 0.065, 360) - 2275.44) < 0.5);
  assert.equal(payment(0, 0.065, 360), 0);
  assert.equal(payment(120000, 0, 120), 1000);
});

test("loan balance is zero at term end and falls monotonically", () => {
  const rows = simulate(DEFAULTS, 30);
  assert.ok(Math.abs(rows[29].balance) < 1);
  for (let i = 1; i < 30; i++) assert.ok(rows[i].balance <= rows[i - 1].balance);
});

test("year-one net worth: buyer = sale proceeds less balance", () => {
  const r = simulate(DEFAULTS, 1)[0];
  const home = 450000 * 1.035;
  assert.ok(Math.abs(r.buyerNet - (home * 0.94 - r.balance)) < 1);
});

test("renter starts with the buyer's cash and compounds it", () => {
  const o = { ...DEFAULTS, rentMonthly: 0.0001, rentersInsuranceMonthly: 0 };
  const rows = simulate(o, 1);
  // renter pays ~nothing, so invests the whole buyer cost; portfolio must exceed the initial cash
  assert.ok(rows[0].renterNet > 450000 * 0.23);
});

test("free rent: renting wins; free-ish house price: buying wins", () => {
  assert.equal(analyze({ ...DEFAULTS, rentMonthly: 200 }).verdict, "rent");
  assert.equal(analyze({ ...DEFAULTS, rentMonthly: 9000 }).verdict, "buy");
});

test("higher appreciation never hurts the buyer", () => {
  const lo = analyze({ ...DEFAULTS, appreciationPct: 1 }).horizon.advantage;
  const hi = analyze({ ...DEFAULTS, appreciationPct: 5 }).horizon.advantage;
  assert.ok(hi > lo);
});

test("break-even rent makes the two households level at the horizon", () => {
  const rent = breakEvenRent(DEFAULTS, 10);
  const adv = simulate({ ...DEFAULTS, rentMonthly: rent }, 10)[9].advantage;
  assert.ok(Math.abs(adv) < 5, String(adv));
});

test("break-even year is the first year with buying ahead", () => {
  const a = analyze({ ...DEFAULTS, horizonYears: 15 });
  if (a.breakEvenYear) {
    assert.ok(a.rows[a.breakEvenYear - 1].advantage >= 0);
    if (a.breakEvenYear > 1) assert.ok(a.rows[a.breakEvenYear - 2].advantage < 0);
  }
});

test("PMI applies under 20% down and stops once the loan is under 80%", () => {
  const o = { ...DEFAULTS, downPct: 5 };
  const rows = simulate(o, 30);
  assert.equal(rows[0].pmi, true);
  assert.equal(rows[29].pmi, false);
  assert.equal(simulate(DEFAULTS, 1)[0].pmi, false);
});

test("mortgage deduction only counts above the standard deduction", () => {
  assert.equal(simulate({ ...DEFAULTS, standardDeduction: 10 ** 9 }, 1)[0].taxSavingYear, 0);
  assert.ok(simulate({ ...DEFAULTS, standardDeduction: 0 }, 1)[0].taxSavingYear > 0);
});

test("bad input is reported, not computed", () => {
  const a = analyze({ ...DEFAULTS, homePrice: 0, rentMonthly: 0 });
  assert.equal(a.rows.length, 0);
  assert.equal(a.warnings.length, 2);
});

test("sensitivity grid is 5 x 5 and includes the typed point", () => {
  const a = analyze(DEFAULTS);
  assert.equal(a.grid.length, 5);
  assert.equal(a.grid[0].cells.length, 5);
  assert.ok(a.grid.some((g) => g.appreciation === 3.5 && g.cells.some((c) => c.invest === 6)));
});

test("num parses money and csv has a row per year", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(toCsv(analyze(DEFAULTS)).split("\n").length, 31);
});
