import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('does not throw when stored usage JSON is malformed', () => {
  const storage = { getItem: () => '{not-json', setItem: () => {} };
  assert.doesNotThrow(() => recordUsage(storage, false, 'classroom_priced'));
});

test('does not throw when storage access is blocked', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'classroom_priced'));
});

test('records a normal count under the venture-specific key', () => {
  const store = {};
  const storage = {
    getItem: (key) => store[key],
    setItem: (key, value) => { store[key] = value; },
  };
  recordUsage(storage, false, 'classroom_priced');
  const saved = JSON.parse(store['childcare-tuition-usage']);
  assert.equal(saved.classroom_priced, 1);
});

test('does nothing when opted out', () => {
  let called = false;
  const storage = { getItem: () => '{}', setItem: () => { called = true; } };
  recordUsage(storage, true, 'classroom_priced');
  assert.equal(called, false);
});
