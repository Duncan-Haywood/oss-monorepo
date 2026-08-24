import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('usage is aggregate and opt-out', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage); recordUsage(storage, true);
  assert.deepEqual(JSON.parse(data.get('shopify-a11y-evidence-usage')), { report_generated: 1 });
});
