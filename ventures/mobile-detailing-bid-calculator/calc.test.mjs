import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from './calc.mjs';

test('includes the whole stop, not just detailing time', () => {
  const result = calculateQuote({ serviceHours: 3, travelHours: 1, setupHours: .25, cleanupHours: .25, wage: 20, burdenPercent: 25, supplies: 30, vehicleCost: 10, overheadPercent: 10, targetMarginPercent: 25 });
  assert.equal(result.totalHours, 4.5);
  assert.equal(result.laborCost, 112.5);
  assert.equal(result.cost, 167.75);
  assert.equal(result.recommendedPrice, 223.66666666666666);
});

test('compares an offered price without hiding a loss', () => {
  const result = calculateQuote({ serviceHours: 2, wage: 20, proposedPrice: 40 });
  assert.equal(result.profit, 0);
  assert.equal(result.marginAtProposed, 0);
});

test('negative and empty inputs cannot create negative costs', () => {
  const result = calculateQuote({ serviceHours: -2, wage: -20, supplies: 'nope' });
  assert.equal(result.cost, 0);
  assert.equal(result.recommendedPrice, 0);
});
