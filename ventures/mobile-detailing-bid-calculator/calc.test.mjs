import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, claimNote } from './calc.mjs';

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

test('an unreachable target margin is reported as unreachable, not as a negative price', () => {
  // The payment fee and the target margin are both slices of the final price.
  // At 3% + 98% they claim 101% of it, and the old arithmetic answered with a
  // negative number the page printed as advice: "quote at least -$4,608.00".
  const over = calculateBid({ targetPrice: 180, laborHours: 3, paymentRate: 3, targetMargin: 98 });
  assert.equal(over.targetQuote, Infinity);

  // Exactly 100% is the boundary: no finite price leaves anything for costs.
  const exact = calculateBid({ targetPrice: 180, laborHours: 3, paymentRate: 3, targetMargin: 97 });
  assert.equal(exact.targetQuote, Infinity);

  // Just under the boundary still solves, and solves large — the figure is
  // real, so it is not swept into the unreachable branch with the others.
  const under = calculateBid({ targetPrice: 180, laborHours: 3, paymentRate: 3, targetMargin: 96 });
  assert.ok(Number.isFinite(under.targetQuote));
  assert.ok(under.targetQuote > under.breakEven);
});

test('a high payment fee alone can put the target out of reach', () => {
  const result = calculateBid({ targetPrice: 180, laborHours: 3, paymentRate: 99, targetMargin: 50 });
  assert.equal(result.targetQuote, Infinity);
  // Break-even is still a real price here: 99% fees are survivable on their
  // own, it is the 50% margin on top that is not.
  assert.ok(Number.isFinite(result.breakEven));
});

test('ordinary targets are unaffected by the guard', () => {
  const result = calculateBid({ targetPrice: 180, laborHours: 3, paymentRate: 3, targetMargin: 35 });
  assert.ok(Number.isFinite(result.targetQuote));
  // directCosts / (1 - 0.03 - 0.35), the same arithmetic as before.
  assert.equal(Number(result.targetQuote.toFixed(2)), Number((result.directCosts / 0.62).toFixed(2)));
});

test('claimed share is the sum of the two final-price slices', () => {
  const ordinary = calculateBid({ paymentRate: 3, targetMargin: 35 });
  assert.equal(ordinary.claimedSharePct, 38);
  assert.equal(ordinary.targetReachable, true);
  assert.match(claimNote(ordinary), /38\.0% of the price, leaving 62\.0%/);

  const conflict = calculateBid({ paymentRate: 3, targetMargin: 98 });
  assert.equal(conflict.claimedSharePct, 101);
  assert.equal(conflict.targetReachable, false);
  assert.match(claimNote(conflict), /already claim 101\.0%/);
  assert.match(claimNote(conflict), /No quote can hit that target/);
});
