import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

test('counts events by name and day, and nothing else', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'beam_solved'); recordUsage(s, false, 'beam_solved'); recordUsage(s, false, 'pattern_on');
  const v = JSON.parse(s.getItem('continuous-beam-calculator-usage'));
  assert.equal(v.beam_solved, 2); assert.equal(v.pattern_on, 1);
  assert.deepEqual(Object.keys(v).sort(), ['beam_solved', 'last_day', 'pattern_on']);
});

test('opting out deletes the counts and stops new ones', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'beam_solved');
  writeOptOut(s, true);
  assert.equal(s.getItem('continuous-beam-calculator-usage'), null);
  assert.equal(readOptOut(s), true);
  recordUsage(s, false, 'beam_solved');
  assert.equal(s.getItem('continuous-beam-calculator-usage'), null);
});
