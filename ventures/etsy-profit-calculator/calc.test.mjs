import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin, compareEtsyPlus, plusBreakEvenListings, plusCreditValueUsed, ETSY_PLUS_DEFAULTS, comparePersonalization, personalizationNote, PERSONALIZATION_DEFAULTS, compareEtsyAds, etsyAdsNote, ETSY_ADS_DEFAULTS } from './calc.mjs';

test('calculates the complete fee stack and contribution', () => {
  const result = calculateOrder({ price: 30, shippingCharged: 5, listingFee: .2, transactionRate: 6.5, paymentRate: 3, paymentFixed: .25, offsiteAdRate: 0, shippingCost: 6, materialCost: 4, otherCost: 1 });
  assert.equal(result.revenue, 35);
  assert.equal(result.fees.transaction, 2.275);
  assert.equal(result.fees.payment, 1.3);
  assert.equal(result.profit, 20.225);
  assert.equal(Number(result.margin.toFixed(2)), 57.79);
});

test('includes offsite ads and shipping revenue in percentage fees', () => {
  const result = calculateOrder({ price: 20, shippingCharged: 5, transactionRate: 6.5, paymentRate: 3, offsiteAdRate: 15, shippingCost: 5 });
  assert.equal(result.fees.offsiteAd, 3.75);
  assert.equal(result.profit, 13.425);
});

test('finds the price that covers fixed and percentage costs', () => {
  const result = calculateOrder({ price: 100, listingFee: 1, paymentFixed: 1, transactionRate: 10, paymentRate: 5, shippingCost: 10, materialCost: 5 });
  assert.equal(result.breakEvenPrice, 20);
});

test('rejects negative or non-numeric inputs', () => {
  assert.throws(() => calculateOrder({ price: -1 }));
  assert.throws(() => calculateOrder({ price: 'nope' }));
});

test('finds the item price for a target margin', () => {
  const input = { shippingCharged: 5, listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, shippingCost: 6, materialCost: 4 };
  const price = priceForMargin(input, 50);
  assert.ok(Math.abs(calculateOrder({ ...input, price }).margin - 50) < 0.000001);
});

test('rejects impossible target margins', () => {
  assert.throws(() => priceForMargin({ transactionRate: 60, paymentRate: 40 }, 1), /not possible/);
});

test('Plus defaults match the published $10 / 15 credits / $5 Ads credit example', () => {
  assert.deepEqual(ETSY_PLUS_DEFAULTS, { monthlyPlusFee: 10, listingCredits: 15, adsCredit: 5 });
});

test('using every Plus credit at $0.20 still leaves Plus $2 more expensive', () => {
  const result = compareEtsyPlus({
    listingFee: 0.2,
    listingsPerMonth: 15,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 5,
  });
  assert.equal(result.withoutPlus.listingFees, 3);
  assert.equal(result.withoutPlus.adsSpend, 5);
  assert.equal(result.withoutPlus.total, 8);
  assert.equal(result.withPlus.listingFees, 0);
  assert.equal(result.withPlus.adsSpend, 0);
  assert.equal(result.withPlus.plusFee, 10);
  assert.equal(result.withPlus.total, 10);
  assert.equal(result.creditValueUsed, 8);
  assert.equal(result.maxCreditValue, 8);
  assert.equal(result.netPlusCost, 2);
  assert.equal(result.monthlyDelta, -2);
  assert.equal(result.plusPays, false);
  assert.equal(result.breakEvenListings, null);
});

test('unused listing and Ads credits expire and do not count as savings', () => {
  const result = compareEtsyPlus({
    listingFee: 0.2,
    listingsPerMonth: 5,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 0,
  });
  assert.equal(result.creditsUsed, 5);
  assert.equal(result.listingValueUsed, 1);
  assert.equal(result.adsValueUsed, 0);
  assert.equal(result.unusedListingCredits, 10);
  assert.equal(result.unusedListingValue, 2);
  assert.equal(result.unusedAdsCredit, 5);
  assert.equal(result.withoutPlus.total, 1);
  assert.equal(result.withPlus.total, 10);
  assert.equal(result.monthlyDelta, -9);
  assert.equal(result.plusPays, false);
});

test('listings past the credit cap cost the same on both paths', () => {
  const atCap = compareEtsyPlus({
    listingFee: 0.2, listingsPerMonth: 15, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 5,
  });
  const pastCap = compareEtsyPlus({
    listingFee: 0.2, listingsPerMonth: 50, monthlyPlusFee: 10,
    listingCredits: 15, adsCredit: 5, monthlyAdSpend: 5,
  });
  assert.equal(pastCap.withoutPlus.listingFees, 10);
  assert.equal(pastCap.withPlus.listingFees, 7);
  assert.equal(pastCap.monthlyDelta, atCap.monthlyDelta);
});

