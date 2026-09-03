import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc.mjs';

test('includes drive time in route labor hours', () => {
  const result = calculate({ accounts: 10, visits: 4, serviceMinutes: 30, driveMinutes: 15, laborRate: 30, chemicalCost: 10, overhead: 5, targetMargin: 0 });
  assert.equal(result.monthlyHours, 30);
  assert.equal(result.labor, 900);
  assert.equal(result.minimumMonthlyPrice, 135);
});

test('solves monthly price for target margin', () => {
  const result = calculate({ accounts: 1, visits: 1, serviceMinutes: 60, driveMinutes: 0, laborRate: 50, chemicalCost: 10, overhead: 15, targetMargin: 25 });
  assert.equal(result.totalCost, 75);
  assert.equal(result.minimumMonthlyPrice, 100);
});

test('rejects a target margin of 100 percent', () => {
  assert.throws(() => calculate({ accounts: 1, visits: 1, serviceMinutes: 1, driveMinutes: 1, laborRate: 1, chemicalCost: 1, overhead: 1, targetMargin: 100 }), /below 100/);
});

test('default 40-account weekly route includes windshield time', () => {
  const result = calculate({
    accounts: 40, visits: 4, serviceMinutes: 35, driveMinutes: 12,
    laborRate: 28, chemicalCost: 18, overhead: 12, targetMargin: 35,
  });
  assert.equal(result.monthlyHours, 40 * 4 * (35 + 12) / 60);
  assert.equal(result.labor, result.monthlyHours * 28);
  assert.equal(result.variableCost, 2880);
  assert.equal(result.overheadCost, 480);
  assert.equal(result.minimumMonthlyPrice, result.minimumRouteRevenue / 40);
  assert.ok(result.minimumMonthlyPrice > result.totalCost / 40);
});

test('current price is omitted when not entered', () => {
  const result = calculate({ accounts: 10, visits: 4, serviceMinutes: 30, driveMinutes: 15, laborRate: 30, chemicalCost: 10, overhead: 5, targetMargin: 25 });
  assert.equal(result.current, null);
});

test('current price above the minimum clears the target margin', () => {
  const result = calculate({
    accounts: 1, visits: 1, serviceMinutes: 60, driveMinutes: 0,
    laborRate: 50, chemicalCost: 10, overhead: 15, targetMargin: 25,
    currentPrice: 120,
  });
  // totalCost is 75, minimumMonthlyPrice is 100 (see the target-margin test above).
  assert.equal(result.current.routeRevenue, 120);
  assert.equal(result.current.profit, 45);
  assert.ok(Math.abs(result.current.margin - 37.5) < 1e-9);
  assert.equal(result.current.meetsTarget, true);
  assert.equal(result.current.belowBreakEven, false);
  assert.ok(result.current.gapToMinimum < 0);
});

test('current price below cost is flagged as below break-even', () => {
  const result = calculate({
    accounts: 1, visits: 1, serviceMinutes: 60, driveMinutes: 0,
    laborRate: 50, chemicalCost: 10, overhead: 15, targetMargin: 25,
    currentPrice: 50,
  });
  assert.equal(result.current.profit, -25);
  assert.equal(result.current.belowBreakEven, true);
  assert.equal(result.current.meetsTarget, false);
  assert.equal(result.current.gapToMinimum, 50);
});

test('current price of exactly the minimum meets target (no false negative at the boundary)', () => {
  const result = calculate({
    accounts: 1, visits: 1, serviceMinutes: 60, driveMinutes: 0,
    laborRate: 50, chemicalCost: 10, overhead: 15, targetMargin: 25,
    currentPrice: 100,
  });
  assert.equal(result.current.meetsTarget, true);
});

test('rejects a negative current price', () => {
  assert.throws(() => calculate({ accounts: 1, visits: 1, serviceMinutes: 1, driveMinutes: 1, laborRate: 1, chemicalCost: 1, overhead: 1, targetMargin: 10, currentPrice: -5 }), /zero or greater/);
});
