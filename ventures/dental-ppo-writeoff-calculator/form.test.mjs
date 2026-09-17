import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlanRows } from './form.mjs';

test('a saved scenario with fewer plans than existing rows clears the rest, rather than leaving a previous fill in them', () => {
  const rows = resolvePlanRows(4, [{ planName: 'Delta PPO', grossProduction: '48000', writeOff: '9600' }]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { planName: 'Delta PPO', grossProduction: '48000', writeOff: '9600' });
  for (const row of rows.slice(1)) {
    assert.deepEqual(row, { planName: '', grossProduction: '', writeOff: '' });
  }
});

test('this is the exact shape of the live defect: the shipped example has 4 plans in a 6-row table, and a 1-plan saved scenario must not leave the other 3 example rows counted', () => {
  const EXAMPLE_PLAN_COUNT = 4;
  const rows = resolvePlanRows(6, [{ planName: 'My Only PPO', grossProduction: '20000', writeOff: '4000' }]);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].planName, 'My Only PPO');
  for (let i = 1; i < EXAMPLE_PLAN_COUNT; i += 1) {
    assert.equal(rows[i].planName, '', `row ${i} must be cleared, not left holding example data`);
  }
});

test('more plans than existing rows grows the row count to fit all of them', () => {
  const plans = Array.from({ length: 5 }, (_, i) => ({ planName: `Plan ${i}`, grossProduction: '1000', writeOff: '100' }));
  const rows = resolvePlanRows(3, plans);
  assert.equal(rows.length, 5);
  assert.equal(rows[4].planName, 'Plan 4');
});

test('an empty or missing plan list clears every existing row', () => {
  assert.deepEqual(resolvePlanRows(3, []), [
    { planName: '', grossProduction: '', writeOff: '' },
    { planName: '', grossProduction: '', writeOff: '' },
    { planName: '', grossProduction: '', writeOff: '' },
  ]);
  assert.deepEqual(resolvePlanRows(2, undefined), [
    { planName: '', grossProduction: '', writeOff: '' },
    { planName: '', grossProduction: '', writeOff: '' },
  ]);
});

test('a plan missing one of its three fields fills only that field blank, not the whole row', () => {
  const rows = resolvePlanRows(1, [{ planName: 'Cigna', writeOff: '5000' }]);
  assert.deepEqual(rows[0], { planName: 'Cigna', grossProduction: '', writeOff: '5000' });
});

test('a non-positive or missing existingRowCount still returns exactly one row per plan', () => {
  const plans = [{ planName: 'Delta', grossProduction: '1', writeOff: '1' }];
  assert.equal(resolvePlanRows(0, plans).length, 1);
  assert.equal(resolvePlanRows(-1, plans).length, 1);
  assert.equal(resolvePlanRows(undefined, plans).length, 1);
});

test('zero rows and zero plans returns an empty list rather than throwing', () => {
  assert.deepEqual(resolvePlanRows(0, []), []);
});
