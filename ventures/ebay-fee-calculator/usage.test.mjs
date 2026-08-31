import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    _map: map,
  };
}

test('records only an aggregate local event, never the inputs', () => {
  const storage = fakeStorage();
  recordUsage(storage, false);
  recordUsage(storage, false);
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.order_profit_calculated, 2);
  assert.ok(stored.last_day);
  // Nothing resembling a price or cost is persisted.
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'order_profit_calculated']);
});

test('honors opt out', () => {
  const storage = fakeStorage();
  recordUsage(storage, true);
  assert.equal(storage.getItem('ebay-fee-usage'), null);
});

test('records named feature events without storing inputs', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'target_margin_calculated');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.target_margin_calculated, 1);
  assert.ok(stored.last_day);
});

test('honors Do Not Track and Global Privacy Control', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  };
  try {
    const dntStorage = fakeStorage();
    Object.defineProperty(globalThis, 'navigator', {
      value: { doNotTrack: '1' },
      configurable: true,
    });
    recordUsage(dntStorage, false);
    assert.equal(dntStorage.getItem('ebay-fee-usage'), null);

    const gpcStorage = fakeStorage();
    Object.defineProperty(globalThis, 'navigator', {
      value: { globalPrivacyControl: true },
      configurable: true,
    });
    recordUsage(gpcStorage, false);
    assert.equal(gpcStorage.getItem('ebay-fee-usage'), null);
  } finally {
    restore();
  }
});

test('is a no-op without storage', () => {
  assert.doesNotThrow(() => recordUsage(undefined, false));
  assert.doesNotThrow(() => recordUsage(null, false));
});

test('can count a named feature event without recording content', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'share_link_copied');
  assert.equal(JSON.parse(storage.getItem('ebay-fee-usage')).share_link_copied, 1);
});

test('does not break the calculator when stored usage JSON is malformed', () => {
  const storage = {
    getItem: () => '{not-json',
    setItem: () => {},
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'order_profit_calculated'));
});

test('does not break the calculator when browser storage is unavailable', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'order_profit_calculated'));
});

test('counts listing-format comparison without storing a price or rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'listing_format_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.listing_format_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'listing_format_compared']);
});

test('counts a partial-refund comparison without storing a concession', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'partial_refund_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.partial_refund_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'partial_refund_compared']);
});

test('counts an Authenticity Guarantee comparison without storing a fee or label', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'authenticity_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.authenticity_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['authenticity_compared', 'last_day']);
});

test('counts a local-pickup comparison without storing a wage or no-show rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'local_pickup_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.local_pickup_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'local_pickup_compared']);
});

test('counts a lot-versus-singles comparison without storing a piece count or wage', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'lot_vs_singles_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.lot_vs_singles_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'lot_vs_singles_compared']);
});

test('counts a Standard Envelope comparison without storing postage or a claim rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'standard_envelope_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.standard_envelope_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'standard_envelope_compared']);
});

test('counts a combined-shipping comparison without storing postage or a charge', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'combined_shipping_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.combined_shipping_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['combined_shipping_compared', 'last_day']);
});

test('counts a seller-initiated-offer comparison without storing a percent or accept rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'seller_initiated_offer_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.seller_initiated_offer_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'seller_initiated_offer_compared']);
});

test('counts a Promoted Offsite comparison without storing spend or extra sales', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'promoted_offsite_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.promoted_offsite_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'promoted_offsite_compared']);
});

test('counts a Promoted Listings Standard comparison without storing a rate or extra sales', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'promoted_standard_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.promoted_standard_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'promoted_standard_compared']);
});

test('counts a Promoted Listings Advanced comparison without storing a CPC or click count', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'promoted_advanced_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.promoted_advanced_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'promoted_advanced_compared']);
});

test('counts a quantity-discount comparison without storing a percent or take rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'quantity_discount_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.quantity_discount_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'quantity_discount_compared']);
});

test('counts a seller-coupon comparison without storing a percent or redeem rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'seller_coupon_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.seller_coupon_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'seller_coupon_compared']);
});

test('counts an immediate-payment comparison without storing an unpaid rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'immediate_payment_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.immediate_payment_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['immediate_payment_compared', 'last_day']);
});

test('counts a Top Rated Plus comparison without storing a discount or wage', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'top_rated_plus_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.top_rated_plus_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'top_rated_plus_compared']);
});

test('counts a Managed Returns comparison without storing a fee or rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'managed_returns_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.managed_returns_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'managed_returns_compared']);
});

test('counts a Global Shipping comparison without storing postage or a claim rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'global_shipping_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.global_shipping_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['global_shipping_compared', 'last_day']);
});

test('counts a Best Offer comparison without storing the offer', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'best_offer_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.best_offer_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['best_offer_compared', 'last_day']);
});

test('counts an international comparison without storing postage or a fee', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'international_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.international_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['international_compared', 'last_day']);
});

test('counts a store comparison without storing a fee or order count', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'store_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.store_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'store_compared']);
});

test('counts the store_comparison_viewed alias without storing a fee or order count', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'store_comparison_viewed');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.store_comparison_viewed, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'store_comparison_viewed']);
});

test('counts a free-shipping comparison without storing a list or sell-through', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'free_shipping_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.free_shipping_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['free_shipping_compared', 'last_day']);
});

test('counts a package-protection comparison without storing a premium or claim rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'package_protection_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.package_protection_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'package_protection_compared']);
});

test('counts an eBay-label comparison without storing a quote or claim rate', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'ebay_labels_compared');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.ebay_labels_compared, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['ebay_labels_compared', 'last_day']);
});

test('counts the return-rate view without storing a rate or cost', () => {
  const storage = fakeStorage();
  recordUsage(storage, false, 'return_rate_viewed');
  const stored = JSON.parse(storage.getItem('ebay-fee-usage'));
  assert.equal(stored.return_rate_viewed, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['last_day', 'return_rate_viewed']);
});

test('does not break the calculator when stored usage JSON is malformed', () => {
  const storage = {
    getItem: () => '{not-json',
    setItem: () => {},
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'order_profit_calculated'));
});

test('does not break the calculator when browser storage is unavailable', () => {
  const storage = {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.doesNotThrow(() => recordUsage(storage, false, 'order_profit_calculated'));
});
