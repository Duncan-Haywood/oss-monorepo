import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin, compareEtsyPlus, plusBreakEvenListings, plusCreditValueUsed, ETSY_PLUS_DEFAULTS } from './calc.mjs';

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
