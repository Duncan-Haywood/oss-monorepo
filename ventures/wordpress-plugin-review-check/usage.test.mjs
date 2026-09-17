import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    _store: store,
  };
}

test('a recorded count stores only the event name and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'scan_run');
  const saved = JSON.parse(storage.getItem('wordpress-plugin-review-check-usage'));
  assert.deepEqual(Object.keys(saved).sort(), ['last_day', 'scan_run']);
  assert.equal(saved.scan_run, 1);
});

test('counts accumulate across multiple events', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'scan_run');
  recordUsage(storage, false, 'scan_run');
  recordUsage(storage, false, 'example_loaded');
  const saved = JSON.parse(storage.getItem('wordpress-plugin-review-check-usage'));
  assert.equal(saved.scan_run, 2);
  assert.equal(saved.example_loaded, 1);
});

test('opting out records nothing at all', () => {
  const storage = fakeStorage();
  recordUsage(storage, true, 'scan_run');
  assert.equal(storage.getItem('wordpress-plugin-review-check-usage'), null);
});

test('no storage present is not an error', () => {
  assert.doesNotThrow(() => recordUsage(undefined, false, 'scan_run'));
});

test('a storage setItem throw does not break the page', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => recordUsage(storage, false, 'scan_run'));
});

// Recent Node versions ship a built-in `navigator` as a getter-only global,
// so plain assignment (`globalThis.navigator = ...`) throws. defineProperty
// with configurable:true lets the test stand it up and tear it back down.
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
  withNavigator({ doNotTrack: '1' }, () => recordUsage(storage, false, 'scan_run'));
  assert.equal(storage.getItem('wordpress-plugin-review-check-usage'), null);
});

test('Global Privacy Control signal is not counted', () => {
  const storage = fakeStorage();
  withNavigator({ globalPrivacyControl: true }, () => recordUsage(storage, false, 'scan_run'));
  assert.equal(storage.getItem('wordpress-plugin-review-check-usage'), null);
});
