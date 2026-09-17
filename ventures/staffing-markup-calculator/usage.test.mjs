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
  recordUsage(store, false, 'placement_priced');
  const saved = JSON.parse(store.read());
  assert.equal(saved.placement_priced, 1);
  assert.match(saved.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(saved).sort(), ['last_day', 'placement_priced']);
});

test('counts accumulate across events', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'placement_priced');
  recordUsage(store, false, 'placement_priced');
  recordUsage(store, false, 'ladder_opened');
  const saved = JSON.parse(store.read());
  assert.equal(saved.placement_priced, 2);
  assert.equal(saved.ladder_opened, 1);
});

test('opting out records nothing at all', () => {
  const store = fakeStorage();
  recordUsage(store, true, 'placement_priced');
  assert.equal(store.read(), null);
});

test('no storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'placement_priced'));
});

test('a browser refusing site data does not stop the page', () => {
  assert.doesNotThrow(() => recordUsage(fakeStorage(null, { throwOnSet: true }), false, 'placement_priced'));
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
    recordUsage(store, false, 'placement_priced');
    assert.equal(store.read(), null);
  });
});

test('a Global Privacy Control browser is not counted', () => {
  withNavigator({ globalPrivacyControl: true }, () => {
    const store = fakeStorage();
    recordUsage(store, false, 'placement_priced');
    assert.equal(store.read(), null);
  });
});
