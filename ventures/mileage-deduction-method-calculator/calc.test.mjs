import { test } from "node:test";
import assert from "node:assert/strict";
import { mileageMethodOutcome, standardDeduction, RATES_2026, SE_TAX_EFFECTIVE_RATE, money } from "./calc.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} != ${b}`);

test("2026 rates are the IRS figures", () => {
  assert.equal(RATES_2026.businessFirstHalf, 0.725);
  assert.equal(RATES_2026.businessSecondHalf, 0.76);
});

test("standard deduction splits miles across the two 2026 rates", () => {
  close(standardDeduction(6000, 4000), 6000 * 0.725 + 4000 * 0.76);
  close(standardDeduction(6000, 4000), 7390);
  close(standardDeduction(0, 1000), 760);
  close(standardDeduction(-5, "x"), 0);
});

test("actual expenses are prorated by business-use share", () => {
  const r = mileageMethodOutcome({ milesFirstHalf: 5000, milesSecondHalf: 5000, totalMiles: 20000, fuel: 4000, insurance: 2000, repairs: 1000, registration: 300, depreciationOrLease: 4700 });
  close(r.businessUse, 0.5);
  close(r.actualCostsAll, 12000);
  close(r.actual, 6000);
  close(r.standard, 5000 * 0.725 + 5000 * 0.76);
  assert.equal(r.best, "standard");
});

test("actual wins when the car is expensive to run", () => {
  const r = mileageMethodOutcome({ milesFirstHalf: 4000, milesSecondHalf: 4000, totalMiles: 8000, fuel: 5000, insurance: 3000, repairs: 2000, depreciationOrLease: 9000 });
  close(r.businessUse, 1);
  close(r.actual, 19000);
  assert.equal(r.best, "actual");
  close(r.gap, 19000 - (4000 * 0.725 + 4000 * 0.76));
});

test("parking and tolls are added to both methods and never change the winner", () => {
  const base = { milesFirstHalf: 3000, milesSecondHalf: 3000, totalMiles: 10000, fuel: 3000, insurance: 1500 };
  const a = mileageMethodOutcome(base);
  const b = mileageMethodOutcome({ ...base, parkingTolls: 800 });
  assert.equal(a.best, b.best);
  close(b.standardTotal - a.standardTotal, 800);
  close(b.actualTotal - a.actualTotal, 800);
  close(b.gap, a.gap);
});

test("a blocked standard rate forces actual even when standard is larger", () => {
  const r = mileageMethodOutcome({ milesFirstHalf: 5000, milesSecondHalf: 5000, totalMiles: 10000, fuel: 100, standardBlocked: true });
  assert.equal(r.best, "actual");
  assert.ok(r.findings.some((f) => /not available/.test(f.title)));
});

test("business miles above total miles cap business use at 100%", () => {
  const r = mileageMethodOutcome({ milesFirstHalf: 9000, milesSecondHalf: 9000, totalMiles: 10000, fuel: 1000 });
  assert.equal(r.businessUse, 1);
  assert.ok(r.findings.some((f) => /exceed total/.test(f.title)));
});

test("zero inputs never produce NaN and flag missing miles", () => {
  const r = mileageMethodOutcome({});
  for (const k of ["standard", "actual", "bestTotal", "taxSavingsBest", "breakEvenActualCostPerBusinessMile"]) assert.equal(r[k], 0);
  assert.ok(r.findings.some((f) => /No business miles/.test(f.title)));
});

test("tax rate combines income tax and optional SE tax", () => {
  const r = mileageMethodOutcome({ milesFirstHalf: 1000, milesSecondHalf: 0, totalMiles: 1000, incomeTaxRatePct: 22, seTaxApplies: true });
  close(r.taxRate, 0.22 + 0.153 * 0.9235);
  close(SE_TAX_EFFECTIVE_RATE, 0.14130);
  const n = mileageMethodOutcome({ milesFirstHalf: 1000, totalMiles: 1000, incomeTaxRatePct: 22, seTaxApplies: false });
  close(n.taxRate, 0.22);
  close(n.taxSavingsBest, 725 * 0.22);
});

test("mid-year gain is the second-half miles times 3.5 cents", () => {
  const r = mileageMethodOutcome({ milesFirstHalf: 6000, milesSecondHalf: 4000, totalMiles: 12000 });
  close(r.midYearGain, 4000 * 0.035);
});

test("break-even cost per business mile is the blended rate", () => {
  const r = mileageMethodOutcome({ milesFirstHalf: 6000, milesSecondHalf: 4000, totalMiles: 12000 });
  close(r.breakEvenActualCostPerBusinessMile, 7390 / 10000);
});

test("money formats negatives and zero", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-3), "-$3.00");
  assert.equal(money(0), "$0.00");
});
