import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  assert.ok(FIELD_IDS.includes('salePercent'));
  assert.ok(FIELD_IDS.includes('saleDollar'));
  assert.ok(FIELD_IDS.includes('listedSellThroughPct'));
  assert.ok(FIELD_IDS.includes('saleSellThroughPct'));
  assert.ok(FIELD_IDS.includes('saleListings'));
  assert.ok(FIELD_IDS.includes('freeShipPrice'));
  assert.ok(FIELD_IDS.includes('monthlyOrders'));
  assert.ok(FIELD_IDS.includes('etsyLabelCost'));
  assert.ok(FIELD_IDS.includes('thirdPartyLabelCost'));
  assert.ok(FIELD_IDS.includes('etsyLabelClaimRatePercent'));
  assert.ok(FIELD_IDS.includes('thirdPartyClaimRatePercent'));
  assert.ok(FIELD_IDS.includes('labelUploadMinutes'));
  assert.ok(FIELD_IDS.includes('labelUploadWage'));
  assert.ok(FIELD_IDS.includes('monthlyLabelShipments'));
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

test('carries shop-sale fields so a shared link does not drop the sale table', () => {
  const decoded = decodeInputs(encodeInputs({
    price: 30,
    salePercent: 20,
    saleDollar: 5,
    listedSellThroughPct: 40,
    saleSellThroughPct: 55,
    saleListings: 40,
  }));
  assert.equal(decoded.salePercent, 20);
  assert.equal(decoded.saleDollar, 5);
  assert.equal(decoded.saleSellThroughPct, 55);
  assert.equal(decoded.saleListings, 40);
});

test('carries free-shipping fields so a shared link does not drop the shipping table', () => {
  const decoded = decodeInputs(encodeInputs({
    price: 30,
    freeShipPrice: 32,
    monthlyOrders: 40,
  }));
  assert.equal(decoded.freeShipPrice, 32);
  assert.equal(decoded.monthlyOrders, 40);
});

test('carries Etsy label fields so a shared link does not drop the label table', () => {
  const decoded = decodeInputs(encodeInputs({
    price: 30,
    etsyLabelCost: 6,
    thirdPartyLabelCost: 5.1,
    etsyLabelClaimRatePercent: 0.8,
    thirdPartyClaimRatePercent: 2.5,
    labelUploadMinutes: 4,
    labelUploadWage: 18,
    monthlyLabelShipments: 40,
  }));
  assert.equal(decoded.etsyLabelCost, 6);
  assert.equal(decoded.thirdPartyLabelCost, 5.1);
  assert.equal(decoded.thirdPartyClaimRatePercent, 2.5);
  assert.equal(decoded.labelUploadMinutes, 4);
  assert.equal(decoded.monthlyLabelShipments, 40);
});

test('carries the repricing goals so a link and a return visit keep the target', () => {
  const decoded = decodeInputs(encodeInputs({ price: 30, targetMargin: 65, targetProfit: 12.5 }));
  assert.equal(decoded.targetMargin, 65);
  assert.equal(decoded.targetProfit, 12.5);
});

// The guard on the defect above, rather than another example of it.
//
// `targetMargin` and `targetProfit` went missing because the allowlist is a
// second copy of the form, kept by hand: the page grew two inputs and this list
// did not, and nothing anywhere compared them. So compare them. Every number
// input the page ships must be carried, and nothing may be carried that the
// page does not have — a stale id would silently never restore.
test('the field list is exactly the number inputs the page ships', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*\btype="number"/g)].map(m => m[1]);
  assert.ok(ids.length > 40, `expected the form to be found, saw ${ids.length} number inputs`);
  assert.deepEqual([...FIELD_IDS].sort(), [...new Set(ids)].sort());
});
