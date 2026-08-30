import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('does not throw when storage access is blocked', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, false, {}));
});

test('does not throw when the stored value is not numeric', () => {
  const storage = new FakeStorage();
  storage.setItem('consent-change-record:comparisons', 'not-a-number');
  assert.doesNotThrow(() => recordUsage(storage, false, {}));
});

test('records a normal count under the venture-specific key', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, {});
  recordUsage(storage, false, {});
  assert.equal(storage.getItem('consent-change-record:comparisons'), '2');
});

test('does nothing when opted out', () => {
  const storage = new FakeStorage();
  recordUsage(storage, true, {});
  assert.equal(storage.getItem('consent-change-record:comparisons'), null);
});

test('does nothing when there is no storage', () => {
  assert.doesNotThrow(() => recordUsage(null, false, {}));
});

test('Do Not Track disables counting', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, { doNotTrack: '1' });
  assert.equal(storage.getItem('consent-change-record:comparisons'), null);
});

test('Global Privacy Control disables counting', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, { globalPrivacyControl: true });
  assert.equal(storage.getItem('consent-change-record:comparisons'), null);
});
