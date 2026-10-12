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
  assert.doesNotThrow(() => recordUsage('sim_run'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('prop-firm-challenge-calculator-usage-v1', '{not-json');
  assert.doesNotThrow(() => recordUsage('sim_run'));
});

test('records a normal count keyed by event and day', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('sim_run');
  recordUsage('sim_run');
  const saved = JSON.parse(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'));
  assert.equal(saved[`sim_run:${today()}`], 2);
});

test('does nothing when opted out', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('sim_run', true);
  assert.equal(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'), null);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordUsage('sim_run');
  assert.equal(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'), null);
  navigator.doNotTrack = undefined;
});

test('Global Privacy Control disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.globalPrivacyControl = true;
  recordUsage('sim_run');
  assert.equal(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'), null);
  navigator.globalPrivacyControl = undefined;
});

test('the stored opt-out survives a reload and stops counting without the caller passing it', async () => {
  const { readOptOut, writeOptOut } = await import('./usage.mjs');
  globalThis.localStorage = new FakeStorage();
  recordUsage('sim_run');
  writeOptOut(localStorage, true);
  assert.equal(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'), null, 'counters are removed');
  assert.equal(readOptOut(localStorage), true);
  recordUsage('sim_run');
  assert.equal(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'), null);
  writeOptOut(localStorage, false);
  assert.equal(readOptOut(localStorage), false);
  recordUsage('sim_run');
  assert.ok(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'));
});

test('a blocked store is never read as consent', async () => {
  const { readOptOut } = await import('./usage.mjs');
  assert.equal(readOptOut({ getItem() { throw new Error('blocked'); } }), false);
});

test('usage events never contain planning figures', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('sim_run');
  assert.match(localStorage.getItem('prop-firm-challenge-calculator-usage-v1'), /^\{"sim_run:\d{4}-\d{2}-\d{2}":1\}$/);
});
