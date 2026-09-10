import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function fakeStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('records only an aggregate local event', () => {
  const storage = fakeStorage();
  recordUsage(storage);
  const event = JSON.parse(storage.values.get('certified-payroll-usage'));
  assert.equal(event.week_calculated, 1);
  assert.match(event.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('honors opt out', () => {
  let called = false;
  recordUsage({ setItem: () => { called = true; } }, true);
  assert.equal(called, false);
});

test('supports a named aggregate event without recording inputs', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'ratio_checked');
  recordUsage(storage, false, 'ratio_checked');
  recordUsage(storage, false, 'summary_copied');
  const event = JSON.parse(storage.values.get('certified-payroll-usage'));
  assert.equal(event.ratio_checked, 2);
  assert.equal(event.summary_copied, 1);
});

test('stores nothing beyond event counters and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'week_calculated');
  const keys = Object.keys(JSON.parse(storage.values.get('certified-payroll-usage')));
  assert.deepEqual(keys.sort(), ['last_day', 'week_calculated']);
});

test('missing storage is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(null));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'week_calculated'));
});
