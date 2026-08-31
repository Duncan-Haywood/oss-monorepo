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
Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
const { recordUsage } = await import('./usage.mjs');

const today = () => new Date().toISOString().slice(0, 10);

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => recordUsage('impact_calculated'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('subscription-price-impact-usage-v1', '{not-json');
  assert.doesNotThrow(() => recordUsage('impact_calculated'));
});

test('records a normal count keyed by event and day', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('impact_calculated');
  recordUsage('impact_calculated');
  const saved = JSON.parse(localStorage.getItem('subscription-price-impact-usage-v1'));
  assert.equal(saved[`impact_calculated:${today()}`], 2);
});

test('does nothing when opted out', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('impact_calculated', true);
  assert.equal(localStorage.getItem('subscription-price-impact-usage-v1'), null);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordUsage('impact_calculated');
  assert.equal(localStorage.getItem('subscription-price-impact-usage-v1'), null);
  navigator.doNotTrack = undefined;
});

test('Global Privacy Control disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.globalPrivacyControl = true;
  recordUsage('impact_calculated');
  assert.equal(localStorage.getItem('subscription-price-impact-usage-v1'), null);
  navigator.globalPrivacyControl = undefined;
});
