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
  const event = JSON.parse(storage.values.get('window-replacement-bid-usage'));
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
  recordUsage(storage, false, 'opening_added');
  recordUsage(storage, false, 'opening_added');
  recordUsage(storage, false, 'proposed_price_compared');
  const event = JSON.parse(storage.values.get('window-replacement-bid-usage'));
  assert.equal(event.opening_added, 2);
  assert.equal(event.proposed_price_compared, 1);
});

test('records print as an aggregate event', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'quote_printed');
  const event = JSON.parse(storage.values.get('window-replacement-bid-usage'));
  assert.equal(event.quote_printed, 1);
  assert.equal(Object.hasOwn(event, 'price'), false);
});

test('stores nothing beyond event counters and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'bid_calculated');
  const keys = Object.keys(JSON.parse(storage.values.get('window-replacement-bid-usage')));
  assert.deepEqual(keys.sort(), ['bid_calculated', 'last_day']);
});

test('missing storage is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(null));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'bid_calculated'));
});
