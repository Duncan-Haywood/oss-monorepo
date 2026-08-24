import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    _map: map,
  };
}

test('records only an aggregate local event, never the inputs', () => {
  const storage = fakeStorage();
  recordUsage(storage, false);
  recordUsage(storage, false);
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.order_profit_calculated, 2);
  assert.ok(stored.last_day);
  // Nothing resembling a price or cost is persisted.
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'order_profit_calculated']);
});

test('honors opt out', () => {
  const storage = fakeStorage();
  recordUsage(storage, true);
  assert.equal(storage.getItem('ebay-fee-usage'), null);
});

test('is a no-op without storage', () => {
  assert.doesNotThrow(() => recordUsage(undefined, false));
  assert.doesNotThrow(() => recordUsage(null, false));
});
