import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  usableDeduction,
  computeYearOutcome,
  presentValue,
  compareCatchUpPaths,
  money,
  DEFAULT_DISCOUNT_RATE_PERCENT,
  MIN_DISCOUNT_RATE_PERCENT,
  MAX_DISCOUNT_RATE_PERCENT,
} from './calc.mjs';

// -- usableDeduction ---------------------------------------------------

test('usableDeduction: a deduction under available income is fully usable, no NOL', () => {
  const r = usableDeduction(10000, 50000);
  assert.equal(r.usable, 10000);
  assert.equal(r.excess, 0);
  assert.equal(r.createsOrIncreasesNol, false);
});

test('usableDeduction: a deduction larger than income is capped, excess flagged', () => {
  const r = usableDeduction(50000, 10000);
  assert.equal(r.usable, 10000);
  assert.equal(r.excess, 40000);
  assert.equal(r.createsOrIncreasesNol, true);
});

test('usableDeduction: zero or negative income before the deduction makes the whole deduction NOL-creating', () => {
  const zero = usableDeduction(20000, 0);
  assert.equal(zero.usable, 0);
  assert.equal(zero.excess, 20000);
  assert.equal(zero.createsOrIncreasesNol, true);

  const negative = usableDeduction(20000, -5000);
  assert.equal(negative.usable, 0);
  assert.equal(negative.excess, 20000);
  assert.equal(negative.createsOrIncreasesNol, true);
});

test('usableDeduction: a zero deduction against a loss year is not flagged as NOL-creating', () => {
  const r = usableDeduction(0, -5000);
  assert.equal(r.usable, 0);
  assert.equal(r.excess, 0);
  assert.equal(r.createsOrIncreasesNol, false);
});

test('usableDeduction: negative or non-numeric deduction is treated as zero', () => {
  const r = usableDeduction(-1000, 50000);
  assert.equal(r.deduction, 0);
  assert.equal(r.usable, 0);
});

// -- computeYearOutcome --------------------------------------------------

test('computeYearOutcome: cash savings is the usable deduction times the rate', () => {
  const r = computeYearOutcome(20000, 100000, 21);
  assert.equal(r.usable, 20000);
  assert.ok(Math.abs(r.cashSavings - 4200) < 1e-9);
});

test('computeYearOutcome: capped deduction only saves tax on the usable portion', () => {
  const r = computeYearOutcome(20000, 5000, 21);
  assert.equal(r.usable, 5000);
  assert.equal(r.excess, 15000);
  assert.ok(Math.abs(r.cashSavings - 1050) < 1e-9);
  assert.equal(r.createsOrIncreasesNol, true);
});

test('computeYearOutcome: rate is clamped to 0-100', () => {
  const negRate = computeYearOutcome(10000, 50000, -5);
  assert.equal(negRate.ratePercent, 0);
  const bigRate = computeYearOutcome(10000, 50000, 150);
  assert.equal(bigRate.ratePercent, 100);
});

// -- presentValue ---------------------------------------------------------

test('presentValue: at 0% discount rate, PV equals the nominal sum', () => {
  assert.equal(presentValue([1000, 1000], 0), 2000);
});

test('presentValue: a positive discount rate makes a later cash flow worth less', () => {
  const pv = presentValue([0, 1000], 0.06);
  assert.ok(pv < 1000);
  assert.ok(Math.abs(pv - 1000 / 1.06) < 1e-9);
});

test('presentValue: a negative discount rate makes a later cash flow worth MORE than its face value', () => {
  const pv = presentValue([0, 1000], -0.05);
  assert.ok(pv > 1000);
});

// -- compareCatchUpPaths: zero balance ------------------------------------

test('zero remaining balance: both paths produce zero savings and a no-balance finding', () => {
  const result = compareCatchUpPaths({ remainingBalance: 0, income2025: 100000, income2026: 100000, ratePercent2025: 21, ratePercent2026: 21 });
  assert.equal(result.oneYear.nominalTotal, 0);
  assert.equal(result.twoYear.nominalTotal, 0);
  assert.equal(result.pvDifference, 0);
  assert.equal(result.recommendedPath, 'tie');
  assert.ok(result.findings.some((f) => /No remaining balance/i.test(f.title)));
});

test('negative remaining balance is treated as zero, not thrown', () => {
  const result = compareCatchUpPaths({ remainingBalance: -5000, income2025: 100000, income2026: 100000, ratePercent2025: 21, ratePercent2026: 21 });
  assert.equal(result.balance, 0);
  assert.equal(result.oneYear.nominalTotal, 0);
});

// -- compareCatchUpPaths: the core 1-year vs 2-year split -----------------

