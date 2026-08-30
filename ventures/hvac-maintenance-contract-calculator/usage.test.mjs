import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

// recordUsage() runs as the last line inside calculate()'s try block in
// index.html. If it threw, the outer catch would show the storage error in
// the visible warning banner as if the priced plan itself were wrong, even
// though the numbers already rendered correctly above it.

test('does not throw when stored usage JSON is malformed', () => {
  const storage = { getItem: () => '{not-json', setItem: () => {} };
  assert.doesNotThrow(() => recordUsage(storage, false, 'plan_calculated'));
});

test('does not throw when storage access is blocked', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'plan_calculated'));
});

test('records a normal count under the venture-specific key', () => {
  const store = {};
  const storage = {
    getItem: (key) => store[key],
    setItem: (key, value) => { store[key] = value; },
  };
  recordUsage(storage, false, 'plan_calculated');
  const saved = JSON.parse(store['hvac-maintenance-usage']);
  assert.equal(saved.plan_calculated, 1);
});

test('does nothing when opted out', () => {
  let called = false;
  const storage = { getItem: () => '{}', setItem: () => { called = true; } };
  recordUsage(storage, true, 'plan_calculated');
  assert.equal(called, false);
});
