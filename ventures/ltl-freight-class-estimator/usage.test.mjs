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
const { recordUsage, usageAllowed, clearUsage } = await import('./usage.mjs');

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => recordUsage('class_estimated'));
  assert.equal(usageAllowed(), false);
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('ltl-freight-class-usage', '{not-json');
  assert.doesNotThrow(() => recordUsage('class_estimated'));
});

test('records a normal count under the venture-specific key', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('class_estimated');
  recordUsage('class_estimated');
  const saved = JSON.parse(localStorage.getItem('ltl-freight-class-usage'));
  assert.equal(saved.class_estimated, 2);
});

test('clearUsage opts out and stops future counting', () => {
  globalThis.localStorage = new FakeStorage();
  recordUsage('class_estimated');
  clearUsage();
  assert.equal(localStorage.getItem('ltl-freight-class-usage'), null);
  assert.equal(usageAllowed(), false);
  recordUsage('class_estimated');
  assert.equal(localStorage.getItem('ltl-freight-class-usage'), null);
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  recordUsage('class_estimated');
  assert.equal(localStorage.getItem('ltl-freight-class-usage'), null);
  navigator.doNotTrack = undefined;
});
