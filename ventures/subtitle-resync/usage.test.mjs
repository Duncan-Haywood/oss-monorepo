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
  recordUsage(storage, false, 'resync_run');
  const saved = JSON.parse(storage.getItem('subtitle-resync-usage'));
  assert.deepEqual(Object.keys(saved).sort(), ['last_day', 'resync_run']);
  assert.equal(saved.resync_run, 1);
});

test('counts accumulate across multiple events', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'resync_run');
  recordUsage(storage, false, 'resync_run');
  recordUsage(storage, false, 'example_loaded');
  const saved = JSON.parse(storage.getItem('subtitle-resync-usage'));
  assert.equal(saved.resync_run, 2);
  assert.equal(saved.example_loaded, 1);
});

test('opting out records nothing at all', () => {
  const storage = fakeStorage();
  recordUsage(storage, true, 'resync_run');
  assert.equal(storage.getItem('subtitle-resync-usage'), null);
});

test('no storage present is not an error', () => {
  assert.doesNotThrow(() => recordUsage(undefined, false, 'resync_run'));
});

test('a storage setItem throw does not break the page', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => recordUsage(storage, false, 'resync_run'));
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
  withNavigator({ doNotTrack: '1' }, () => recordUsage(storage, false, 'resync_run'));
  assert.equal(storage.getItem('subtitle-resync-usage'), null);
});

test('Global Privacy Control signal is not counted', () => {
  const storage = fakeStorage();
  withNavigator({ globalPrivacyControl: true }, () => recordUsage(storage, false, 'resync_run'));
  assert.equal(storage.getItem('subtitle-resync-usage'), null);
});

test('the opt-out choice persists across a fresh module realm (a simulated reload)', () => {
  const storage = fakeStorage();
  writeOptOut(storage, true);
  assert.equal(readOptOut(storage), true);
  recordUsage(storage, false, 'resync_run');
  assert.equal(storage.getItem('subtitle-resync-usage'), null, 'opted-out storage must stay silent even without the caller passing optedOut again');
});

test('writeOptOut(false) clears the opt-out flag and counting resumes', () => {
  const storage = fakeStorage();
  writeOptOut(storage, true);
  writeOptOut(storage, false);
  assert.equal(readOptOut(storage), false);
  recordUsage(storage, false, 'resync_run');
  assert.equal(JSON.parse(storage.getItem('subtitle-resync-usage')).resync_run, 1);
});
