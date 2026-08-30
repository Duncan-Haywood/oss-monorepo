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
const { record, enabled, setEnabled } = await import('./usage.mjs');

const today = () => new Date().toISOString().slice(0, 10);

test('does not throw when storage access is blocked', () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  // enabled() previously called s.getItem(OPT_OUT) with no try/catch, so a
  // blocked getItem threw straight out of enabled() -- and out of record(),
  // which calls enabled() unguarded from a click handler with no try/catch
  // of its own in index.html.
  assert.doesNotThrow(() => enabled());
  assert.equal(enabled(), false);
  assert.doesNotThrow(() => setEnabled(true));
  assert.doesNotThrow(() => record('quote_generated'));
  globalThis.localStorage = new FakeStorage();
});

test('does not throw when stored usage JSON is malformed', () => {
  globalThis.localStorage = new FakeStorage();
  localStorage.setItem('translator-project-quote:usage', '{not-json');
  assert.doesNotThrow(() => record('quote_generated'));
});

test('records a normal count keyed by event and day', () => {
  globalThis.localStorage = new FakeStorage();
  record('quote_generated');
  record('quote_generated');
  const saved = JSON.parse(localStorage.getItem('translator-project-quote:usage'));
  assert.equal(saved[`quote_generated:${today()}`], 2);
});

test('setEnabled(false) stops counting; setEnabled(true) resumes it', () => {
  globalThis.localStorage = new FakeStorage();
  setEnabled(false);
  assert.equal(enabled(), false);
  record('quote_generated');
  assert.equal(localStorage.getItem('translator-project-quote:usage'), null);
  setEnabled(true);
  assert.equal(enabled(), true);
  record('quote_generated');
  assert.ok(localStorage.getItem('translator-project-quote:usage'));
});

test('Do Not Track disables counting', () => {
  globalThis.localStorage = new FakeStorage();
  navigator.doNotTrack = '1';
  assert.equal(enabled(), false);
  record('quote_generated');
  assert.equal(localStorage.getItem('translator-project-quote:usage'), null);
  navigator.doNotTrack = undefined;
});
