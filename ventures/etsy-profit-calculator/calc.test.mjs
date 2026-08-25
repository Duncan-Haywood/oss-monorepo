import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, priceForMargin, calculateListingRenewal } from './calc.mjs';

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

const renewalInput = {
  price: 30,
  shippingCharged: 5,
  listingFee: 0.2,
  transactionRate: 6.5,
  paymentRate: 3,
  paymentFixed: 0.25,
  offsiteAdRate: 0,
  shippingCost: 6,
  materialCost: 4,
  otherCost: 1,
  renewalMonths: 4,
};

test('allocates the listing fee across sales in one renewal window', () => {
  const result = calculateListingRenewal({ ...renewalInput, expectedSales: 5 });
  const withoutListing = calculateOrder({ ...renewalInput, listingFee: 0 });
  assert.equal(result.listingPerSale, 0.04);
  assert.equal(result.contributionExListing, withoutListing.profit);
  assert.equal(result.periodProfitAfterListing, withoutListing.profit * 5 - 0.2);
  assert.equal(Number(result.annualListingCost.toFixed(2)), 0.6);
  assert.equal(result.overstatedInPeriod, 0.8);
  assert.equal(result.coversListing, true);
  assert.equal(result.unpaidRenewal, false);
  assert.equal(result.profitIfAllocated, calculateOrder({ ...renewalInput, listingFee: 0.04 }).profit);
});

test('keeps the listing fee on a listing that sells nothing', () => {
  const result = calculateListingRenewal({ ...renewalInput, expectedSales: 0 });
  assert.equal(result.listingPerSale, null);
  assert.equal(result.profitIfAllocated, null);
  assert.equal(result.periodProfitAfterListing, -0.2);
  assert.equal(result.coversListing, false);
  assert.equal(result.unpaidRenewal, true);
  assert.equal(result.scenarios[0].periodProfitAfterListing, -0.2);
  assert.equal(result.scenarios[0].periodProfitIfListingPerOrder, 0);
});

test('counts how many sales recover the listing fee from leftover contribution', () => {
  const result = calculateListingRenewal({ ...renewalInput, expectedSales: 2 });
  assert.equal(result.salesToRecover, 1);
  assert.ok(result.contributionExListing > 0.2);
});

test('reports that a losing order never recovers the listing fee', () => {
  const result = calculateListingRenewal({
    ...renewalInput,
    price: 5,
    shippingCharged: 0,
    shippingCost: 8,
    materialCost: 4,
    expectedSales: 10,
  });
  assert.equal(result.salesToRecover, null);
  assert.equal(result.coversListing, false);
});

test('rejects a zero or invalid renewal window', () => {
  assert.throws(() => calculateListingRenewal({ ...renewalInput, renewalMonths: 0 }), /greater than zero/);
  assert.throws(() => calculateListingRenewal({ ...renewalInput, expectedSales: -1 }), /non-negative/);
});
