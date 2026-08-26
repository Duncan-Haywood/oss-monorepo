import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateImpact } from './calc.mjs';

test('finds churn break-even for a price increase', () => {
  const result = calculateImpact({ customers: 100, currentPrice: 20, proposedPrice: 25, monthlyCosts: 500 });
  assert.equal(result.currentRevenue, 2000);
  assert.equal(result.proposedRevenue, 2500);
  assert.equal(result.breakEvenCustomers, 80);
  assert.equal(result.maxLostCustomers, 20);
  assert.equal(result.maxChurnRate, 20);
});

test('scenarios account for fixed costs', () => {
  const result = calculateImpact({ customers: 100, currentPrice: 20, proposedPrice: 25, monthlyCosts: 500 });
  assert.equal(result.scenarios[2].revenue, 2250);
  assert.equal(result.scenarios[2].contribution, 1750);
});

test('rejects negative or non-numeric input', () => {
  assert.throws(() => calculateImpact({ customers: -1, currentPrice: 20, proposedPrice: 25, monthlyCosts: 0 }), /Customers/);
  assert.throws(() => calculateImpact({ customers: 1, currentPrice: 'x', proposedPrice: 25, monthlyCosts: 0 }), /Current price/);
});
