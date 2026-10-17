import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

function fakeStorage(initial = null, { throwOnSet = false } = {}) {
  const values = new Map();
  if (initial !== null) values.set('employee-cost-usage', initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, next) => {
      if (throwOnSet) throw new Error('quota');
      values.set(key, next);
    },
    removeItem: (key) => values.delete(key),
    read: () => values.get('employee-cost-usage') ?? null,
  };
}

test('a count is the event name and the day, and nothing else', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'cost_compared');
  const saved = JSON.parse(store.read());
  assert.equal(saved.cost_compared, 1);
  assert.match(saved.last_day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(saved).sort(), ['cost_compared', 'last_day']);
});

test('counts accumulate across events', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'cost_compared');
  recordUsage(store, false, 'cost_compared');
  recordUsage(store, false, 'break_even_shown');
  const saved = JSON.parse(store.read());
  assert.equal(saved.cost_compared, 2);
  assert.equal(saved.break_even_shown, 1);
});

test('opting out records nothing at all', () => {
  const store = fakeStorage();
  recordUsage(store, true, 'cost_compared');
  assert.equal(store.read(), null);
});

test('no storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'cost_compared'));
});

test('a browser refusing site data does not stop the page', () => {
  assert.doesNotThrow(() => recordUsage(fakeStorage(null, { throwOnSet: true }), false, 'cost_compared'));
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
    recordUsage(store, false, 'cost_compared');
    assert.equal(store.read(), null);
  });
});

test('a Global Privacy Control browser is not counted', () => {
  withNavigator({ globalPrivacyControl: true }, () => {
    const store = fakeStorage();
    recordUsage(store, false, 'cost_compared');
    assert.equal(store.read(), null);
  });
});

test('writing the opt-out choice removes existing counters and stops new ones', () => {
  const store = fakeStorage();
  recordUsage(store, false, 'cost_compared');
  writeOptOut(store, true);
  assert.equal(readOptOut(store), true);
  recordUsage(store, false, 'cost_compared');
  assert.equal(JSON.parse(store.read() ?? '{}')?.cost_compared, undefined);
});

test('clearing the opt-out choice lets counting resume', () => {
  const store = fakeStorage();
  writeOptOut(store, true);
  writeOptOut(store, false);
  assert.equal(readOptOut(store), false);
  recordUsage(store, false, 'cost_compared');
  assert.equal(JSON.parse(store.read()).cost_compared, 1);
});
