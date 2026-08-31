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
const {
  recordEvent, usageAllowed, disableUsage,
  saveScenario, loadScenario, clearScenario,
} = await import('./usage.mjs');

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  // usageAllowed() previously called ls.getItem(OPT_OUT) with no
  // try/catch, so a blocked getItem threw straight out of it -- and out
  // of recordEvent(), which checks usageAllowed() before its own try, and
  // out of the #disable click handler in index.html, which calls it too.
  assert.doesNotThrow(() => usageAllowed());
  assert.equal(usageAllowed(), false);
  assert.doesNotThrow(() => recordEvent('true_up_calculated'));
  assert.doesNotThrow(() => disableUsage());
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('saas-seat-true-up:usage', '{not-json');
  assert.doesNotThrow(() => recordEvent('true_up_calculated'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  recordEvent('true_up_calculated');
  recordEvent('true_up_calculated');
  const saved = JSON.parse(localStorage.getItem('saas-seat-true-up:usage'));
  assert.equal(saved.true_up_calculated, 2);
});

test('disableUsage stops future counting', () => {
  globalThis.localStorage = new FakeStorage();
  disableUsage();
  assert.equal(usageAllowed(), false);
  recordEvent('true_up_calculated');
  assert.equal(localStorage.getItem('saas-seat-true-up:usage'), null);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordEvent('true_up_calculated');
  assert.equal(localStorage.getItem('saas-seat-true-up:usage'), null);
  navigator.doNotTrack = undefined;
});

test('saveScenario/loadScenario round-trip valid numeric fields', () => {
  const store = new FakeStorage();
  const ok = saveScenario(store, { purchased: 10, used: 7, price: 12, months: 12, overageRate: 2 });
  assert.equal(ok, true);
  const loaded = loadScenario(store);
  assert.deepEqual(loaded, { purchased: 10, used: 7, price: 12, months: 12, overageRate: 2 });
});

test('loadScenario rejects a corrupted stored scenario', () => {
  const store = new FakeStorage();
  store.setItem('saas-seat-true-up:scenario', '{not-json');
  assert.doesNotThrow(() => loadScenario(store));
  assert.equal(loadScenario(store), null);
});

test('clearScenario removes a saved scenario', () => {
  const store = new FakeStorage();
  saveScenario(store, { purchased: 5, used: 5, price: 10, months: 6, overageRate: 0 });
  clearScenario(store);
  assert.equal(loadScenario(store), null);
});
