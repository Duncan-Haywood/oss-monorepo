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

test('summary reports the direct cost, not a second copy of the walk-away price', () => {
  // Regression test: the "Estimated added cost" line used to print
  // result.walkAwayPrice a second time under a different label, so the
  // customer-facing summary silently omitted the actual direct cost
  // (labor + materials + subcontractor, before overhead markup) and
  // instead showed the walk-away price twice.
  const input = { hours: 10, wage: 20, burdenPercent: 25, materials: 100, subcontractor: 50, overheadPercent: 10, targetMarginPercent: 20 };
  const result = calculateChangeOrder(input);
  assert.equal(result.directCost, 400);
  assert.equal(result.walkAwayPrice, 440);
  assert.notEqual(result.directCost, result.walkAwayPrice);
  const text = summaryText(input, result);
  assert.match(text, /Estimated added cost \(labor, materials, subcontractor\): \$400\.00/);
  assert.match(text, /Walk-away price \(added cost \+ overhead\): \$440\.00/);
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
