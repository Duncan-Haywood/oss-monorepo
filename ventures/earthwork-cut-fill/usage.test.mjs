import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut } from './usage.mjs';

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

test('counts events by name and day, and nothing else', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'volumes_computed'); recordUsage(s, false, 'volumes_computed'); recordUsage(s, false, 'balance_found');
  const v = JSON.parse(s.getItem('earthwork-cut-fill-usage'));
  assert.equal(v.volumes_computed, 2); assert.equal(v.balance_found, 1);
  assert.deepEqual(Object.keys(v).sort(), ['balance_found', 'last_day', 'volumes_computed']);
});

test('opting out deletes the counts and stops new ones', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'volumes_computed');
  writeOptOut(s, true);
  assert.equal(s.getItem('earthwork-cut-fill-usage'), null);
  assert.equal(readOptOut(s), true);
  recordUsage(s, false, 'volumes_computed');
  assert.equal(s.getItem('earthwork-cut-fill-usage'), null);
});
