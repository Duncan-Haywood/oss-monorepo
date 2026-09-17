import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, STORAGE_KEY } from './usage.mjs';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

test('records a named event and the day, aggregate-only', () => {
  const storage = memoryStorage();
  recordUsage(storage, false, 'rate_calculated');
  const stored = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(stored.rate_calculated, 1);
  assert.equal(stored.last_day, new Date().toISOString().slice(0, 10));
});

test('counts repeated events and keeps distinct event names separate', () => {
  const storage = memoryStorage();
  recordUsage(storage, false, 'rate_calculated');
  recordUsage(storage, false, 'rate_calculated');
  recordUsage(storage, false, 'scenario_saved');
  const stored = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(stored.rate_calculated, 2);
  assert.equal(stored.scenario_saved, 1);
});

test('optedOut is a no-op that writes nothing at all', () => {
  const storage = memoryStorage();
  recordUsage(storage, true, 'rate_calculated');
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('honours Do Not Track', async (t) => {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { doNotTrack: '1' }, configurable: true });
  t.after(() => Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true }));
  const storage = memoryStorage();
  recordUsage(storage, false, 'rate_calculated');
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('honours Global Privacy Control', async (t) => {
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { globalPrivacyControl: true }, configurable: true });
  t.after(() => Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true }));
  const storage = memoryStorage();
  recordUsage(storage, false, 'rate_calculated');
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('no storage at all does not throw', () => {
  assert.doesNotThrow(() => recordUsage(null, false, 'rate_calculated'));
  assert.doesNotThrow(() => recordUsage(undefined, false, 'rate_calculated'));
});

test('a storage that throws on write does not stop the calculator', () => {
  const throwingStorage = {
    getItem: () => '{}',
    setItem: () => { throw new Error('quota exceeded'); },
  };
  assert.doesNotThrow(() => recordUsage(throwingStorage, false, 'rate_calculated'));
});

test('a corrupt stored value fails the write silently rather than throwing -- it does not self-heal, but it must not stop the page computing a rate', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, 'not json');
  assert.doesNotThrow(() => recordUsage(storage, false, 'rate_calculated'));
  // The single try/catch wraps the parse and the write together, so a parse
  // failure here skips the whole record rather than resetting and counting
  // -- unlike some sibling ventures' usage.mjs, which parse in a nested
  // try/catch specifically to self-heal. Documented here so a future change
  // to either shape is a deliberate choice, not a surprise.
  assert.equal(storage.getItem(STORAGE_KEY), 'not json');
});

test('defaults to the rate_calculated event when none is named', () => {
  const storage = memoryStorage();
  recordUsage(storage);
  const stored = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(stored.rate_calculated, 1);
});

test('never records a plan name, dollar figure, or any calculator input -- event names and the day only', () => {
  const storage = memoryStorage();
  recordUsage(storage, false, 'rate_calculated');
  const raw = storage.getItem(STORAGE_KEY);
  for (const sensitive of ['Delta', 'Cigna', 'MetLife', '48000', '9600']) {
    assert.equal(raw.includes(sensitive), false, `usage record must never contain ${sensitive}`);
  }
});