test('identical rates both years, ample income: the 1-year path has the higher present value at a positive discount rate', () => {
  const result = compareCatchUpPaths({
    remainingBalance: 100000,
    income2025: 500000,
    income2026: 500000,
    ratePercent2025: 21,
    ratePercent2026: 21,
    discountRatePercent: 6,
  });
  // Same rate both years and ample income means nominal totals are equal --
  // the only thing that can separate the paths is time value, and getting
  // the saving sooner (1-year) is worth more at a positive discount rate.
  assert.ok(Math.abs(result.oneYear.nominalTotal - result.twoYear.nominalTotal) < 1e-6);
  assert.ok(result.oneYear.presentValue > result.twoYear.presentValue);
  assert.equal(result.recommendedPath, '1-year');
});

test('identical rates AND a 0% discount rate: the two paths are a genuine tie', () => {
  const result = compareCatchUpPaths({
    remainingBalance: 100000,
    income2025: 500000,
    income2026: 500000,
    ratePercent2025: 21,
    ratePercent2026: 21,
    discountRatePercent: 0,
  });
  assert.ok(Math.abs(result.pvDifference) < 1e-6);
  assert.equal(result.recommendedPath, 'tie');
});

test('a materially higher 2026 rate favors the 2-year path even against time-value discounting', () => {
  const result = compareCatchUpPaths({
    remainingBalance: 100000,
    income2025: 500000,
    income2026: 500000,
    ratePercent2025: 12,
    ratePercent2026: 37,
    discountRatePercent: 6,
  });
  assert.equal(result.recommendedPath, '2-year');
  assert.ok(result.twoYear.nominalTotal > result.oneYear.nominalTotal);
});

test('a materially higher 2025 rate favors the 1-year path', () => {
  const result = compareCatchUpPaths({
    remainingBalance: 100000,
    income2025: 500000,
    income2026: 500000,
    ratePercent2025: 37,
    ratePercent2026: 12,
    discountRatePercent: 6,
  });
  assert.equal(result.recommendedPath, '1-year');
});

// -- compareCatchUpPaths: deduction exceeding income --------------------

test('deduction exceeding 2025 income under the full-balance path, but not under the smaller half-balance path', () => {
  // Full balance (200000) exceeds 2025 income (150000) -- NOL-flagged.
  // Half the balance (100000) does not -- not NOL-flagged. This isolates
  // the "exceeds income" cap from the split itself.
  const result = compareCatchUpPaths({
    remainingBalance: 200000,
    income2025: 150000,
    income2026: 500000,
    ratePercent2025: 21,
    ratePercent2026: 21,
  });
  assert.equal(result.oneYear[2025].usable, 150000);
  assert.equal(result.oneYear[2025].createsOrIncreasesNol, true);
  assert.equal(result.twoYear[2025].deductionRequested, 100000);
  assert.equal(result.twoYear[2025].createsOrIncreasesNol, false);
  assert.ok(result.findings.some((f) => /1-year path, 2025.*exceeds/i.test(f.title)));
});

test('deduction exceeding income in BOTH years under the 2-year split still creates NOL there too', () => {
  const result = compareCatchUpPaths({
    remainingBalance: 200000,
    income2025: 10000,
    income2026: 10000,
    ratePercent2025: 21,
    ratePercent2026: 21,
  });
  assert.equal(result.twoYear[2025].createsOrIncreasesNol, true);
  assert.equal(result.twoYear[2026].createsOrIncreasesNol, true);
  assert.equal(result.oneYear[2025].createsOrIncreasesNol, true);
  const titles = result.findings.filter((f) => f.severity === 'high').map((f) => f.title);
  assert.ok(titles.some((t) => /1-year path, 2025/.test(t)));
  assert.ok(titles.some((t) => /2-year path, 2025/.test(t)));
  assert.ok(titles.some((t) => /2-year path, 2026/.test(t)));
});

test('a loss year (negative income before the deduction) produces zero cash savings that year, not a thrown error', () => {
  const result = compareCatchUpPaths({
    remainingBalance: 60000,
    income2025: -20000,
    income2026: 200000,
    ratePercent2025: 21,
    ratePercent2026: 21,
  });
  assert.equal(result.oneYear[2025].usable, 0);
  assert.equal(result.oneYear[2025].cashSavings, 0);
  assert.equal(result.oneYear[2025].createsOrIncreasesNol, true);
});

// -- compareCatchUpPaths: negative/zero discount rate ----------------------

test('a zero discount rate is accepted and does not throw', () => {
  const result = compareCatchUpPaths({ remainingBalance: 50000, income2025: 200000, income2026: 200000, ratePercent2025: 21, ratePercent2026: 21, discountRatePercent: 0 });
  assert.equal(result.discountRatePercent, 0);
  assert.ok(Number.isFinite(result.pvDifference));
});

