import test from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

globalThis.localStorage = new FakeStorage();
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
const { recordUsage } = await import('./usage.mjs');

const today = () => new Date().toISOString().slice(0, 10);

test('does not throw when storage access is blocked', () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.doesNotThrow(() => recordUsage('royalty_compared', false, blocked));
});

test('does not throw when stored usage JSON is malformed', () => {
  const storage = new FakeStorage();
  storage.setItem('kdp-royalty-calculator-usage-v1', '{not-json');
  assert.doesNotThrow(() => recordUsage('royalty_compared', false, storage));
});

test('records a normal count keyed by event and day', () => {
  const storage = new FakeStorage();
  recordUsage('royalty_compared', false, storage);
  recordUsage('royalty_compared', false, storage);
  const saved = JSON.parse(storage.getItem('kdp-royalty-calculator-usage-v1'));
  assert.equal(saved[`royalty_compared:${today()}`], 2);
});

test('does nothing when opted out', () => {
  const storage = new FakeStorage();
  recordUsage('royalty_compared', true, storage);
  assert.equal(storage.getItem('kdp-royalty-calculator-usage-v1'), null);
});

test('Do Not Track disables counting', () => {
  const storage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordUsage('royalty_compared', false, storage);
  assert.equal(storage.getItem('kdp-royalty-calculator-usage-v1'), null);
  navigator.doNotTrack = undefined;
});

test('Global Privacy Control disables counting', () => {
  const storage = new FakeStorage();
  navigator.globalPrivacyControl = true;
  recordUsage('royalty_compared', false, storage);
  assert.equal(storage.getItem('kdp-royalty-calculator-usage-v1'), null);
  navigator.globalPrivacyControl = undefined;
});
