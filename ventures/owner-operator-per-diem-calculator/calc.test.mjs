import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePerDiem, seTax, sampleInputs, DEFAULTS } from "./calc.mjs";

test("travel days count at 75 percent and the DOT limit takes 80 percent of the total", () => {
  const r = calculatePerDiem({ fullDays: 200, partialDays: 40, dailyRate: 80 });
  assert.equal(r.fullAmount, 16000);
  assert.equal(r.partialAmount, 2400);
  assert.equal(r.perDiemGross, 18400);
  assert.equal(r.perDiemDeduction, 14720);
});

test("the larger of per diem and receipts is chosen, and ties are reported", () => {
  assert.equal(calculatePerDiem({ fullDays: 100, dailyRate: 80, receipts: 5000 }).method, "per-diem");
  const r = calculatePerDiem({ fullDays: 100, dailyRate: 80, receipts: 12000 });
  assert.equal(r.method, "receipts");
  assert.equal(r.deduction, 9600);
  assert.equal(r.difference, 3200);
  assert.equal(calculatePerDiem({ fullDays: 100, dailyRate: 80, receipts: 8000 }).method, "equal");
});

test("the 80 percent limit applies to receipts as well", () => {
  assert.equal(calculatePerDiem({ receipts: 10000 }).receiptsDeduction, 8000);
});

test("self-employment tax is 15.3 percent of 92.35 percent below the wage base", () => {
  assert.ok(Math.abs(seTax(50000) - 50000 * 0.9235 * 0.153) < 1e-6);
  assert.equal(seTax(0), 0);
  assert.equal(seTax(-5), 0);
});

test("the Social Security part stops at the wage base but Medicare does not", () => {
  const capped = seTax(300000, { wageBase: 100000 });
  assert.ok(Math.abs(capped - (100000 * 0.124 + 300000 * 0.9235 * 0.029)) < 1e-6);
  // Other wages use up room under the cap.
  assert.ok(seTax(50000, { otherWages: 100000, wageBase: 100000 }) < seTax(50000, { wageBase: 100000 }));
});

test("tax saving is SE tax saved plus bracket on the deduction and half the SE saving", () => {
  const r = calculatePerDiem({ fullDays: 100, dailyRate: 80, netProfit: 60000, marginalRate: 22 });
  const d = 6400;
  const se = seTax(60000) - seTax(60000 - d);
  assert.ok(Math.abs(r.seSaving - se) < 0.01);
  assert.ok(Math.abs(r.incomeTaxSaving - (d + se / 2) * 0.22) < 0.01);
  assert.ok(Math.abs(r.totalSaving - (se + (d + se / 2) * 0.22)) < 0.02);
});

test("a deduction larger than profit cannot save more than the profit it removes", () => {
  const r = calculatePerDiem({ fullDays: 300, dailyRate: 80, netProfit: 5000, marginalRate: 22 });
  assert.equal(r.seTaxAfter, 0);
  assert.ok(r.incomeTaxSaving <= (5000 + r.seSaving / 2) * 0.22 + 0.01);
});

test("no profit entered means no tax estimate", () => {
  const r = calculatePerDiem({ fullDays: 100, dailyRate: 80 });
  assert.equal(r.taxEstimated, false);
  assert.equal(r.totalSaving, 0);
});

test("invalid input returns an error rather than NaN", () => {
  assert.ok(calculatePerDiem({ fullDays: -1 }).error);
  assert.ok(calculatePerDiem({ fullDays: "abc" }).error);
  assert.ok(calculatePerDiem({ fullDays: 300, partialDays: 100 }).error);
  assert.ok(calculatePerDiem({ partialPct: 120 }).error);
  assert.ok(calculatePerDiem({ marginalRate: 150 }).error);
});

test("defaults are the ones the page tells the reader to verify", () => {
  assert.equal(DEFAULTS.conusRate, 80);
  assert.equal(DEFAULTS.oconusRate, 86);
  const r = calculatePerDiem(sampleInputs());
  assert.equal(r.method, "per-diem");
  assert.ok(r.totalSaving > 0);
});

test("a DOT percentage just over 100 is rejected", () => {
  const r = calculatePerDiem({ fullDays: 100, dailyRate: 80, dotPct: 101 });
  assert.match(r.error, /DOT percentage/);
  assert.equal(calculatePerDiem({ fullDays: 100, dailyRate: 80, dotPct: 100 }).error, undefined);
});
