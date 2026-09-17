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

const KEY = 'app-store-screenshot-check-usage';

test('a recorded count stores only the event name and the day', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'check_run');
  const saved = JSON.parse(storage.getItem(KEY));
  assert.deepEqual(Object.keys(saved).sort(), ['check_run', 'last_day']);
  assert.equal(saved.check_run, 1);
});

test('counts accumulate across multiple events', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'check_run');
  recordUsage(storage, false, 'check_run');
  recordUsage(storage, false, 'example_loaded');
  const saved = JSON.parse(storage.getItem(KEY));
  assert.equal(saved.check_run, 2);
  assert.equal(saved.example_loaded, 1);
});

test('opting out records nothing at all', () => {
  const storage = fakeStorage();
  recordUsage(storage, true, 'check_run');
  assert.equal(storage.getItem(KEY), null);
});

test('a missing storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'check_run'));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'check_run'));
});

test('a storage that throws does not break the caller', () => {
  // Safari in private mode, and any browser with site data blocked. Computing
  // the result matters; counting it does not.
  const hostile = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
  assert.doesNotThrow(() => recordUsage(hostile, false, 'check_run'));
});

test('corrupt stored JSON is replaced rather than propagated', () => {
  const storage = fakeStorage();
  storage.setItem(KEY, 'not json');
  assert.doesNotThrow(() => recordUsage(storage, false, 'check_run'));
});

test('no filename, dimension or finding is ever stored', () => {
  // The privacy claim on the page is that an unreleased app's artwork never
  // leaves the machine and is not recorded even locally. This is that claim as
  // a test: the only keys that may ever appear are event counters and the day.
  const storage = fakeStorage();
  recordUsage(storage, false, 'check_run');
  recordUsage(storage, false, 'example_loaded');
  const saved = JSON.parse(storage.getItem(KEY));
  for (const key of Object.keys(saved)) {
    assert.match(key, /^(check_run|example_loaded|last_day)$/, `unexpected stored key: ${key}`);
  }
  for (const value of Object.values(saved)) {
    assert.ok(
      typeof value === 'number' || /^\d{4}-\d{2}-\d{2}$/.test(value),
      `stored value is neither a count nor a date: ${value}`,
    );
  }
});
