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
  const event = JSON.parse(storage.values.get('french-drain-bid-usage'));
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
  const event = JSON.parse(storage.values.get('french-drain-bid-usage'));
  assert.equal(event.preset_applied, 2);
  assert.equal(event.proposed_price_compared, 1);
});

test('stores nothing beyond event counters and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'bid_calculated');
  const keys = Object.keys(JSON.parse(storage.values.get('french-drain-bid-usage')));
  assert.deepEqual(keys.sort(), ['bid_calculated', 'last_day']);
});

test('missing storage is a no-op rather than a crash', () => {
  assert.doesNotThrow(() => recordUsage(null));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'bid_calculated'));
});

import { readOptOut, writeOptOut } from './usage.mjs';

function withNavigator(nav, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  try { fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
  }
}

test('a stored opt-out stops recording on its own', () => {
  const storage = fakeStorage();
  writeOptOut(storage, true);
  recordUsage(storage);
  assert.equal(storage.values.has('french-drain-bid-usage'), false);
});

test('Do Not Track stops recording', () => {
  withNavigator({ doNotTrack: '1' }, () => {
    const storage = fakeStorage();
    recordUsage(storage);
    assert.equal(storage.values.has('french-drain-bid-usage'), false);
  });
});

test('Global Privacy Control stops recording', () => {
  withNavigator({ globalPrivacyControl: true }, () => {
    const storage = fakeStorage();
    recordUsage(storage);
    assert.equal(storage.values.has('french-drain-bid-usage'), false);
  });
});

test('a navigator that throws is treated as no signal', () => {
  const nav = { get doNotTrack() { throw new Error('blocked'); } };
  withNavigator(nav, () => {
    const storage = fakeStorage();
    recordUsage(storage);
    assert.equal(storage.values.has('french-drain-bid-usage'), true);
  });
});

test('readOptOut reads the flag and survives a throwing store', () => {
  const storage = fakeStorage();
  assert.equal(readOptOut(storage), false);
  storage.setItem('french-drain-bid-usage-opt-out', '1');
  assert.equal(readOptOut(storage), true);
  assert.equal(readOptOut({ getItem() { throw new Error('blocked'); } }), false);
});

test('opting out removes counters; opting back in clears the flag', () => {
  const store = new Map([['french-drain-bid-usage', '{}']]);
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  writeOptOut(storage, true);
  assert.equal(store.has('french-drain-bid-usage'), false);
  assert.equal(store.get('french-drain-bid-usage-opt-out'), '1');
  writeOptOut(storage, false);
  assert.equal(store.has('french-drain-bid-usage-opt-out'), false);
});

test('a throwing store never crashes recordUsage', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
  assert.doesNotThrow(() => recordUsage(storage));
});
