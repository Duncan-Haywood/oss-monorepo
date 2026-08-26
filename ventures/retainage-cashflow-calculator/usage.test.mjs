import test from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new FakeStorage();
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const { recordUsage, isUsageEnabled, setUsageEnabled } = await import('./usage.mjs');

test('records aggregate event counts without payloads', () => {
  recordUsage('calculated'); recordUsage('calculated');
  assert.equal(localStorage.getItem('retainage-cashflow:usage:calculated'), '2');
});

test('opt out is reversible', () => {
  setUsageEnabled(false); assert.equal(isUsageEnabled(), false);
  recordUsage('copied');
  assert.equal(localStorage.getItem('retainage-cashflow:usage:copied'), null);
  setUsageEnabled(true); assert.equal(isUsageEnabled(), true);
});

test('Do Not Track disables counting', () => {
  navigator.doNotTrack = '1'; recordUsage('downloaded');
  assert.equal(localStorage.getItem('retainage-cashflow:usage:downloaded'), null);
  navigator.doNotTrack = undefined;
});

test('Global Privacy Control disables counting', () => {
  navigator.globalPrivacyControl = true; recordUsage('printed');
  assert.equal(localStorage.getItem('retainage-cashflow:usage:printed'), null);
  navigator.globalPrivacyControl = undefined;
});
