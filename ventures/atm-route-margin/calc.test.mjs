import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, incomeGap, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.grossSurcharge, 605);
  close(r.commissionAmount, 242);
  close(r.processingCost, 66);
  close(r.cashCost, 20);
  close(r.mileageCost, 26.8);
  close(r.armoredCost, 0);
  close(r.laborHours, 160 / 60);
  close(r.laborCost, (160 / 60) * 25);
  close(r.totalCost, 481.467, 0.01);
  close(r.netProfit, 123.533, 0.01);
  assert.ok(r.netProfit > 0, 'the default location should be profitable');
});

test('a location with zero withdrawals still pays the flat fee, cash cost, labor, and machine cost', () => {
  const r = calculate({ ...DEFAULTS, monthlyWithdrawals: 0 });
  assert.equal(r.grossSurcharge, 0);
  assert.equal(r.commissionAmount, 0);
  assert.equal(r.processingCost, 0);
  assert.ok(r.netProfit < 0, 'cash cost, labor, mileage, and machine cost still apply with zero withdrawals');
});

test('a flat placement fee applies even with commission set to zero', () => {
  const r = calculate({ ...DEFAULTS, locationCommissionPct: 0, locationFlatFee: 150 });
  assert.equal(r.commissionAmount, 150);
});

test('a higher commission percentage lowers net profit by exactly the extra commission amount', () => {
  const low = calculate({ ...DEFAULTS, locationCommissionPct: 30 });
  const high = calculate({ ...DEFAULTS, locationCommissionPct: 40 });
  const expectedDelta = low.grossSurcharge * 0.10;
  close(low.netProfit - high.netProfit, expectedDelta);
});

test('vault cash cost scales with the average cash load and the annual rate', () => {
  const lowLoad = calculate({ ...DEFAULTS, averageCashLoad: 1000 });
  const highLoad = calculate({ ...DEFAULTS, averageCashLoad: 5000 });
  close(highLoad.cashCost - lowLoad.cashCost, (5000 - 1000) * (DEFAULTS.cashCostAnnualRatePct / 100 / 12));
  assert.ok(highLoad.netProfit < lowLoad.netProfit);
});

test('processing fee applies per transaction, independent of the surcharge fee', () => {
  const r = calculate({ ...DEFAULTS, processingFeePerTxn: 0.5 });
  close(r.processingCost, DEFAULTS.monthlyWithdrawals * 0.5);
});

test('rejects a commission percentage over 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, locationCommissionPct: 101 }), /commission/i);
});

test('rejects a cash cost of capital rate over 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, cashCostAnnualRatePct: 150 }), /cash cost of capital/i);
});

test('rejects a negative monthly withdrawal count', () => {
  assert.throws(() => calculate({ ...DEFAULTS, monthlyWithdrawals: -1 }), /monthly withdrawals/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, surchargeFee: 'free' }), /surcharge fee/i);
});

test('computeRouteProfit sums monthly profit across locations and averages it', () => {
  const route = computeRouteProfit([{ monthlyProfit: 200 }, { monthlyProfit: 80 }, { monthlyProfit: -20 }]);
  assert.equal(route.totalMonthlyProfit, 260);
  assert.equal(route.locationCount, 3);
  close(route.averageProfitPerLocation, 260 / 3);
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
