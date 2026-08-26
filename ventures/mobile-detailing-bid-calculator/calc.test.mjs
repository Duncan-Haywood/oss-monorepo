import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid } from './calc.mjs';

test('includes mobile travel and payment fee in the quote economics', () => {
  const result = calculateBid({ targetPrice: 180, laborHours: 3, travelMiles: 24, vehicleRate: .67, supplies: 18, overhead: 12, paymentRate: 3, targetMargin: 35 });
  assert.equal(Number(result.travelCost.toFixed(2)), 16.08);
  assert.equal(result.directCosts, 46.08);
  assert.equal(result.paymentFee, 5.4);
  assert.equal(result.totalCost, 51.48);
  assert.equal(Number(result.margin.toFixed(2)), 71.4);
});

test('calculates a target-margin quote from the same assumptions', () => {
  const result = calculateBid({ laborHours: 4, travelMiles: 10, vehicleRate: .7, supplies: 20, overhead: 10, paymentRate: 3, targetMargin: 40 });
  assert.equal(Number(result.targetQuote.toFixed(2)), 64.91);
});

test('rejects unsafe or unusable inputs', () => {
  assert.throws(() => calculateBid({ laborHours: 0 }), /greater than zero/);
  assert.throws(() => calculateBid({ paymentRate: 100 }), /below 100/);
  assert.throws(() => calculateBid({ supplies: -1 }), /non-negative/);
});
