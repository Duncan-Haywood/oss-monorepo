import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrueUp } from './calc.mjs';

test('quantifies unused seats and renewal exposure', () => {
  assert.deepEqual(calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4 }), {
    purchased: 20, used: 14, unused: 6, utilizationPercent: 70,
    monthlyAvoidable: 108, remainingAvoidable: 432, annualAvoidable: 1296,
  });
});

test('handles a zero-seat plan without dividing by zero', () => {
  assert.equal(calculateTrueUp({ seatsPurchased: 0, seatsUsed: 0, monthlyPrice: 20 }).utilizationPercent, 0);
});

test('rejects impossible or negative inputs', () => {
  assert.throws(() => calculateTrueUp({ seatsPurchased: 2, seatsUsed: 3, monthlyPrice: 10 }), /cannot exceed/);
  assert.throws(() => calculateTrueUp({ seatsPurchased: -1, seatsUsed: 0, monthlyPrice: 10 }), /non-negative/);
});