test('assigned shop-feature value can make Plus cash-positive', () => {
  const result = compareEtsyPlus({
    listingFee: 0.2,
    listingsPerMonth: 15,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 5,
    otherPlusValue: 3,
  });
  assert.equal(result.creditValueUsed, 11);
  assert.equal(result.netPlusCost, -1);
  assert.equal(result.monthlyDelta, 1);
  assert.equal(result.plusPays, true);
  assert.equal(result.breakEvenListings, 10);
});

test('a higher listing fee can make the included credits cover Plus', () => {
  const result = compareEtsyPlus({
    listingFee: 1,
    listingsPerMonth: 15,
    monthlyPlusFee: 10,
    listingCredits: 15,
    adsCredit: 5,
    monthlyAdSpend: 0,
  });
  assert.equal(result.withoutPlus.total, 15);
  assert.equal(result.withPlus.total, 10);
  assert.equal(result.monthlyDelta, 5);
  assert.equal(result.plusPays, true);
  assert.equal(result.breakEvenListings, 10);
});

test('break-even listings is 0 when Ads and shop value already cover Plus', () => {
  assert.equal(plusBreakEvenListings({
    listingFee: 0.2, monthlyPlusFee: 10, listingCredits: 15,
    adsCredit: 5, monthlyAdSpend: 5, otherPlusValue: 5,
  }), 0);
});

test('credit value used never counts Ads you would not have bought', () => {
  const used = plusCreditValueUsed({
    listingFee: 0.2, listingsPerMonth: 15, listingCredits: 15,
    adsCredit: 5, monthlyAdSpend: 0,
  });
  assert.equal(used.adsValueUsed, 0);
  assert.equal(used.creditValueUsed, 3);
});

test('rejects negative Plus inputs', () => {
  assert.throws(() => compareEtsyPlus({ listingFee: -0.2 }), /Listing fee/);
  assert.throws(() => compareEtsyPlus({ listingsPerMonth: -1 }), /Listings per month/);
  assert.throws(() => plusBreakEvenListings({ listingFee: 0.2, monthlyPlusFee: -1, listingCredits: 15, adsCredit: 5, monthlyAdSpend: 0 }), /Monthly Plus fee/);
});

const PAGE_ORDER = {
  price: 30,
  shippingCharged: 5,
  listingFee: 0.2,
  transactionRate: 6.5,
  paymentRate: 3,
  paymentFixed: 0.25,
  offsiteAdRate: 0,
  shippingCost: 6,
  materialCost: 4,
  otherCost: 0,
};

test('personalization defaults match the $8 / $1.50 / $6 / 12-order example', () => {
  assert.deepEqual(PERSONALIZATION_DEFAULTS, {
    personalizationUpcharge: 8,
    extraMaterialCost: 1.5,
    extraTimeCost: 6,
    monthlyCustomOrders: 12,
  });
});

test('an $8 personalization loses cash against the standard $30 listing', () => {
  const result = comparePersonalization(PAGE_ORDER);
  assert.equal(result.asListed.profit, 21.23);
  assert.equal(result.personalized.profit, 20.97);
  assert.equal(result.extraKept, -0.26);
  assert.equal(result.extraFees, 0.76);
  assert.equal(result.extraCashCosts, 7.5);
  assert.equal(result.extraRevenue, 8);
  assert.equal(result.breakEvenUpcharge, 8.29);
  assert.equal(result.monthlyExtraKept, -3.12);
  assert.equal(result.upgradePays, false);
  assert.equal(result.incrementalPays, true);
  assert.equal(result.winner, 'as_listed');
  assert.equal(result.personalized.price, 38);
});

test('zero extra time makes the same $8 upcharge keep $5.74 more', () => {
  const result = comparePersonalization({ ...PAGE_ORDER, extraTimeCost: 0 });
  assert.equal(result.personalized.profit, 26.97);
  assert.equal(result.extraKept, 5.74);
  assert.equal(result.breakEvenUpcharge, 1.66);
  assert.equal(result.upgradePays, true);
  assert.equal(result.winner, 'personalized');
});

test('a $12 upcharge covers the default extras after fees', () => {
  const result = comparePersonalization({ ...PAGE_ORDER, personalizationUpcharge: 12 });
  assert.equal(result.personalized.profit, 24.59);
  assert.equal(result.extraKept, 3.36);
  assert.equal(result.upgradePays, true);
  assert.equal(result.monthlyExtraKept, 40.32);
});