test('a negative discount rate is accepted, clamped to the floor, and reverses the usual time-value preference', () => {
  const result = compareCatchUpPaths({
    remainingBalance: 100000,
    income2025: 500000,
    income2026: 500000,
    ratePercent2025: 21,
    ratePercent2026: 21,
    discountRatePercent: -10,
  });
  assert.equal(result.discountRatePercent, -10);
  // With identical rates and a negative discount rate, a later dollar is
  // worth MORE than a dollar now, so the 2-year path (which shifts saving
  // into 2026) should have the higher present value.
  assert.equal(result.recommendedPath, '2-year');
});

test('a discount rate far outside the sane range is clamped, not passed through raw', () => {
  const tooLow = compareCatchUpPaths({ remainingBalance: 10000, income2025: 50000, income2026: 50000, ratePercent2025: 21, ratePercent2026: 21, discountRatePercent: -500 });
  assert.equal(tooLow.discountRatePercent, MIN_DISCOUNT_RATE_PERCENT);
  const tooHigh = compareCatchUpPaths({ remainingBalance: 10000, income2025: 50000, income2026: 50000, ratePercent2025: 21, ratePercent2026: 21, discountRatePercent: 500 });
  assert.equal(tooHigh.discountRatePercent, MAX_DISCOUNT_RATE_PERCENT);
});

test('an unspecified discount rate falls back to the documented default', () => {
  const result = compareCatchUpPaths({ remainingBalance: 10000, income2025: 50000, income2026: 50000, ratePercent2025: 21, ratePercent2026: 21 });
  assert.equal(result.discountRatePercent, DEFAULT_DISCOUNT_RATE_PERCENT);
});

// -- compareCatchUpPaths: the 2-year split and rounding --------------------

test('the 2-year split sums exactly to the original balance for an even amount', () => {
  const result = compareCatchUpPaths({ remainingBalance: 100000, income2025: 500000, income2026: 500000, ratePercent2025: 21, ratePercent2026: 21 });
  assert.equal(result.twoYear[2025].deductionRequested + result.twoYear[2026].deductionRequested, 100000);
});

test('the 2-year split sums exactly to the original balance for an amount with cents', () => {
  const result = compareCatchUpPaths({ remainingBalance: 100000.01, income2025: 500000, income2026: 500000, ratePercent2025: 21, ratePercent2026: 21 });
  const sum = result.twoYear[2025].deductionRequested + result.twoYear[2026].deductionRequested;
  assert.ok(Math.abs(sum - 100000.01) < 1e-9);
});

test('the 2-year split sums exactly to the original balance for an odd-cent amount', () => {
  const result = compareCatchUpPaths({ remainingBalance: 33333.33, income2025: 500000, income2026: 500000, ratePercent2025: 21, ratePercent2026: 21 });
  const sum = result.twoYear[2025].deductionRequested + result.twoYear[2026].deductionRequested;
  assert.ok(Math.abs(sum - 33333.33) < 1e-9);
});

test('the 1-year path deducts the full balance in 2025 and nothing in 2026', () => {
  const result = compareCatchUpPaths({ remainingBalance: 75000, income2025: 500000, income2026: 500000, ratePercent2025: 21, ratePercent2026: 21 });
  assert.equal(result.oneYear[2025].deductionRequested, 75000);
  assert.equal(result.oneYear[2026].deductionRequested, 0);
  assert.equal(result.oneYear[2026].cashSavings, 0);
});

// -- pvDifferencePercent and nominalDifference sanity ----------------------

test('pvDifference and nominalDifference are consistent with the two paths\' own totals', () => {
  const result = compareCatchUpPaths({ remainingBalance: 100000, income2025: 500000, income2026: 500000, ratePercent2025: 30, ratePercent2026: 15, discountRatePercent: 6 });
  assert.ok(Math.abs(result.pvDifference - (result.oneYear.presentValue - result.twoYear.presentValue)) < 1e-9);
  assert.ok(Math.abs(result.nominalDifference - (result.oneYear.nominalTotal - result.twoYear.nominalTotal)) < 1e-9);
});

test('every result carries the federal-only / not-the-retroactive-path informational finding', () => {
  const result = compareCatchUpPaths({ remainingBalance: 10000, income2025: 50000, income2026: 50000, ratePercent2025: 21, ratePercent2026: 21 });
  assert.ok(result.findings.some((f) => /July 6, 2026/.test(f.detail)));
});

// -- money() ---------------------------------------------------------------

test('money() formats whole dollars with a thousands separator and no cents', () => {
  assert.equal(money(1000), '$1,000');
  assert.equal(money(0), '$0');
  assert.equal(money(1234567), '$1,234,567');
});
