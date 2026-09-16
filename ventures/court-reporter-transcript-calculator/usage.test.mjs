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
const { record, readUsage, setUsageOptOut, usageOptedOut } = await import('./usage.mjs');

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => record('invoice_calculated'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('court-reporter-transcript-calculator-usage', '{not-json');
  assert.doesNotThrow(() => record('invoice_calculated'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  record('invoice_calculated');
  record('invoice_calculated');
  const saved = JSON.parse(localStorage.getItem('court-reporter-transcript-calculator-usage'));
  assert.equal(saved.invoice_calculated, 2);
});

test('readUsage returns the same counts record wrote', () => {
  globalThis.localStorage = new FakeStorage();
  record('agency_offer_checked');
  record('agency_offer_checked');
  record('summary_copied');
  assert.deepEqual(readUsage(), { agency_offer_checked: 2, summary_copied: 1 });
});

test('readUsage returns an empty object when nothing has been recorded', () => {
  globalThis.localStorage = new FakeStorage();
  assert.deepEqual(readUsage(), {});
});

test('opt-out stops counting and removes any prior counts', () => {
  globalThis.localStorage = new FakeStorage();
  record('invoice_calculated');
  setUsageOptOut(true);
  assert.equal(localStorage.getItem('court-reporter-transcript-calculator-usage'), null);
  record('invoice_calculated');
  assert.equal(localStorage.getItem('court-reporter-transcript-calculator-usage'), null);
  assert.equal(usageOptedOut(), true);
  setUsageOptOut(false);
  assert.equal(usageOptedOut(), false);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  record('invoice_calculated');
  assert.equal(localStorage.getItem('court-reporter-transcript-calculator-usage'), null);
  navigator.doNotTrack = undefined;
});

test('Global Privacy Control disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.globalPrivacyControl = true;
  record('invoice_calculated');
  assert.equal(localStorage.getItem('court-reporter-transcript-calculator-usage'), null);
  navigator.globalPrivacyControl = undefined;
});