test('Offsite Ads raise extra fees and the break-even upcharge', () => {
  const result = comparePersonalization({ ...PAGE_ORDER, offsiteAdRate: 15 });
  assert.equal(result.asListed.profit, 15.98);
  assert.equal(result.personalized.profit, 14.52);
  assert.equal(result.extraKept, -1.46);
  assert.equal(result.extraFees, 1.96);
  assert.equal(result.breakEvenUpcharge, 9.93);
});

test('an incremental custom request can still pay when the upgrade loses', () => {
  const result = comparePersonalization(PAGE_ORDER);
  assert.equal(result.upgradePays, false);
  assert.equal(result.incrementalPays, true);
  assert.equal(result.incrementalProfit, 20.97);
});

test('personalization note names both the upgrade gap and the incremental frame', () => {
  const note = personalizationNote(comparePersonalization(PAGE_ORDER));
  assert.match(note, /\$8\.00 personalization/);
  assert.match(note, /\$0\.26 less/);
  assert.match(note, /\$21\.23/);
  assert.match(note, /\$8\.29/);
  assert.match(note, /\$20\.97 versus \$0\.00/);
});

test('rejects negative personalization inputs', () => {
  assert.throws(() => comparePersonalization({ ...PAGE_ORDER, personalizationUpcharge: -8 }), /Personalization upcharge/);
  assert.throws(() => comparePersonalization({ ...PAGE_ORDER, extraTimeCost: -1 }), /Extra time cost/);
});

test('Etsy Ads defaults match the 12% ACOS example', () => {
  assert.deepEqual(ETSY_ADS_DEFAULTS, { etsyAdsAcosPct: 12 });
});

test('a 12% ACOS still leaves a profit on an extra $30 order', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, monthlyAdSpend: 5 });
  assert.equal(result.organic.profit, 21.23);
  assert.equal(result.advertised.profit, 17.03);
  assert.equal(result.adsCost, 4.2);
  assert.equal(result.extraKept, -4.2);
  assert.equal(result.breakEvenAcosPct, 60.64);
  assert.equal(result.advertisedOrdersFromSpend, 1.19);
  assert.equal(result.monthlyIncrementalKept, 20.27);
  assert.equal(result.incrementalPays, true);
  assert.equal(result.winner, 'organic');
});

test('a 70% ACOS turns an extra advertised order into a loss', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, etsyAdsAcosPct: 70, monthlyAdSpend: 5 });
  assert.equal(result.adsCost, 24.5);
  assert.equal(result.advertised.profit, -3.27);
  assert.equal(result.incrementalPays, false);
  assert.equal(result.breakEvenAcosPct, 60.64);
});

test('Offsite Ads lower the ACOS ceiling on the same click', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, offsiteAdRate: 15, monthlyAdSpend: 5 });
  assert.equal(result.organic.profit, 15.98);
  assert.equal(result.advertised.profit, 11.78);
  assert.equal(result.adsCost, 4.2);
  assert.equal(result.breakEvenAcosPct, 45.64);
});

test('zero ACOS leaves the advertised sale equal to organic', () => {
  const result = compareEtsyAds({ ...PAGE_ORDER, etsyAdsAcosPct: 0, monthlyAdSpend: 5 });
  assert.equal(result.adsCost, 0);
  assert.equal(result.advertised.profit, result.organic.profit);
  assert.equal(result.extraKept, 0);
  assert.equal(result.winner, 'tie');
  assert.equal(result.advertisedOrdersFromSpend, Infinity);
});

test('Etsy Ads note names the cannibalized gap, the ceiling, and the monthly budget', () => {
  const note = etsyAdsNote(compareEtsyAds({ ...PAGE_ORDER, monthlyAdSpend: 5 }));
  assert.match(note, /12\.00% ACOS/);
  assert.match(note, /\$4\.20/);
  assert.match(note, /\$17\.03/);
  assert.match(note, /\$4\.20 less/);
  assert.match(note, /\$21\.23/);
  assert.match(note, /60\.64%/);
  assert.match(note, /\$17\.03 versus \$0\.00/);
  assert.match(note, /\$5\.00 monthly budget/);
  assert.match(note, /1\.19 advertised orders/);
  assert.match(note, /\$20\.27/);
});

test('rejects a negative Etsy Ads ACOS', () => {
  assert.throws(() => compareEtsyAds({ ...PAGE_ORDER, etsyAdsAcosPct: -12 }), /Etsy Ads ACOS/);
});
