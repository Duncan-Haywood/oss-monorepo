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

test('a cleared field is an error, not a silent $0 (blank current price once read as 100% churn headroom)', () => {
  const base = { customers: 100, currentPrice: '20', proposedPrice: '25', monthlyCosts: '500' };
  for (const id of Object.keys(base)) {
    for (const blank of ['', '   ', null, undefined]) {
      assert.throws(() => calculateImpact({ ...base, [id]: blank }), /Enter /, `${id}=${JSON.stringify(blank)}`);
    }
  }
  // A typed 0 is still a real answer.
  assert.equal(calculateImpact({ ...base, monthlyCosts: '0' }).monthlyCosts, 0);
});

test('contribution before and after the change nets fixed costs out of revenue', () => {
  const result = calculateImpact({ customers: 100, currentPrice: 20, proposedPrice: 25, monthlyCosts: 500 });
  assert.equal(result.currentContribution, 1500);
  assert.equal(result.proposedContribution, 2000);
});

test('the scenario table prints exactly the 0, 5, 10, 15 and 20% churn rows the page promises', () => {
  // The FAQ names these five columns; a row silently moved to 1% or 21%
  // would make the page disagree with its own text.
  const result = calculateImpact({ customers: 100, currentPrice: 20, proposedPrice: 25, monthlyCosts: 500 });
  assert.deepEqual(result.scenarios.map(s => s.churn), [0, 5, 10, 15, 20]);
  assert.deepEqual(result.scenarios.map(s => s.customers), [100, 95, 90, 85, 80]);
  assert.equal(result.scenarios[0].contribution, 2000);
  assert.equal(result.scenarios[4].contribution, 1500);
});

test('zero subscribers has zero churn headroom, not a made-up rate', () => {
  const result = calculateImpact({ customers: 0, currentPrice: 20, proposedPrice: 25, monthlyCosts: 500 });
  assert.equal(result.maxChurnRate, 0);
  assert.equal(result.breakEvenCustomers, 0);
});

test('inputs too large to multiply are an error, not a price increase read as a revenue loss', () => {
  // 1e200 subscribers x $1e200 overflows to Infinity, and Infinity - Infinity
  // is NaN: a price doubling then read "0.0%, this price change lowers
  // revenue before churn" with break-even "not achievable".
  assert.throws(
    () => calculateImpact({ customers: '1e200', currentPrice: '1e200', proposedPrice: '2e200', monthlyCosts: '0' }),
    /too large/,
  );
  assert.throws(() => calculateImpact({ customers: 1, currentPrice: 1, proposedPrice: 1, monthlyCosts: '1e400' }), /Monthly costs/);
});
