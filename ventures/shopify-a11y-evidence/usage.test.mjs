import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('usage is aggregate and opt-out', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage); recordUsage(storage, true);
  assert.deepEqual(JSON.parse(data.get('shopify-a11y-evidence-usage')), { report_generated: 1 });
});

test('comparison events stay on the same local key', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage, false, 'comparison_generated');
  recordUsage(storage, false, 'comparison_copied');
  recordUsage(storage, true, 'comparison_downloaded');
  assert.deepEqual(JSON.parse(data.get('shopify-a11y-evidence-usage')), {
    comparison_generated: 1,
    comparison_copied: 1,
  });
});
