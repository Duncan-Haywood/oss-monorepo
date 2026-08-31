import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsage } from './usage.mjs';

test('usage stores aggregate event counts only', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const usage = createUsage(storage); usage.record('route_calculated'); usage.record('route_calculated');
  assert.deepEqual(JSON.parse(values.get('medical-courier-route-margin-usage')), { route_calculated: 2 });
});
