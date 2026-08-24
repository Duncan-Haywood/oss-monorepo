import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readUsage } from './usage.mjs';

const fakeStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), map };
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
