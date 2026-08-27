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
  const event = JSON.parse(storage.values.get('janitorial-bid-usage'));
  assert.equal(event.bid_calculated, 1);
  assert.match(event.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('honors opt out', () => {
  let called = false;
  recordUsage({ setItem: () => { called = true; } }, true);
  assert.equal(called, false);
});

test('supports a named aggregate event without recording inputs', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'area_added');
  recordUsage(storage, false, 'area_added');
  recordUsage(storage, false, 'shift_added');
  recordUsage(storage, false, 'proposed_price_compared');
  recordUsage(storage, false, 'project_added');
  recordUsage(storage, false, 'project_priced');
  recordUsage(storage, false, 'space_named');
  recordUsage(storage, false, 'frequency_reduction_compared');
  recordUsage(storage, false, 'supply_responsibility_compared');
  recordUsage(storage, false, 'initial_clean_compared');
  recordUsage(storage, false, 'summary_downloaded');
  const event = JSON.parse(storage.values.get('janitorial-bid-usage'));
  assert.equal(event.area_added, 2);
  assert.equal(event.shift_added, 1);
  assert.equal(event.proposed_price_compared, 1);
  assert.equal(event.project_added, 1);
  assert.equal(event.project_priced, 1);
  assert.equal(event.space_named, 1);
  assert.equal(event.frequency_reduction_compared, 1);
  assert.equal(event.supply_responsibility_compared, 1);
  assert.equal(event.initial_clean_compared, 1);
  assert.equal(event.summary_downloaded, 1);
});

test('stores nothing beyond event counters and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'bid_calculated');
  const keys = Object.keys(JSON.parse(storage.values.get('janitorial-bid-usage')));
  assert.deepEqual(keys.sort(), ['bid_calculated', 'last_day']);
});

test('missing storage is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(null));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'bid_calculated'));
});
