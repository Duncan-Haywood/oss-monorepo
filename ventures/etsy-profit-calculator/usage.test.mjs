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
  recordUsage(storage, false, 'shop_sale_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).shop_sale_compared, 1);
  recordUsage(storage, false, 'free_shipping_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).free_shipping_compared, 1);
  recordUsage(storage, false, 'etsy_labels_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).etsy_labels_compared, 1);
  recordUsage(storage, false, 'listing_renewal_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).listing_renewal_compared, 1);
  recordUsage(storage, false, 'offsite_ads_compared');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).offsite_ads_compared, 1);
  recordUsage(storage, false, 'target_profit_priced');
  assert.equal(JSON.parse(values.get('etsy-profit-usage')).target_profit_priced, 1);
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

// The footer tells visitors they can turn the counter off "with Do Not Track /
// Global Privacy Control". honorsBrowserSignal() reads both, but only Do Not
// Track was covered above, so half of that promise was untested.
test('honors Global Privacy Control without recording', () => {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { globalPrivacyControl: true } });
  let called = false;
  try {
    recordUsage({ setItem: () => { called = true; } });
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous });
  }
});

test('records normally once neither signal is set', () => {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  try {
    const values = new Map();
    recordUsage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
    assert.equal(JSON.parse(values.get('etsy-profit-usage')).order_profit_calculated, 1);
  } finally {
    if (previous === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previous });
  }
});
