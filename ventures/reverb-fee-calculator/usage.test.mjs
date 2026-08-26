import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('records only an aggregate local event', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  recordUsage(storage);
  const event = JSON.parse(values.get('reverb-fee-usage'));
  assert.equal(event.reverb_sale_calculated, 1);
  assert.match(event.last_day, /^\d{4}-\d{2}-\d{2}$/);
});

test('honors opt out', () => {
  let called = false;
  recordUsage({ setItem: () => { called = true; } }, true);
  assert.equal(called, false);
});

test('supports a named aggregate event without recording inputs', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  recordUsage(storage, false, 'reverb_offer_compared');
  assert.equal(JSON.parse(values.get('reverb-fee-usage')).reverb_offer_compared, 1);
  recordUsage(storage, false, 'reverb_shipping_compared');
  assert.equal(JSON.parse(values.get('reverb-fee-usage')).reverb_shipping_compared, 1);
  recordUsage(storage, false, 'reverb_safe_shipping_compared');
  assert.equal(JSON.parse(values.get('reverb-fee-usage')).reverb_safe_shipping_compared, 1);
  recordUsage(storage, false, 'reverb_consignment_compared');
  assert.equal(JSON.parse(values.get('reverb-fee-usage')).reverb_consignment_compared, 1);
  recordUsage(storage, false, 'reverb_bump_compared');
  assert.equal(JSON.parse(values.get('reverb-fee-usage')).reverb_bump_compared, 1);
});

test('honors Do Not Track without recording', () => {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { doNotTrack: '1' } });
  let called = false;
  try {
    recordUsage({ setItem: () => { called = true; } });
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous });
  }
});
