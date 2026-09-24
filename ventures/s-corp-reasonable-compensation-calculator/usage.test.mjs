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
  assert.doesNotThrow(() => record('range_calculated'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('s-corp-reasonable-compensation-calculator-usage', '{not-json');
  assert.doesNotThrow(() => record('range_calculated'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  record('range_calculated');
  record('range_calculated');
  const saved = JSON.parse(localStorage.getItem('s-corp-reasonable-compensation-calculator-usage'));
  assert.equal(saved.range_calculated, 2);
});

test('opt-out stops counting and is remembered', () => {
  globalThis.localStorage = new FakeStorage();
  setUsageOptOut(true);
  assert.equal(usageOptedOut(), true);
  record('range_calculated');
  assert.equal(localStorage.getItem('s-corp-reasonable-compensation-calculator-usage'), null);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  record('range_calculated');
  assert.equal(localStorage.getItem('s-corp-reasonable-compensation-calculator-usage'), null);
  navigator.doNotTrack = undefined;
});

test('Global Privacy Control disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.globalPrivacyControl = true;
  record('range_calculated');
  assert.equal(localStorage.getItem('s-corp-reasonable-compensation-calculator-usage'), null);
  navigator.globalPrivacyControl = undefined;
});
