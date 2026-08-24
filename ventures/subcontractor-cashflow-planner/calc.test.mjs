import test from 'node:test';
import assert from 'node:assert/strict';
import { planCashflow } from './calc.mjs';

test('includes retention and delay in the cash requirement', () => {
  const result = planCashflow({ invoice: 10000, materials: 2500, weeklyBurn: 700, terms: 30, retention: 10, delay: 14, retentionRelease: 60, startingCash: 5000 });
  assert.equal(result.collectable, 9000);
  assert.equal(result.expectedCashDay, 44);
  assert.equal(result.cashNeeded, 6900);
  assert.equal(result.gap, 1900);
  assert.equal(result.retentionAmount, 1000);
  assert.equal(result.retentionCashDay, 104);
});

test('turns non-finite input into safe zeroes', () => {
  const result = planCashflow({ invoice: 'Infinity', weeklyBurn: 'not-a-number', startingCash: 'NaN' });
  assert.equal(result.invoice, 0);
  assert.equal(result.weeklyBurn, 0);
  assert.equal(result.startingCash, 0);
});

test('reports a surplus when current cash covers the scenario', () => {
  const result = planCashflow({ invoice: 5000, materials: 500, weeklyBurn: 350, terms: 14, startingCash: 2000 });
  assert.equal(result.gap, 0);
  assert.equal(result.surplus, 800);
  assert.equal(result.safe, true);
});
