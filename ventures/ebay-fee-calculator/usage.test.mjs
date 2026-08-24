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

test('records named feature events without storing inputs', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'target_margin_calculated');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.target_margin_calculated, 1);
  assert.ok(stored.last_day);
});

test('honors Do Not Track and Global Privacy Control', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  };
  try {
    const dntStorage = fakeStorage();
    Object.defineProperty(globalThis, 'navigator', {
      value: { doNotTrack: '1' },
      configurable: true,
    });
    recordUsage(dntStorage, false);
    assert.equal(dntStorage.getItem('ebay-fee-usage'), null);

    const gpcStorage = fakeStorage();
    Object.defineProperty(globalThis, 'navigator', {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpcStorage, false);
    assert.equal(gpcStorage.getItem('ebay-fee-usage'), null);
  } finally {
    restore();
  }
});

test('is a no-op without storage', () => {
  assert.doesNotThrow(() => recordUsage(undefined, false));
  assert.doesNotThrow(() => recordUsage(null, false));
});

test('can count a named feature event without recording content', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'share_link_copied');
  assert.equal(JSON.parse(storage.getItem('ebay-fee-usage')).share_link_copied, 1);
});

test('does not break the calculator when stored usage JSON is malformed', () => {
  const storage = {
    getItem: () => '{not-json',
    setItem: () => {},
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'order_profit_calculated'));
});

test('does not break the calculator when browser storage is unavailable', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'order_profit_calculated'));
});
