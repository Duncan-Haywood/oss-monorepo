import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readOptOut, writeOptOut, usageStorage } from './usage.mjs';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('counts the event and the day, nothing else', () => {
  const s = fakeStorage();
  recordUsage(s, false, 'schedule_run');
  recordUsage(s, false, 'schedule_run');
  const v = JSON.parse(s.getItem('job-shop-scheduler-usage'));
  assert.deepEqual(Object.keys(v).sort(), ['last_day', 'schedule_run']);
  assert.equal(v.schedule_run, 2);
});

test('opting out deletes the counts and stops new ones', () => {
  const s = fakeStorage();
  recordUsage(s);
  writeOptOut(s, true);
  assert.equal(s.getItem('job-shop-scheduler-usage'), null);
  assert.equal(readOptOut(s), true);
  recordUsage(s);
  assert.equal(s.getItem('job-shop-scheduler-usage'), null);
  writeOptOut(s, false);
  assert.equal(readOptOut(s), false);
});

test('a store that throws never breaks the page', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => recordUsage(bad));
  assert.equal(readOptOut(bad), false);
  assert.doesNotThrow(() => writeOptOut(bad, true));
  assert.doesNotThrow(() => usageStorage());
});
