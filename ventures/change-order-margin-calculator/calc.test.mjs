import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateChangeOrder, summaryText } from './calc.mjs';

test('loads labor, direct costs, overhead, and target margin correctly', () => {
  const result = calculateChangeOrder({ hours: 10, wage: 20, burdenPercent: 25, materials: 100, subcontractor: 50, overheadPercent: 10, targetMarginPercent: 20 });
  assert.equal(result.loadedLabor, 250);
  assert.equal(result.walkAwayPrice, 440);
  assert.equal(result.targetPrice, 550);
});

test('flags a proposed price below the cost floor', () => {
  const result = calculateChangeOrder({ hours: 8, wage: 25, proposedPrice: 100 });
  assert.equal(result.belowCost, true);
  assert.equal(result.targetMet, false);
});

test('summary is proposal-ready and contains no hidden input data', () => {
  const input = { title: 'Extra outlets', hours: 2, wage: 30, proposedPrice: 100 };
  const text = summaryText(input, calculateChangeOrder(input));
  assert.match(text, /Extra outlets/);
  assert.match(text, /Target change-order price/);
});

test('treats non-finite and negative numeric input as zero', () => {
  const result = calculateChangeOrder({
    hours: 'Infinity',
    wage: -40,
    materials: 'not a number',
    targetMarginPercent: 'NaN',
  });
  assert.equal(result.loadedLabor, 0);
  assert.equal(result.walkAwayPrice, 0);
  assert.equal(result.targetPrice, 0);
});
