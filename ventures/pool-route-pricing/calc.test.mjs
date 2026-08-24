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
