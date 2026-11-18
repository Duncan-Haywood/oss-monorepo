import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

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
  const event = JSON.parse(storage.values.get('mini-split-bid-usage'));
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
  recordUsage(storage, false, 'head_type_changed');
  recordUsage(storage, false, 'head_type_changed');
  recordUsage(storage, false, 'proposed_price_compared');
  const event = JSON.parse(storage.values.get('mini-split-bid-usage'));
  assert.equal(event.head_type_changed, 2);
  assert.equal(event.proposed_price_compared, 1);
});

test('stores nothing beyond event counters and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'bid_calculated');
  const keys = Object.keys(JSON.parse(storage.values.get('mini-split-bid-usage')));
  assert.deepEqual(keys.sort(), ['bid_calculated', 'last_day']);
});

test('missing storage is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(null));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'bid_calculated'));
});

// Red-team 2026-11-17: four mutants in usage.mjs escaped this suite. Each test
// below names the one it guards.

test('a stored opt-out stops counting even when the caller passes optedOut=false and no browser signal is set', () => {
  const storage = fakeStorage();
  storage.removeItem = key => storage.values.delete(key);
  recordUsage(storage);
  writeOptOut(storage, true);
  assert.equal(storage.values.has('mini-split-bid-usage'), false, 'opting out removes the counters');
  assert.equal(readOptOut(storage), true);
  recordUsage(storage, false, 'bid_calculated');
  assert.equal(storage.values.has('mini-split-bid-usage'), false, 'a stored opt-out is honored without DNT or GPC');
  writeOptOut(storage, false);
  assert.equal(readOptOut(storage), false);
  recordUsage(storage);
  assert.equal(JSON.parse(storage.values.get('mini-split-bid-usage')).bid_calculated, 1);
});

test('a stored value that is JSON but not a plain object reads as empty counters', () => {
  for (const bad of ['[]', '[1,2]', '7', '"x"', 'null', 'true']) {
    const storage = fakeStorage();
    storage.values.set('mini-split-bid-usage', bad);
    recordUsage(storage);
    const event = JSON.parse(storage.values.get('mini-split-bid-usage'));
    assert.equal(Array.isArray(event), false, bad);
    assert.equal(event.bid_calculated, 1, bad);
  }
});

test('a store whose reads throw is not read as an opt-out', () => {
  assert.equal(readOptOut({ getItem() { throw new Error('SecurityError'); } }), false);
  assert.equal(readOptOut(null), false);
});

test('a navigator that throws on read does not stop counting', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    const storage = fakeStorage();
    recordUsage(storage);
    assert.equal(JSON.parse(storage.values.get('mini-split-bid-usage')).bid_calculated, 1);
  } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
  }
});
