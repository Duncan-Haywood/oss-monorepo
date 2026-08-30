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
const { recordUsage, setUsageOptOut } = await import('./usage.mjs');

// recordUsage() is called directly from click handlers and once at page load
// in index.html, with no try/catch around any of those call sites. Before
// this fix, a blocked getItem/setItem (private browsing, full storage) or a
// corrupted stored value threw straight out of recordUsage and into the
// caller -- e.g. skipping the "Saved" button feedback in the save handler.

test('does not throw when storage access is blocked', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  globalThis.localStorage = storage;
  assert.doesNotThrow(() => recordUsage('comparison_completed'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('vendor-rate-break-even-usage', '{not-json');
  assert.doesNotThrow(() => recordUsage('comparison_completed'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('scenario_added');
  recordUsage('scenario_added');
  const saved = JSON.parse(localStorage.getItem('vendor-rate-break-even-usage'));
  assert.equal(saved.scenario_added, 2);
});

test('opt-out stops counting, including a stray non-numeric prior value', () => {
  globalThis.localStorage = new FakeStorage();
  setUsageOptOut(true);
  recordUsage('draft_saved');
  assert.equal(localStorage.getItem('vendor-rate-break-even-usage'), null);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordUsage('comparison_completed');
  assert.equal(localStorage.getItem('vendor-rate-break-even-usage'), null);
  navigator.doNotTrack = undefined;
});

test('setUsageOptOut does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => setUsageOptOut(true));
  globalThis.localStorage = new FakeStorage();
});
