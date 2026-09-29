import { test } from "node:test";
import assert from "node:assert/strict";
import { RATES_2026, standardDeduction, actualDeduction, mileageDeductionOutcome, money } from "./calc.mjs";

test("2026 business rates are the IRS figures: 72.5c then 76c", () => {
  assert.equal(RATES_2026.businessH1, 0.725);
  assert.equal(RATES_2026.businessH2, 0.76);
});

test("standard deduction prices each half-year at its own rate", () => {
  const r = standardDeduction({ milesH1: 6000, milesH2: 6000 });
  assert.equal(r.mileage, 4350 + 4560);
  assert.equal(r.total, 8910);
});

test("parking and tolls ride on top of the standard rate", () => {
  const r = standardDeduction({ milesH1: 1000, milesH2: 0, parkingTolls: 120.5 });
  assert.equal(r.mileage, 725);
  assert.equal(r.total, 845.5);
});

test("actual deduction allocates expenses by business-use share", () => {
  const r = actualDeduction({ totalMiles: 20000, businessMiles: 12000, vehicleExpenses: 10000 });
  assert.equal(r.businessShare, 0.6);
  assert.equal(r.allocated, 6000);
  assert.equal(r.total, 6000);
});

test("actual share is capped at 100% and zero total miles gives zero", () => {
  assert.equal(actualDeduction({ totalMiles: 1000, businessMiles: 5000, vehicleExpenses: 1000 }).businessShare, 1);
  assert.equal(actualDeduction({ totalMiles: 0, businessMiles: 0, vehicleExpenses: 1000 }).total, 0);
});

test("outcome picks the larger method and reports the gap", () => {
  const std = mileageDeductionOutcome({ milesH1: 6000, milesH2: 6000, totalMiles: 15000, vehicleExpenses: 8000 });
  assert.equal(std.better, "standard"); // 8910 vs 6400
  assert.equal(std.difference, 2510);
  const act = mileageDeductionOutcome({ milesH1: 6000, milesH2: 6000, totalMiles: 14000, vehicleExpenses: 14000 });
  assert.equal(act.better, "actual"); // 8910 vs 12000
  assert.equal(act.difference, -3090);
});

test("without actual-expense inputs the outcome is standard and says so", () => {
  const r = mileageDeductionOutcome({ milesH1: 100, milesH2: 100 });
  assert.equal(r.haveActualInputs, false);
  assert.equal(r.better, "standard");
});

test("findings always warn about eligibility and records; flag impossible miles", () => {
  const r = mileageDeductionOutcome({ milesH1: 9000, milesH2: 9000, totalMiles: 10000, vehicleExpenses: 5000 });
  const titles = r.findings.map((f) => f.title).join("|");
  assert.match(titles, /not always both open/);
  assert.match(titles, /contemporaneous log/);
  assert.match(titles, /exceed total miles/);
  assert.equal(mileageDeductionOutcome({}).findings.some((f) => /No business miles/.test(f.title)), true);
});

test("garbage input is treated as zero, never NaN", () => {
  const r = mileageDeductionOutcome({ milesH1: "abc", milesH2: -5, totalMiles: NaN, vehicleExpenses: null });
  assert.equal(r.standard.total, 0);
  assert.equal(r.actual.total, 0);
});

test("money formats and never prints -$0.00", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-0.001), "$0.00");
});
