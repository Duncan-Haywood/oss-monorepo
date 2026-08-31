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

test('dropping the price to $0 from a paid plan is unreachable, not free', () => {
  // Current revenue is positive and $0 can never match it, at any customer
  // count, so break-even is a real Infinity and headroom for churn is zero.
  const result = calculateImpact({ customers: 100, currentPrice: 20, proposedPrice: 0, monthlyCosts: 500 });
  assert.equal(result.breakEvenCustomers, Infinity);
  assert.equal(result.maxChurnRate, 0);
  assert.equal(result.revenueChange, -2000);
});

test('a free plan staying free is already at break-even, not unreachable', () => {
  // Current revenue is already $0, so $0 proposed revenue matches it at any
  // customer count — break-even is 0, and 100% churn cannot make the
  // (already-zero) revenue any worse. Before this fix, checking only
  // proposedPrice === 0 mislabeled this identically-zero case as
  // Infinity/unreachable, the same as an unrecoverable price cut.
  const result = calculateImpact({ customers: 100, currentPrice: 0, proposedPrice: 0, monthlyCosts: 500 });
  assert.equal(result.breakEvenCustomers, 0);
  assert.equal(result.maxChurnRate, 100);
  assert.equal(result.revenueChange, 0);
});
