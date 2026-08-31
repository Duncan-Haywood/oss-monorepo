import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrueUp, reviewMessage } from './calc.mjs';
import { loadScenario, saveScenario, clearScenario } from './usage.mjs';
import { readFileSync } from 'node:fs';

test('quantifies unused seats and renewal exposure', () => {
  assert.deepEqual(calculateTrueUp({ seatsPurchased: 20, seatsUsed: 14, monthlyPrice: 18, monthsRemaining: 4 }), {
    purchased: 20, used: 14, unused: 6, extra: 0, overageRatePct: 0, utilizationPercent: 70,
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

test('a contracted overage premium raises extra-seat cost above list price', () => {
  const result = calculateTrueUp({ seatsPurchased: 40, seatsUsed: 43, monthlyPrice: 18, monthsRemaining: 12, overageRatePct: 20 });
  assert.equal(result.extra, 3);
  assert.equal(result.overageRatePct, 20);
  assert.equal(result.monthlyOverage, 64.8);
  assert.equal(Number(result.annualOverage.toFixed(2)), 777.6);
  assert.match(reviewMessage(result), /20% overage premium/);
});

test('saves and restores the entered totals including overage premium', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const scenario = { purchased: '20', used: '14', price: '18', months: '4', overageRate: '0' };
  assert.equal(saveScenario(storage, scenario), true);
  assert.deepEqual(loadScenario(storage), { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0 });
  clearScenario(storage);
  assert.equal(loadScenario(storage), null);
});

test('older four-field saves still restore with a zero overage premium', () => {
  const storage = { getItem: () => '{"purchased":20,"used":14,"price":18,"months":4}' };
  assert.deepEqual(loadScenario(storage), { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0 });
});

test('ignores malformed or incomplete saved scenarios', () => {
  assert.equal(loadScenario({ getItem: () => '{"purchased":null}' }), null);
  assert.equal(loadScenario({ getItem: () => '{"purchased":20,"used":14}' }), null);
  assert.equal(loadScenario({ getItem: () => '[20,14,18,4]' }), null);
  assert.equal(saveScenario({ setItem() { throw new Error('quota'); } }, { purchased: 20, used: 14, price: 18, months: 4, overageRate: 0 }), false);
});

test('the page wires save, reset, and the overage premium without uploading totals', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /Save scenario/);
  assert.match(html, /saveScenario/);
  assert.match(html, /loadScenario/);
  assert.match(html, /clearScenario/);
  assert.match(html, /id="overageRate"/);
  assert.match(html, /overageRatePct/);
  assert.match(html, /Saved scenarios store only the totals entered here/);
});
