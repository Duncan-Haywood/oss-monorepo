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
  recordUsage('deposit_calculated');
  recordUsage('deposit_calculated');
  const stored = JSON.parse(localStorage.getItem('appointment-deposit-calculator:usage'));
  const keys = Object.keys(stored);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^deposit_calculated:\d{4}-\d{2}-\d{2}$/);
  assert.equal(stored[keys[0]], 2);
});

test('opt out is reversible', () => {
  setUsageEnabled(false);
  assert.equal(isUsageEnabled(), false);
  recordUsage('policy_copied');
  const after = localStorage.getItem('appointment-deposit-calculator:usage');
  const parsed = after ? JSON.parse(after) : {};
  assert.equal(Object.keys(parsed).some((key) => key.startsWith('policy_copied:')), false);
  setUsageEnabled(true);
  assert.equal(isUsageEnabled(), true);
});

test('Do Not Track disables counting', () => {
  navigator.doNotTrack = '1';
  localStorage.removeItem('appointment-deposit-calculator:usage');
  recordUsage('deposit_calculated');
  assert.equal(localStorage.getItem('appointment-deposit-calculator:usage'), null);
  navigator.doNotTrack = undefined;
});
