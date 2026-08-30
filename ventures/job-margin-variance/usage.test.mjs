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

test('does not throw when stored usage JSON is malformed', () => {
  const storage = new FakeStorage();
  storage.setItem('job-margin-variance-usage', '{not-json');
  assert.doesNotThrow(() => recordUsage(storage, false, {}));
});

test('records a normal count under the venture-specific key', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, {});
  recordUsage(storage, false, {});
  const saved = JSON.parse(storage.getItem('job-margin-variance-usage'));
  assert.equal(saved.report_generated, 2);
});

test('does nothing when opted out', () => {
  const storage = new FakeStorage();
  recordUsage(storage, true, {});
  assert.equal(storage.getItem('job-margin-variance-usage'), null);
});

test('Do Not Track disables counting', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, { doNotTrack: '1' });
  assert.equal(storage.getItem('job-margin-variance-usage'), null);
});

test('Global Privacy Control disables counting', () => {
  const storage = new FakeStorage();
  recordUsage(storage, false, { globalPrivacyControl: true });
  assert.equal(storage.getItem('job-margin-variance-usage'), null);
});
