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
const { record, setUsageOptOut } = await import('./usage.mjs');

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => record('report_generated'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('backup-verification-evidence-usage', '{not-json');
  assert.doesNotThrow(() => record('report_generated'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  record('report_generated');
  record('report_generated');
  const saved = JSON.parse(localStorage.getItem('backup-verification-evidence-usage'));
  assert.equal(saved.report_generated, 2);
});

test('opt-out stops counting and clears prior counts', () => {
  globalThis.localStorage = new FakeStorage();
  record('report_generated');
  setUsageOptOut(true);
  assert.equal(localStorage.getItem('backup-verification-evidence-usage'), null);
  record('report_generated');
  assert.equal(localStorage.getItem('backup-verification-evidence-usage'), null);
  setUsageOptOut(false);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  record('report_generated');
  assert.equal(localStorage.getItem('backup-verification-evidence-usage'), null);
  navigator.doNotTrack = undefined;
});
