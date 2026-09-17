import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('counts feature events without storing input values', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  recordUsage(storage, false);
  recordUsage(storage, false, 'target_quote_compared');
  assert.deepEqual(JSON.parse(data.get('pet-grooming-usage')), { bid_calculated: 1, target_quote_compared: 1, last_day: new Date().toISOString().slice(0, 10) });
});

test('honors opt-out', () => {
  const storage = { getItem: () => null, setItem: () => assert.fail('must not write') };
  recordUsage(storage, true);
});
