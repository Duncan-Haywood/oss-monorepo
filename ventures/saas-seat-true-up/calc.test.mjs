import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrueUp, reviewMessage } from './calc.mjs';

test('quantifies unused seats and renewal exposure', () => {
  assert.deepEqual(calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4 }), {
    purchased: 20, used: 14, unused: 6, extra: 0, utilizationPercent: 70,
    monthlyAvoidable: 108, remainingAvoidable: 432, annualAvoidable: 1296,
    monthlyOverage: 0, remainingOverage: 0, annualOverage: 0,
  });
});

test('handles a zero-seat plan without dividing by zero', () => {
  assert.equal(calculateTrueUp({ seatsPurchased: 0, seatsUsed: 0, monthlyPrice: 20 }).utilizationPercent, 0);
});

test('rejects negative inputs', () => {
  assert.throws(() => calculateTrueUp({ seatsPurchased: -1, seatsUsed: 0, monthlyPrice: 10 }), /non-negative/);
});

test('used above purchased is overage, not an error', () => {
  const result = calculateTrueUp({ seatsPurchased: 20, seatsUsed: 23, monthlyPrice: 18, monthsRemaining: 4 });
  assert.equal(result.unused, 0);
  assert.equal(result.extra, 3);
  assert.equal(result.monthlyOverage, 54);
  assert.equal(result.remainingOverage, 216);
  assert.equal(result.annualOverage, 648);
  assert.match(reviewMessage(result), /over the purchased count by 3 seats/);
});
