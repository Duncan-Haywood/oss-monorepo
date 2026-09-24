import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

function fakeStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('records only an aggregate local event', () => {
  const storage = fakeStorage();
  recordUsage(storage);
  const event = JSON.parse(storage.values.get('auto-glass-bid-usage'));
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
  recordUsage(storage, false, 'preset_applied');
  recordUsage(storage, false, 'preset_applied');
  recordUsage(storage, false, 'proposed_price_compared');
  const event = JSON.parse(storage.values.get('auto-glass-bid-usage'));
  assert.equal(event.preset_applied, 2);
  assert.equal(event.proposed_price_compared, 1);
});

test('stores nothing beyond event counters and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'bid_calculated');
  const keys = Object.keys(JSON.parse(storage.values.get('auto-glass-bid-usage')));
  assert.deepEqual(keys.sort(), ['bid_calculated', 'last_day']);
});

test('missing storage is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(null));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'bid_calculated'));
});

test('opting out removes the counters and persists the choice', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'bid_calculated');
  assert.ok(storage.values.has('auto-glass-bid-usage'));
  writeOptOut(storage, true);
  assert.equal(storage.values.has('auto-glass-bid-usage'), false);
  assert.equal(readOptOut(storage), true);
  recordUsage(storage, false, 'bid_calculated');
  assert.equal(storage.values.has('auto-glass-bid-usage'), false);
});

test('opting back in clears the stored preference', () => {
  const storage = fakeStorage();
  writeOptOut(storage, true);
  assert.equal(readOptOut(storage), true);
  writeOptOut(storage, false);
  assert.equal(readOptOut(storage), false);
});

test('a storage accessor that throws reads as opted out, never as consent', () => {
  const throwing = { getItem: () => { throw new Error('blocked'); } };
  assert.equal(readOptOut(throwing), false);
});
