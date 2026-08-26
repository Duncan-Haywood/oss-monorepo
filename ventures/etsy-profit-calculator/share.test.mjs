import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, FIELD_IDS } from './share.mjs';

test('round-trips a full set of inputs unchanged', () => {
  const inputs = { price: 30, shippingCharged: 5, listingFee: 0.2, transactionRate: 6.5, paymentRate: 3, paymentFixed: 0.25, offsiteAdRate: 15, shippingCost: 6, materialCost: 4, otherCost: 1, etsyAdsAcosPct: 12 };
  const decoded = decodeInputs(encodeInputs(inputs));
  assert.deepEqual(decoded, inputs);
});

test('carries Etsy Ads ACOS so a shared link does not drop it', () => {
  const decoded = decodeInputs(encodeInputs({ price: 30, etsyAdsAcosPct: 18, monthlyAdSpend: 40 }));
  assert.equal(decoded.etsyAdsAcosPct, 18);
  assert.equal(decoded.monthlyAdSpend, 40);
});

test('emits fields in a stable order so the same inputs give the same link', () => {
  const a = encodeInputs({ otherCost: 1, price: 30 });
  const b = encodeInputs({ price: 30, otherCost: 1 });
  assert.equal(a, b);
  assert.equal(a, 'price=30&otherCost=1');
});

test('accepts numeric strings from form fields', () => {
  const decoded = decodeInputs(encodeInputs({ price: '30', transactionRate: '6.5' }));
  assert.deepEqual(decoded, { price: 30, transactionRate: 6.5 });
});

test('drops blank, negative, and non-numeric values instead of encoding them', () => {
  const encoded = encodeInputs({ price: 30, shippingCharged: '', listingFee: -1, paymentRate: 'nope' });
  assert.equal(encoded, 'price=30');
});

test('ignores unknown keys so a link can only ever set known fields', () => {
  assert.equal(encodeInputs({ price: 30, evil: 999, __proto__: 1 }), 'price=30');
  assert.deepEqual(decodeInputs('price=30&evil=999&script=alert(1)'), { price: 30 });
});

test('tolerates a leading ? or # so location.hash/search can be passed directly', () => {
  assert.deepEqual(decodeInputs('#price=30'), { price: 30 });
  assert.deepEqual(decodeInputs('?price=30'), { price: 30 });
});

test('returns an empty object for missing or malformed input', () => {
  assert.deepEqual(decodeInputs(''), {});
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
});

test('every encodable field is a real calculator field', () => {
  // Guards against FIELD_IDS drifting from the form: every id here is one the
  // page renders. Order fields feed calculateOrder; Plus fields feed
  // compareEtsyPlus; personalization fields feed comparePersonalization;
  // etsyAdsAcosPct feeds compareEtsyAds (monthlyAdSpend is shared with Plus).
  assert.equal(new Set(FIELD_IDS).size, FIELD_IDS.length);
  assert.ok(FIELD_IDS.includes('price'));
  assert.ok(FIELD_IDS.includes('listingsPerMonth'));
  assert.ok(FIELD_IDS.includes('monthlyPlusFee'));
  assert.ok(FIELD_IDS.includes('otherPlusValue'));
  assert.ok(FIELD_IDS.includes('personalizationUpcharge'));
  assert.ok(FIELD_IDS.includes('extraMaterialCost'));
  assert.ok(FIELD_IDS.includes('extraTimeCost'));
  assert.ok(FIELD_IDS.includes('monthlyCustomOrders'));
  assert.ok(FIELD_IDS.includes('etsyAdsAcosPct'));
  assert.ok(FIELD_IDS.includes('monthlyAdSpend'));
  assert.ok(FIELD_IDS.includes('yourTimeCost'));
  assert.ok(FIELD_IDS.includes('partnerUnitCost'));
  assert.ok(FIELD_IDS.includes('yourMonthlyCapacity'));
  assert.ok(FIELD_IDS.includes('monthlyDemand'));
  assert.ok(FIELD_IDS.includes('starSellerShippingCost'));
  assert.ok(FIELD_IDS.includes('starSellerMessageMinutes'));
  assert.ok(FIELD_IDS.includes('starSellerHourlyWage'));
  assert.ok(FIELD_IDS.includes('unsignedSellThroughPct'));
  assert.ok(FIELD_IDS.includes('starSellerSellThroughPct'));
  assert.ok(FIELD_IDS.includes('starSellerListings'));
});

test('carries Star Seller fields so a shared link does not drop the badge table', () => {
  const decoded = decodeInputs(encodeInputs({
    price: 30,
    starSellerShippingCost: 9,
    starSellerMessageMinutes: 8,
    starSellerHourlyWage: 18,
    unsignedSellThroughPct: 40,
    starSellerSellThroughPct: 50,
    starSellerListings: 40,
  }));
  assert.equal(decoded.starSellerShippingCost, 9);
  assert.equal(decoded.starSellerSellThroughPct, 50);
  assert.equal(decoded.starSellerListings, 40);
});
