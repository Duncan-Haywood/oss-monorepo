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

test('counts the whole stop — travel, setup, and cleanup hours — in loaded labor', () => {
  const result = calculateBid({
    targetPrice: 180,
    laborHours: 3,
    travelHours: 0.75,
    setupHours: 0.25,
    cleanupHours: 0.25,
    travelMiles: 24,
    vehicleRate: 0.67,
    wage: 28,
    burdenPercent: 25,
    supplies: 18,
    overhead: 12,
    paymentRate: 3,
    targetMargin: 35,
  });
  assert.equal(result.totalHours, 4.25);
  assert.equal(result.loadedLaborRate, 35);
  assert.equal(result.laborCost, 148.75);
  assert.equal(Number(result.travelCost.toFixed(2)), 16.08);
  assert.equal(Number(result.directCosts.toFixed(2)), 194.83);
  assert.ok(result.contribution < 0, 'a $180 bid is underwater once loaded labor is on the ticket');
  assert.ok(result.profit < 0);
  assert.ok(result.targetQuote > 180);
});

test('a proposed quote that hides a loss is still reported as a loss', () => {
  const result = calculateBid({
    targetPrice: 120,
    laborHours: 3,
    travelHours: 1,
    setupHours: 0.5,
    cleanupHours: 0.5,
    wage: 30,
    burdenPercent: 20,
    travelMiles: 0,
    vehicleRate: 0,
    supplies: 10,
    overhead: 0,
    paymentRate: 0,
    targetMargin: 40,
  });
  assert.equal(result.totalHours, 5);
  assert.equal(result.laborCost, 180);
  assert.equal(result.totalCost, 190);
  assert.equal(result.profit, -70);
  assert.equal(result.marginAtProposed, (120 - 190) / 120 * 100);
});
