import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

test('counts events by name and day, and nothing else', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'schedule_computed'); recordUsage(s, false, 'schedule_computed'); recordUsage(s, false, 'example_loaded');
  const v = JSON.parse(s.getItem('rebar-schedule-usage'));
  assert.equal(v.schedule_computed, 2); assert.equal(v.example_loaded, 1);
  assert.deepEqual(Object.keys(v).sort(), ['example_loaded', 'last_day', 'schedule_computed']);
});

test('opting out deletes the counts and stops new ones', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'schedule_computed');
  writeOptOut(s, true);
  assert.equal(s.getItem('rebar-schedule-usage'), null);
  assert.equal(readOptOut(s), true);
  recordUsage(s, false, 'schedule_computed');
  assert.equal(s.getItem('rebar-schedule-usage'), null);
});
