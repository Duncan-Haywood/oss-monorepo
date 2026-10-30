import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage, readUsage, clearUsage } from './usage.mjs';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('counts locally, honours the opt-out and clears', () => {
  const s = mem();
  recordUsage(s, false, 'builds'); recordUsage(s, false, 'builds');
  recordUsage(s, true, 'builds');
  recordUsage(s, false, 'not-an-event');
  assert.equal(readUsage(s, 'builds'), 2);
  clearUsage(s);
  assert.equal(readUsage(s, 'builds'), 0);
});

test('opening a gallery design\'s details is its own count, apart from compares', () => {
  const s = mem();
  recordUsage(s, false, 'details');
  recordUsage(s, false, 'compares');
  assert.equal(readUsage(s, 'details'), 1);
  assert.equal(readUsage(s, 'compares'), 1);
});
