import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateQuote, priceAt } from './calc.mjs';

const input = { diagnosticHours: 0.5, repairHours: 1.5, travelHours: 0.5, laborRate: 80, tripCost: 35, partsCost: 120, partsMarkup: 25, callbackReserve: 5, overheadRate: 10, targetMargin: 30 };

test('separates loaded labor, marked-up parts, reserve, and target margin', () => {
  const result = calculateQuote(input);
  assert.equal(result.laborHours, 2.5);
  assert.equal(result.labor, 200);
  assert.equal(result.parts, 150);
  assert.equal(result.cost, 444.675);
  assert.equal(result.target, 635.25);
});

test('price sensitivity reports loss below walk-away floor', () => {
  const result = priceAt(input, 400);
  assert.ok(Math.abs(result.profit + 44.675) < 1e-9);
  assert.ok(result.margin < 0);
});

test('rejects negative assumptions', () => {
  assert.throws(() => calculateQuote({ ...input, partsCost: -1 }), /partsCost/);
});
