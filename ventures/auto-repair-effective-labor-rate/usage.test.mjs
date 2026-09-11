import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function fakeStorage(initial = null, { throwOnSet = false } = {}) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      if (throwOnSet) throw new Error('quota');
      value = next;
    },
    read: () => value,
  };
}

test('a count is the event name and the day, and nothing else', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'rate_calculated');
  const saved = JSON.parse(store.read());
  assert.equal(saved.rate_calculated, 1);
  assert.match(saved.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(saved).sort(), ['last_day', 'rate_calculated']);
});

test('counts accumulate across events', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'rate_calculated');
  recordUsage(store, false, 'rate_calculated');
  recordUsage(store, false, 'scenario_saved');
  const saved = JSON.parse(store.read());
  assert.equal(saved.rate_calculated, 2);
  assert.equal(saved.scenario_saved, 1);
});

test('opting out records nothing at all', () => {
  const store = fakeStorage();
  recordUsage(store, true, 'rate_calculated');
  assert.equal(store.read(), null);
});

test('no storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'rate_calculated'));
});

test('a browser refusing site data does not stop the page', () => {
  assert.doesNotThrow(() => recordUsage(fakeStorage(null, { throwOnSet: true }), false, 'rate_calculated'));
});

/**
 * `globalThis.navigator` is a read-only accessor in modern Node, so it is
 * replaced by definition rather than by assignment — the same way the rest of
 * the ventures here test this.
 */
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
    recordUsage(store, false, 'rate_calculated');
    assert.equal(store.read(), null);
  });
});

test('a Global Privacy Control browser is not counted', () => {
  withNavigator({ globalPrivacyControl: true }, () => {
    const store = fakeStorage();
    recordUsage(store, false, 'rate_calculated');
    assert.equal(store.read(), null);
  });
});
