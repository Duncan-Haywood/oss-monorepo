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
const { record, setUsageOptOut, usageOptedOut } = await import('./usage.mjs');

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => record('sale_analyzed'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('depreciation-recapture-calculator-usage', '{not-json');
  assert.doesNotThrow(() => record('sale_analyzed'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  record('sale_analyzed');
  record('sale_analyzed');
  const saved = JSON.parse(localStorage.getItem('depreciation-recapture-calculator-usage'));
  assert.equal(saved.sale_analyzed, 2);
});

test('opt-out stops counting and is remembered', () => {
  globalThis.localStorage = new FakeStorage();
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  record('sale_analyzed');
  assert.equal(localStorage.getItem('depreciation-recapture-calculator-usage'), null);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  record('sale_analyzed');
  assert.equal(localStorage.getItem('depreciation-recapture-calculator-usage'), null);
  navigator.doNotTrack = undefined;
});

test('Global Privacy Control disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.globalPrivacyControl = true;
  record('sale_analyzed');
  assert.equal(localStorage.getItem('depreciation-recapture-calculator-usage'), null);
  navigator.globalPrivacyControl = undefined;
});
