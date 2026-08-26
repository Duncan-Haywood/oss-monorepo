import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

test('records only an aggregate local event', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  recordUsage(storage);
  const event = JSON.parse(values.get('etsy-profit-usage'));
  assert.equal(event.order_profit_calculated, 1);
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
  recordUsage(storage, false, 'etsy_plus_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).etsy_plus_compared, 1);
  recordUsage(storage, false, 'personalization_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).personalization_compared, 1);
  recordUsage(storage, false, 'etsy_ads_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).etsy_ads_compared, 1);
  recordUsage(storage, false, 'production_partner_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).production_partner_compared, 1);
  recordUsage(storage, false, 'star_seller_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).star_seller_compared, 1);
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
