import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, incomeGap, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.grossRevenue, 73.5);
  close(r.cogs, 23.793);
  close(r.commissionAmount, 11.025);
  close(r.cardFeeAmount, 1.911);
  close(r.mileageCost, 5.36);
  close(r.laborHours, 32 / 60);
  close(r.laborCost, (32 / 60) * 22);
  close(r.machineCostPerVisit, 3.75);
  close(r.totalCost, 57.572, 0.01);
  close(r.netProfit, 15.928, 0.01);
  close(r.monthlyProfit, r.netProfit * DEFAULTS.visitsPerMonth);
  assert.ok(r.netProfit > 0, 'the default location should be profitable');
});

test('a location that sells nothing still pays commission-free but keeps fixed costs, and profit is negative', () => {
  const r = calculate({ ...DEFAULTS, unitsSold: 0 });
  assert.equal(r.grossRevenue, 0);
  assert.equal(r.cogs, 0);
  assert.equal(r.commissionAmount, 0);
  assert.equal(r.cardFeeAmount, 0);
  assert.ok(r.netProfit < 0, 'labor, mileage, and machine cost still apply with zero sales');
});

test('shrink adds cost on top of units sold rather than discounting revenue', () => {
  const noShrink = calculate({ ...DEFAULTS, shrinkPct: 0 });
  const withShrink = calculate({ ...DEFAULTS, shrinkPct: 10 });
  assert.equal(noShrink.grossRevenue, withShrink.grossRevenue, 'shrink must not change revenue');
  assert.ok(withShrink.cogs > noShrink.cogs, 'shrink must raise product cost');
  assert.ok(withShrink.netProfit < noShrink.netProfit);
});

test('a higher commission percentage lowers net profit by exactly the extra commission amount', () => {
  const low = calculate({ ...DEFAULTS, commissionPct: 10 });
  const high = calculate({ ...DEFAULTS, commissionPct: 20 });
  const expectedDelta = low.grossRevenue * 0.10;
  close(low.netProfit - high.netProfit, expectedDelta);
});

test('rejects a commission percentage over 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, commissionPct: 101 }), /commission/i);
});

test('rejects a card processing fee of 100% or more', () => {
  assert.throws(() => calculate({ ...DEFAULTS, cardFeePct: 100 }), /card processing fee/i);
});

test('rejects zero visits per month (division by zero for machine cost allocation)', () => {
  assert.throws(() => calculate({ ...DEFAULTS, visitsPerMonth: 0 }), /visits per month/i);
});

test('rejects a negative units-sold reading', () => {
  assert.throws(() => calculate({ ...DEFAULTS, unitsSold: -1 }), /units sold/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, pricePerUnit: 'free' }), /price per unit/i);
});

test('computeRouteProfit sums monthly profit across locations and averages it', () => {
  const route = computeRouteProfit([{ monthlyProfit: 100 }, { monthlyProfit: 40 }, { monthlyProfit: -10 }]);
  assert.equal(route.totalMonthlyProfit, 130);
  assert.equal(route.locationCount, 3);
  close(route.averageProfitPerLocation, 130 / 3);
});

test('computeRouteProfit on an empty route returns zero without dividing by zero', () => {
  const route = computeRouteProfit([]);
  assert.equal(route.totalMonthlyProfit, 0);
  assert.equal(route.locationCount, 0);
  assert.equal(route.averageProfitPerLocation, 0);
});

test('incomeGap reports the shortfall and locations needed to close it', () => {
  const gap = incomeGap(1000, 700, 100);
  assert.equal(gap.gap, 300);
  assert.equal(gap.additionalLocationsNeeded, 3);
  assert.equal(gap.meetsTarget, false);
});

test('incomeGap reports goal met with zero locations needed once profit clears the target', () => {
  const gap = incomeGap(1000, 1200, 100);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalLocationsNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('incomeGap cannot compute additional locations needed when the average profit per location is zero or negative', () => {
  const gap = incomeGap(1000, 0, 0);
  assert.equal(gap.additionalLocationsNeeded, null);
  assert.equal(gap.meetsTarget, false);
});
