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
  assert.doesNotThrow(() => record('quote_normalized'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('3pl-quote-normalizer-usage', '{not-json');
  assert.doesNotThrow(() => record('quote_normalized'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  record('quote_normalized');
  record('quote_normalized');
  const saved = JSON.parse(localStorage.getItem('3pl-quote-normalizer-usage'));
  assert.equal(saved.quote_normalized, 2);
});

test('opt-out stops counting', () => {
  globalThis.localStorage = new FakeStorage();
  setUsageOptOut(true);
  record('quote_normalized');
  assert.equal(localStorage.getItem('3pl-quote-normalizer-usage'), null);
  setUsageOptOut(false);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  record('quote_normalized');
  assert.equal(localStorage.getItem('3pl-quote-normalizer-usage'), null);
  navigator.doNotTrack = undefined;
});
