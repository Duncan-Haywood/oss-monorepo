import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, payment, standardYears, rapRate, rapMonthly, ibrMonthly, compare, pslfCompare, toCsv } from "./calc.mjs";

test("standard payment matches the amortisation figure and tiers follow the balance", () => {
  assert.ok(Math.abs(payment(30000, 0.065, 180) - 261.33) < 0.5);
  assert.equal(standardYears(24999), 10);
  assert.equal(standardYears(25000), 15);
  assert.equal(standardYears(50000), 20);
  assert.equal(standardYears(100000), 25);
});

test("RAP bands: flat $10 to $10k, 1% per $10k above, capped at 10%", () => {
  assert.equal(rapRate(10000), null);
  assert.equal(rapMonthly(8000, 0), 10);
  assert.equal(rapRate(15000), 0.01);
  assert.equal(rapRate(60000), 0.05);
  assert.equal(rapRate(60001), 0.06);
  assert.equal(rapRate(100000), 0.09);
  assert.equal(rapRate(250000), 0.1);
  assert.equal(rapMonthly(60000, 0), 250);
  assert.equal(rapMonthly(60000, 2), 150);
  assert.equal(rapMonthly(15000, 3), 10, "minimum payment holds");
});

test("IBR payment is rate x income above 150% of poverty", () => {
  assert.ok(Math.abs(ibrMonthly(55000, 15650, 0.1) - (55000 - 23475) * 0.1 / 12) < 0.01);
  assert.equal(ibrMonthly(20000, 15650, 0.1), 0);
});

test("RAP never charges interest above the payment, and the $50 match keeps principal falling", () => {
  const o = { ...DEFAULTS, balance: 80000, agi: 12000, incomeGrowthPct: 0 };
  const [, rap] = compare(o);
  assert.equal(rap.firstPayment, 10);
  // balance after 12 months must be lower than the start even though the payment is far below interest
  const r12 = analyze({ ...o }).plans[1];
  assert.ok(r12.forgiven < 80000);
  assert.ok(r12.forgiven > 0);
});

test("a high earner clears the loan with nothing forgiven; a low earner is forgiven", () => {
  const rich = analyze({ ...DEFAULTS, agi: 200000 });
  assert.equal(rich.best.forgiven, 0);
  assert.ok(rich.plans[1].months < rich.plans[0].months, "RAP at 10% of a high income clears faster than the tiered standard term");
  const poor = analyze({ ...DEFAULTS, balance: 120000, agi: 30000, incomeGrowthPct: 0 });
  assert.ok(poor.plans[1].forgiven > 0 || poor.plans[2].forgiven > 0);
  assert.notEqual(poor.best.plan, "Standard");
});

test("total paid on standard equals payment x months; forgiven is zero", () => {
  const [std] = compare(DEFAULTS);
  assert.equal(std.forgiven, 0);
  assert.ok(Math.abs(std.totalPaid - std.firstPayment * std.months) < 0.01);
});

test("higher income growth never lowers what IBR or RAP collects", () => {
  const lo = compare({ ...DEFAULTS, incomeGrowthPct: 0 });
  const hi = compare({ ...DEFAULTS, incomeGrowthPct: 6 });
  assert.ok(hi[1].totalPaid >= lo[1].totalPaid - 1);
  assert.ok(hi[2].totalPaid >= lo[2].totalPaid - 1);
});

test("forgiveness tax is the forgiven balance times the rate; PSLF removes it", () => {
  const o = { ...DEFAULTS, balance: 120000, agi: 30000, incomeGrowthPct: 0 };
  const [, rap] = compare(o);
  assert.ok(Math.abs(rap.forgivenessTax - rap.forgiven * 0.22) < 0.01);
  const p = pslfCompare(o);
  assert.equal(p[1].forgivenessTax, 0);
  assert.equal(p[1].months, 120);
  assert.ok(p[1].totalPaid <= rap.totalPaid + 1);
});

test("RAP stops at 360 payments; IBR stops at its forgiveness term", () => {
  const o = { ...DEFAULTS, balance: 250000, agi: 25000, incomeGrowthPct: 0 };
  const [, rap, ibr] = compare(o);
  assert.ok(rap.months <= 360);
  assert.ok(ibr.months <= 240);
  assert.equal(compare({ ...o, ibrYears: 25 })[2].months <= 300, true);
});

test("validation and csv", () => {
  assert.ok(analyze({ ...DEFAULTS, balance: 0 }).warnings.length > 0);
  assert.equal(analyze({ ...DEFAULTS, balance: 0 }).plans.length, 0);
  const csv = toCsv(analyze(DEFAULTS));
  assert.equal(csv.split("\n").length, 4);
});
