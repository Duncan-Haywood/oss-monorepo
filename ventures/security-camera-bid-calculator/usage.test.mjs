import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _read: () => JSON.parse(map.get('security-camera-bid-usage') || '{}'),
  };
};

test('counts an event and stamps the day', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'bid_calculated');
  recordUsage(s, false, 'bid_calculated');
  const out = s._read();
  assert.equal(out.bid_calculated, 2);
  assert.match(out.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('counts distinct events separately', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'bid_calculated');
  recordUsage(s, false, 'storage_checked');
  const out = s._read();
  assert.equal(out.bid_calculated, 1);
  assert.equal(out.storage_checked, 1);
});

test('an opted-out visitor is never counted', () => {
  const s = fakeStorage();
  recordUsage(s, true, 'bid_calculated');
  assert.deepEqual(s._read(), {});
});

test('no storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'bid_calculated'));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'bid_calculated'));
});

test('a storage that throws never breaks the calculator', () => {
  // Private-mode browsers and blocked site data both throw on setItem. A usage
  // count is not worth a dead page.
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(hostile, false, 'bid_calculated'));
});

test('a bid input is never among the stored keys', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'bid_calculated');
  const keys = Object.keys(s._read());
  for (const forbidden of ['cameraCount', 'hourlyWage', 'proposedPrice', 'bidPrice', 'costFloor']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must never be stored`);
  }
  assert.deepEqual(keys.sort(), ['bid_calculated', 'last_day']);
});

test('a Do Not Track signal suppresses the count', () => {
  const original = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { doNotTrack: '1' }, configurable: true });
    const s = fakeStorage();
    recordUsage(s, false, 'bid_calculated');
    assert.deepEqual(s._read(), {});
  } finally {
    if (original === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
  }
});

test('a Global Privacy Control signal suppresses the count', () => {
  const original = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { globalPrivacyControl: true }, configurable: true });
    const s = fakeStorage();
    recordUsage(s, false, 'bid_calculated');
    assert.deepEqual(s._read(), {});
  } finally {
    if (original === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true });
  }
});
