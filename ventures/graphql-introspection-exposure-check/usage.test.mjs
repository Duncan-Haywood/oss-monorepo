import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
}

test('a recorded count stores only the event name and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'check_run');
  const saved = JSON.parse(storage.getItem('graphql-introspection-exposure-check-usage'));
  assert.deepEqual(Object.keys(saved).sort(), ['check_run', 'last_day']);
  assert.equal(saved.check_run, 1);
});

test('counts accumulate across multiple events', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'browser_check_run');
  recordUsage(storage, false, 'browser_check_run');
  recordUsage(storage, false, 'example_loaded');
  const saved = JSON.parse(storage.getItem('graphql-introspection-exposure-check-usage'));
  assert.equal(saved.browser_check_run, 2);
  assert.equal(saved.example_loaded, 1);
});

test('opting out records nothing at all', () => {
  const storage = fakeStorage();
  recordUsage(storage, true, 'check_run');
  assert.equal(storage.getItem('graphql-introspection-exposure-check-usage'), null);
});

test('no storage present is not an error', () => {
  assert.doesNotThrow(() => recordUsage(undefined, false, 'check_run'));
});

test('a storage setItem throw does not break the page', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => recordUsage(storage, false, 'check_run'));
});

test('the opt-out preference is stored independently of the counters and survives a read', () => {
  const storage = fakeStorage();
  writeOptOut(storage, true);
  assert.equal(readOptOut(storage), true);
  writeOptOut(storage, false);
  assert.equal(readOptOut(storage), false);
});

test('opting out via writeOptOut also clears any existing counters', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'check_run');
  assert.notEqual(storage.getItem('graphql-introspection-exposure-check-usage'), null);
  writeOptOut(storage, true);
  assert.equal(storage.getItem('graphql-introspection-exposure-check-usage'), null);
});

test('a blocked storage read for readOptOut is treated as not opted out', () => {
  const storage = { getItem: () => { throw new Error('blocked'); } };
  assert.equal(readOptOut(storage), false);
});

function withNavigator(value, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
}

test('Do Not Track browser signal is not counted', () => {
  const storage = fakeStorage();
  withNavigator({ doNotTrack: '1' }, () => recordUsage(storage, false, 'check_run'));
  assert.equal(storage.getItem('graphql-introspection-exposure-check-usage'), null);
});

test('Global Privacy Control signal is not counted', () => {
  const storage = fakeStorage();
  withNavigator({ globalPrivacyControl: true }, () => recordUsage(storage, false, 'check_run'));
  assert.equal(storage.getItem('graphql-introspection-exposure-check-usage'), null);
});
