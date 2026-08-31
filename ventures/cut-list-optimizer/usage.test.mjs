import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readUsage, clearUsage, EVENTS } from './usage.mjs';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    map,
  };
};

test('counts runs under the original key so existing local counts carry over', () => {
  const storage = fakeStorage();
  recordUsage(storage, false);
  recordUsage(storage, false, 'runs');
  assert.equal(storage.getItem('cut-list-optimizer-runs'), '2');
  assert.equal(readUsage(storage, 'runs'), 2);
});

test('keeps plan copies in a separate counter from plan calculations', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'runs');
  recordUsage(storage, false, 'copies');
  recordUsage(storage, false, 'copies');
  assert.equal(readUsage(storage, 'runs'), 1);
  assert.equal(readUsage(storage, 'copies'), 2);
});

test('opting out records nothing at all', () => {
  const storage = fakeStorage();
  recordUsage(storage, true, 'runs');
  recordUsage(storage, true, 'copies');
  assert.equal(storage.map.size, 0);
});

test('survives storage that throws, as private browsing does', () => {
  const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.doesNotThrow(() => recordUsage(denied, false));
  assert.equal(readUsage(denied), 0);
});

test('missing storage is not an error', () => {
  assert.doesNotThrow(() => recordUsage(null, false));
  assert.equal(readUsage(null), 0);
});

// --- Added with the sheet-goods mode ---

test('sheet and linear plans are counted apart from each other', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'sheet-runs');
  recordUsage(storage, false, 'sheet-runs');
  recordUsage(storage, false, 'runs');
  recordUsage(storage, false, 'sheet-copies');
  recordUsage(storage, false, 'sheet-compares');
  assert.equal(readUsage(storage, 'sheet-runs'), 2);
  assert.equal(readUsage(storage, 'runs'), 1);
  assert.equal(readUsage(storage, 'sheet-copies'), 1);
  assert.equal(readUsage(storage, 'copies'), 0);
  assert.equal(readUsage(storage, 'sheet-compares'), 1);
});

test('size-comparison actions are counted apart from plans and copies', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'sheet-compares');
  recordUsage(storage, false, 'compares');
  recordUsage(storage, false, 'sheet-copies');
  assert.equal(readUsage(storage, 'sheet-compares'), 1);
  assert.equal(readUsage(storage, 'compares'), 1);
  assert.equal(readUsage(storage, 'sheet-copies'), 1);
  assert.ok(EVENTS.includes('sheet-compares'));
  assert.ok(EVENTS.includes('compares'));
});

test('no part of the cut list is stored — only counts', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'sheet-runs');
  for (const [key, value] of storage.map) {
    assert.match(key, /^cut-list-optimizer-[a-z-]+$/, `unexpected storage key ${key}`);
    assert.match(String(value), /^\d+$/, `${key} holds something other than a count`);
  }
});

test('clearing removes every counter the page keeps', () => {
  const storage = fakeStorage();
  for (const event of EVENTS) recordUsage(storage, false, event);
  assert.equal(storage.map.size, EVENTS.length);
  clearUsage(storage);
  assert.equal(storage.map.size, 0);
});

test('clearing a storage that throws, or none at all, is not an error', () => {
  const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  assert.doesNotThrow(() => clearUsage(denied));
  assert.doesNotThrow(() => clearUsage(null));
});

test('a Do Not Track or Global Privacy Control signal suppresses counting', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
  for (const signal of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
    Object.defineProperty(globalThis, 'navigator', { value: signal, configurable: true });
    const storage = fakeStorage();
    recordUsage(storage, false, 'sheet-runs');
    assert.equal(storage.map.size, 0, `expected ${JSON.stringify(signal)} to suppress counting`);
  }
});
