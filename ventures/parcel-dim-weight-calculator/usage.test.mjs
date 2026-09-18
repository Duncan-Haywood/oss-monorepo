import test from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new FakeStorage();
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const { recordUsage, usageAllowed, clearUsage } = await import('./usage.mjs');

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => recordUsage('weight_calculated'));
  assert.equal(usageAllowed(), false);
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('parcel-dim-weight-usage', '{not-json');
  assert.doesNotThrow(() => recordUsage('weight_calculated'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('weight_calculated');
  recordUsage('weight_calculated');
  const saved = JSON.parse(localStorage.getItem('parcel-dim-weight-usage'));
  assert.equal(saved.weight_calculated, 2);
});

test('clearUsage opts out and the choice survives a reload', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('weight_calculated');
  clearUsage();
  assert.equal(usageAllowed(), false);
  recordUsage('weight_calculated');
  assert.equal(localStorage.getItem('parcel-dim-weight-usage'), null);
  // The opt-out is what persists: a fresh module read of the same storage
  // must still refuse to count.
  assert.equal(localStorage.getItem('parcel-dim-weight-usage-off'), '1');
});

test('an explicit Do Not Track or Global Privacy Control signal stops counting', () => {
  globalThis.localStorage = new FakeStorage();
  Object.defineProperty(globalThis, 'navigator', { value: { doNotTrack: '1' }, configurable: true });
  assert.equal(usageAllowed(), false);
  Object.defineProperty(globalThis, 'navigator', { value: { globalPrivacyControl: true }, configurable: true });
  assert.equal(usageAllowed(), false);
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  assert.equal(usageAllowed(), true);
});
