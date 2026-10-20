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

import { parsePlanReport } from './form.mjs';

test('parsePlanReport reads a headed tab report, drops totals, sums repeats', () => {
  const text = [
    'Carrier\tProduction\tPPO Adjustment',
    'Delta PPO\t$62,000.00\t($24,800.00)',
    'Cigna\t31000\t13950',
    'delta ppo\t1,000\t400',
    'Total\t94000\t39150',
  ].join('\n');
  const { plans, skipped } = parsePlanReport(text);
  assert.deepEqual(plans, [
    { planName: 'Delta PPO', grossProduction: '63000', writeOff: '25200' },
    { planName: 'Cigna', grossProduction: '31000', writeOff: '13950' },
  ]);
  assert.deepEqual(skipped, []);
});

test('parsePlanReport reads headerless CSV and reports unreadable lines', () => {
  const { plans, skipped } = parsePlanReport('MetLife,19000,6650\nBad line,abc,5');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].planName, 'MetLife');
  assert.equal(skipped.length, 1);
});

test('parsePlanReport derives the write-off from a paid column', () => {
  const { plans } = parsePlanReport('Plan,Billed,Paid\nAetna,10000,6500');
  assert.deepEqual(plans, [{ planName: 'Aetna', grossProduction: '10000', writeOff: '3500' }]);
});

test('parsePlanReport says so when the header has no usable columns', () => {
  const { plans, note } = parsePlanReport('Name,Foo,Bar\nx,1,2');
  assert.equal(plans.length, 0);
  assert.match(note, /header/);
});
