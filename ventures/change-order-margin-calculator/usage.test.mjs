import test from 'node:test';
import assert from 'node:assert/strict';
import { usageEnabled, recordUsage, disableUsage } from './usage.mjs';

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('counting is on by default', () => {
  const storage = new FakeStorage();
  assert.equal(usageEnabled(storage, {}), true);
});

test('recordUsage stores one key per event, incrementing on repeat', () => {
  const storage = new FakeStorage();
  recordUsage(storage, 'calculated', {});
  recordUsage(storage, 'calculated', {});
  recordUsage(storage, 'summary-copied', {});
  assert.equal(storage.getItem('change-order-calculated'), '2');
  assert.equal(storage.getItem('change-order-summary-copied'), '1');
});

test('disableUsage stops further counting', () => {
  const storage = new FakeStorage();
  disableUsage(storage);
  assert.equal(usageEnabled(storage, {}), false);
  recordUsage(storage, 'calculated', {});
  assert.equal(storage.getItem('change-order-calculated'), null);
});

test('Do Not Track disables counting without touching the stored opt-out flag', () => {
  const storage = new FakeStorage();
  recordUsage(storage, 'calculated', { doNotTrack: '1' });
  assert.equal(storage.getItem('change-order-calculated'), null);
  assert.equal(storage.getItem('change-order-usage-enabled'), null);
});

test('Global Privacy Control disables counting', () => {
  const storage = new FakeStorage();
  recordUsage(storage, 'calculated', { globalPrivacyControl: true });
  assert.equal(storage.getItem('change-order-calculated'), null);
});

test('a blocked storage does not throw', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, 'calculated', {}));
  assert.doesNotThrow(() => disableUsage(storage));
});
