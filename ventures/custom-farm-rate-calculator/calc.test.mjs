import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeSeasonProfit, incomeGap, DEFAULTS } from './calc.mjs';

test('the default job produces a positive break-even rate, bill rate, and profit', () => {
  const r = calculate(DEFAULTS);
  assert.ok(r.breakEvenRatePerAcre > 0);
  assert.ok(r.billRatePerAcre > r.breakEvenRatePerAcre);
  assert.ok(r.profitAtBillRate > 0);
  assert.ok(r.hoursForJob > 0);
});

test('field capacity follows the standard mph * width(ft) * efficiency / 8.25 conversion', () => {
  const r = calculate({ ...DEFAULTS, fieldSpeedMph: 5, implementWidthFt: 40, fieldEfficiencyPct: 82.5 });
  // 5 * 40 * 0.825 / 8.25 = 20 acres/hour exactly
  assert.equal(r.fieldCapacityAcresPerHour, 20);
});

test('a slower field speed means fewer acres per hour and more hours for the same job', () => {
  const fast = calculate({ ...DEFAULTS, fieldSpeedMph: 6 });
  const slow = calculate({ ...DEFAULTS, fieldSpeedMph: 3 });
  assert.ok(slow.hoursForJob > fast.hoursForJob);
  assert.ok(slow.totalCost > fast.totalCost);
});

test('fewer hours used per year raises the ownership cost per hour and the break-even rate', () => {
  const heavy = calculate({ ...DEFAULTS, hoursUsedPerYear: 500 });
  const light = calculate({ ...DEFAULTS, hoursUsedPerYear: 100 });
  assert.ok(light.ownershipCostPerHour > heavy.ownershipCostPerHour);
  assert.ok(light.breakEvenRatePerAcre > heavy.breakEvenRatePerAcre);
});

test('margin is a share of price, not a markup on cost', () => {
  const r = calculate({ ...DEFAULTS, targetMarginPct: 20 });
  const expectedRevenue = r.totalCost / (1 - 0.2);
  assert.ok(Math.abs(r.revenueAtBillRate - expectedRevenue) < 0.01);
  const actualMargin = r.profitAtBillRate / r.revenueAtBillRate;
  assert.ok(Math.abs(actualMargin - 0.2) < 0.001);
});

test('rejects a target margin of 100% or more, which would divide by zero or go negative', () => {
  assert.throws(() => calculate({ ...DEFAULTS, targetMarginPct: 100 }), /Target margin must be below 100/);
  assert.throws(() => calculate({ ...DEFAULTS, targetMarginPct: 150 }), /Target margin must be below 100/);
});

test('rejects zero or negative acres, speed, width, and hours used per year', () => {
  assert.throws(() => calculate({ ...DEFAULTS, acres: 0 }), /Acres must be greater than 0/);
  assert.throws(() => calculate({ ...DEFAULTS, fieldSpeedMph: 0 }), /Field speed must be greater than 0/);
  assert.throws(() => calculate({ ...DEFAULTS, implementWidthFt: -5 }), /Implement width must be greater than 0/);
  assert.throws(() => calculate({ ...DEFAULTS, hoursUsedPerYear: 0 }), /Hours used per year must be greater than 0/);
});

test('rejects field efficiency outside 1-100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, fieldEfficiencyPct: 0 }), /Field efficiency must be 1 or greater/);
  assert.throws(() => calculate({ ...DEFAULTS, fieldEfficiencyPct: 101 }), /Field efficiency must be 100 or less/);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, acres: 'a lot' }), /Acres must be a number/);
});

test('computeSeasonProfit sums job profit and averages across the count', () => {
  const season = computeSeasonProfit([{ profit: 500 }, { profit: 300 }, { profit: -50 }]);
  assert.equal(season.totalSeasonProfit, 750);
  assert.equal(season.jobCount, 3);
  assert.equal(season.averageProfitPerJob, 250);
});

test('computeSeasonProfit on an empty list is zero, not a division error', () => {
  const season = computeSeasonProfit([]);
  assert.equal(season.totalSeasonProfit, 0);
  assert.equal(season.jobCount, 0);
  assert.equal(season.averageProfitPerJob, 0);
});

test('incomeGap reports zero gap and zero additional jobs once the target is met', () => {
  const gap = incomeGap(1000, 1200, 400);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalJobsNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('incomeGap rounds additional jobs needed up, never down', () => {
  const gap = incomeGap(1000, 400, 300);
  assert.equal(gap.gap, 600);
  assert.equal(gap.additionalJobsNeeded, 2);
  assert.equal(gap.meetsTarget, false);
});

test('incomeGap returns null additional jobs when average profit per job is zero or negative', () => {
  const gap = incomeGap(1000, 0, 0);
  assert.equal(gap.additionalJobsNeeded, null);
  const gapNeg = incomeGap(1000, -200, -100);
  assert.equal(gapNeg.additionalJobsNeeded, null);
});
