import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('usage is aggregate and opt-out', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage); recordUsage(storage, true);
  assert.deepEqual(JSON.parse(data.get('ada-title-ii-evidence-usage')), { report_generated: 1 });
});

test('deadline lookups stay on the same local key as separate events', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage, false, 'deadline_looked_up');
  recordUsage(storage, false, 'deadline_copied');
  recordUsage(storage, true, 'report_downloaded');
  assert.deepEqual(JSON.parse(data.get('ada-title-ii-evidence-usage')), {
    deadline_looked_up: 1,
    deadline_copied: 1,
  });
});
