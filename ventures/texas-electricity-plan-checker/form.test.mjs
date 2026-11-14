import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planToFields, fieldsToPlan, textToCredits, textToEnergy, textToTou, textToLabel, textToFees } from './form.mjs';
import { EXAMPLE, normalisePlan } from './engine.mjs';

test('every example plan survives plan -> fields -> plan', () => {
  for (const p of EXAMPLE.plans) {
    const back = fieldsToPlan(planToFields(p));
    const a = normalisePlan(p);
    const b = normalisePlan(back);
    for (const k of ['name', 'base', 'energy', 'tduFixed', 'tduCents', 'credits', 'fees', 'tou', 'label', 'termMonths', 'etf']) assert.deepEqual(b[k], a[k], `${p.name} ${k}`);
  }
});

test('short forms read the way the hint describes', () => {
  assert.deepEqual(textToEnergy('8.2 to 1000, 12.9'), [{ cents: 8.2, upTo: 1000 }, { cents: 12.9, upTo: null }]);
  assert.deepEqual(textToCredits('125 at 1000-2000; 15 at 2000+'), [{ amount: 125, min: 1000, max: 2000 }, { amount: 15, min: 2000, max: null }]);
  assert.deepEqual(textToFees('9.95 under 1,000'), [{ amount: 9.95, below: 1000 }]);
  assert.deepEqual(textToTou('0 all 21-6').map(({ name, ...w }) => w), [{ cents: 0, days: 'all', start: 21, end: 6 }]);
  assert.deepEqual(textToLabel('21.0 8.1 14.1'), { 500: 21, 1000: 8.1, 2000: 14.1 });
  assert.equal(textToLabel(''), null);
});

test('bad short forms say how to write them', () => {
  assert.throws(() => textToCredits('a lot'), /amount at min/);
  assert.throws(() => textToEnergy('cheap'), /cents to kWh/);
  assert.throws(() => textToTou('nights'), /cents days start-end/);
  assert.throws(() => textToLabel('1 2'), /three average prices/);
  assert.throws(() => fieldsToPlan({ base: 'ten' }), /base/);
});

test('share in windows is a percent in the form, a fraction in the plan', () => {
  const p = fieldsToPlan({ energy: '20', tou: '0 all 21-6', touShare: '35' });
  assert.equal(p.touShare, 0.35);
  assert.equal(planToFields(p).touShare, '35');
});
