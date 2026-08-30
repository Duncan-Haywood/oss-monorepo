import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

// recordUsage() runs inside update()'s try block in index.html, after the
// priced result is already rendered. If it threw, the outer catch would
// surface the storage error in the visible #errors banner as if the price
// itself were wrong.

test('does not throw when stored usage JSON is malformed', () => {
  const storage = { getItem: () => '{not-json', setItem: () => {} };
  assert.doesNotThrow(() => recordUsage(storage, false, 'lesson_price_calculated'));
});

test('does not throw when storage access is blocked', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'lesson_price_calculated'));
});

test('records a normal count under the venture-specific key', () => {
  const store = {};
  const storage = {
    getItem: (key) => store[key],
    setItem: (key, value) => { store[key] = value; },
  };
  recordUsage(storage, false, 'lesson_price_calculated');
  const saved = JSON.parse(store['music-lesson-usage']);
  assert.equal(saved.lesson_price_calculated, 1);
});

test('does nothing when opted out', () => {
  let called = false;
  const storage = { getItem: () => '{}', setItem: () => { called = true; } };
  recordUsage(storage, true, 'lesson_price_calculated');
  assert.equal(called, false);
});
