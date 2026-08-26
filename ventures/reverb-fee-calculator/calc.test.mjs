import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVERB_DEFAULTS,
  calculateReverbSale,
  calculateEbaySale,
  compareOfferToList,
  compareReverbToEbay,
  offerThatMatchesEbayList,
} from './calc.mjs';

test('Reverb at the default list price keeps the published worked example', () => {
  const result = calculateReverbSale(REVERB_DEFAULTS, 800);
  assert.equal(result.revenue, 875);
  assert.equal(result.fees.marketplace, 40);
  assert.equal(result.fees.gives, 0);
  assert.equal(result.fees.payment, 25.675);
  assert.equal(result.fees.bump, 0);
  assert.equal(result.fees.total, 65.675);
  assert.equal(Number(result.profit.toFixed(3)), 284.325);
  assert.equal(Number(result.margin.toFixed(2)), 32.49);
});

test('marketplace fee is on the item; payment is on item plus shipping', () => {
  const result = calculateReverbSale({
    shippingCharged: 100,
    shippingCost: 0,
    itemCost: 0,
    otherCost: 0,
    marketplaceRate: 5,
    paymentRate: 2,
    paymentFixed: 1,
    givesRate: 0,
    bumpFee: 0,
  }, 400);
  assert.equal(result.fees.marketplace, 20);
  assert.equal(result.fees.payment, 11);
  assert.equal(result.profit, 469);
});

test('Reverb Gives and a bump are cash out of this sale', () => {
  const result = calculateReverbSale({
    ...REVERB_DEFAULTS,
    givesRate: 0.5,
    bumpFee: 12,
  }, 800);
  assert.equal(result.fees.gives, 4);
  assert.equal(result.fees.bump, 12);
  assert.equal(Number(result.profit.toFixed(3)), 268.325);
});

test('a $720 offer leaves $73.68 on the table versus the $800 list', () => {
  const comparison = compareOfferToList(REVERB_DEFAULTS);
  assert.equal(Number(comparison.list.profit.toFixed(3)), 284.325);
  assert.equal(Number(comparison.offer.profit.toFixed(3)), 210.645);
  assert.equal(Number(comparison.leaveOnTable.toFixed(2)), 73.68);
  assert.equal(comparison.offerStillPays, true);
});

test('Reverb at list still beats eBay at the same $800 on the default rates', () => {
  const comparison = compareReverbToEbay(REVERB_DEFAULTS, 800);
  assert.equal(comparison.ebay.fees.finalValue, 115.9375);
  assert.equal(Number(comparison.ebay.profit.toFixed(4)), 233.7625);
  assert.equal(Number(comparison.reverbExtra.toFixed(4)), 50.5625);
});

test('the crossover offer matches eBay list cash on Reverb', () => {
  const match = offerThatMatchesEbayList(REVERB_DEFAULTS);
  const atOffer = calculateReverbSale(REVERB_DEFAULTS, match.offerPrice);
  assert.ok(Math.abs(atOffer.profit - match.ebayListProfit) < 1e-9);
  assert.ok(match.offerPrice > 720);
  assert.ok(match.offerPrice < 800);
});

test('rejects negative or non-numeric prices', () => {
  assert.throws(() => calculateReverbSale(REVERB_DEFAULTS, -1));
  assert.throws(() => calculateReverbSale(REVERB_DEFAULTS, 'nope'));
  assert.throws(() => calculateEbaySale({ ...REVERB_DEFAULTS, ebayFinalValueRate: 100 }, 800));
});
