import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

function fakeStorage(initial = null, { throwOnSet = false } = {}) {
  const map = new Map();
  if (initial !== null) map.set('kickstarter-fee-calculator-usage', initial);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, next) => {
      if (throwOnSet) throw new Error('quota');
      map.set(key, next);
    },
    removeItem: (key) => { map.delete(key); },
    read: () => map.get('kickstarter-fee-calculator-usage') ?? null,
  };
}

test('a count is the event name and the day, and nothing else', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'campaign_calculated');
  const saved = JSON.parse(store.read());
  assert.equal(saved.campaign_calculated, 1);
  assert.match(saved.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(saved).sort(), ['campaign_calculated', 'last_day']);
});

test('counts accumulate across events', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'campaign_calculated');
  recordUsage(store, false, 'campaign_calculated');
  recordUsage(store, false, 'pledge_calculated');
  const saved = JSON.parse(store.read());
  assert.equal(saved.campaign_calculated, 2);
  assert.equal(saved.pledge_calculated, 1);
});

test('opting out records nothing at all', () => {
  const store = fakeStorage();
  recordUsage(store, true, 'campaign_calculated');
  assert.equal(store.read(), null);
});

test('no storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'campaign_calculated'));
});

test('a browser refusing site data does not stop the page', () => {
  assert.doesNotThrow(() => recordUsage(fakeStorage(null, { throwOnSet: true }), false, 'campaign_calculated'));
});

function withNavigator(value, body) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
  try {
    body();
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
}

test('a Do Not Track browser is not counted', () => {
  withNavigator({ doNotTrack: '1' }, () => {
    const store = fakeStorage();
    recordUsage(store, false, 'campaign_calculated');
    assert.equal(store.read(), null);
  });
});

test('a Global Privacy Control browser is not counted', () => {
  withNavigator({ globalPrivacyControl: true }, () => {
    const store = fakeStorage();
    recordUsage(store, false, 'campaign_calculated');
    assert.equal(store.read(), null);
  });
});

test('opting out clears existing counters and stops new ones', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'campaign_calculated');
  writeOptOut(store, true);
  assert.equal(store.read(), null);
  recordUsage(store, false, 'campaign_calculated');
  assert.equal(store.read(), null);
});

test('opting back in lets counting resume', () => {
  const store = fakeStorage();
  writeOptOut(store, true);
  writeOptOut(store, false);
  assert.equal(readOptOut(store), false);
  recordUsage(store, false, 'campaign_calculated');
  assert.ok(store.read() !== null);
});

test('a missing localStorage never throws when reading opt-out', () => {
  assert.doesNotThrow(() => readOptOut(null));
});

test('corrupt stored JSON is treated as empty rather than thrown', () => {
  const store = fakeStorage('{not json');
  assert.doesNotThrow(() => recordUsage(store, false, 'campaign_calculated'));
});
