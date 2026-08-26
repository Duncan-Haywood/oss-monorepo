import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVERB_DEFAULTS,
  calculateReverbSale,
  calculateEbaySale,
  compareOfferToList,
  compareReverbToEbay,
  offerThatMatchesEbayList,
  compareShippingPaths,
  compareSafeShipping,
  ILLUSTRATED_SAFE_SHIPPING_PREMIUM,
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

test('including $75 of shipping in an $800 list costs 5% more marketplace fee', () => {
  const comparison = compareShippingPaths(REVERB_DEFAULTS);
  assert.equal(comparison.buyerPays.profit, calculateReverbSale(REVERB_DEFAULTS, 800).profit);
  assert.equal(comparison.included.salePrice, 875);
  assert.equal(comparison.included.revenue, 875);
  assert.equal(comparison.included.fees.marketplace, 43.75);
  assert.equal(comparison.extraMarketplaceOnIncluded, 3.75);
  assert.equal(comparison.extraGivesOnIncluded, 0);
  assert.equal(Number(comparison.included.profit.toFixed(3)), 280.575);
  assert.equal(Number(comparison.rows[1].vsBuyerPays.toFixed(2)), -3.75);
  assert.equal(comparison.winner, 'buyerPays');
});

test('local pickup drops postage both ways and loses the shipping charged', () => {
  const comparison = compareShippingPaths(REVERB_DEFAULTS);
  assert.equal(comparison.pickup.salePrice, 800);
  assert.equal(comparison.pickup.revenue, 800);
  assert.equal(comparison.pickup.fees.marketplace, 40);
  assert.equal(comparison.pickup.fees.payment, 23.5);
  assert.equal(comparison.pickup.profit, 276.5);
  assert.equal(Number(comparison.rows[2].vsBuyerPays.toFixed(3)), -7.825);
});

test('the included list that matches buyer-pays cash recovers the extra marketplace line', () => {
  const comparison = compareShippingPaths(REVERB_DEFAULTS);
  const atMatch = calculateReverbSale(
    { ...REVERB_DEFAULTS, shippingCharged: 0 },
    comparison.includedListThatMatchesBuyerPays,
  );
  assert.ok(Math.abs(atMatch.profit - comparison.buyerPays.profit) < 1e-9);
  assert.ok(comparison.includedListThatMatchesBuyerPays > 875);
});

test('buyer-pays and included match when shipping charged is already zero', () => {
  const comparison = compareShippingPaths({ ...REVERB_DEFAULTS, shippingCharged: 0 });
  assert.equal(comparison.buyerPays.profit, comparison.included.profit);
  assert.equal(comparison.extraMarketplaceOnIncluded, 0);
  assert.equal(comparison.winner, 'pickup');
});

test('Safe Shipping at the default $80 quote costs $15 more label than the $65 own label', () => {
  const comparison = compareSafeShipping(REVERB_DEFAULTS);
  assert.equal(comparison.own.profit, calculateReverbSale(REVERB_DEFAULTS, 800).profit);
  assert.equal(comparison.ownLabel, 65);
  assert.equal(comparison.safeLabel, 80);
  assert.equal(comparison.extraLabelCost, 15);
  assert.equal(comparison.usedIllustratedQuote, false);
  assert.equal(Number(comparison.safe.profit.toFixed(3)), 269.325);
  assert.equal(comparison.expectedClaim, 9);
  assert.equal(Number(comparison.ownExpectedProfit.toFixed(3)), 275.325);
  assert.equal(Number(comparison.breakEvenLossRatePct.toFixed(2)), 3.33);
  assert.equal(comparison.winner, 'ownExpected');
  assert.equal(comparison.safePays, false);
});

test('a $0 Safe Shipping quote is illustrated at own label plus the published premium', () => {
  const comparison = compareSafeShipping({ ...REVERB_DEFAULTS, safeShippingCost: 0 });
  assert.equal(comparison.usedIllustratedQuote, true);
  assert.equal(comparison.safeLabel, REVERB_DEFAULTS.shippingCost + ILLUSTRATED_SAFE_SHIPPING_PREMIUM);
  assert.equal(comparison.safeLabel, 80);
});

test('the extra label is worth it once the claim rate crosses the break-even', () => {
  const atBreak = compareSafeShipping(REVERB_DEFAULTS);
  const comparison = compareSafeShipping({
    ...REVERB_DEFAULTS,
    unprotectedLossRatePct: atBreak.breakEvenLossRatePct,
  });
  assert.ok(Math.abs(comparison.ownExpectedProfit - comparison.safe.profit) < 1e-9);
  assert.equal(comparison.winner, 'tie');

  const above = compareSafeShipping({ ...REVERB_DEFAULTS, unprotectedLossRatePct: 4 });
  assert.equal(above.expectedClaim, 18);
  assert.equal(Number(above.ownExpectedProfit.toFixed(3)), 266.325);
  assert.equal(above.winner, 'safeShipping');
  assert.equal(above.safePays, true);
});

test('claim cost defaults to item cost and a zero claim makes Safe Shipping a pure extra', () => {
  const omitted = compareSafeShipping({ ...REVERB_DEFAULTS, claimCost: undefined });
  assert.equal(omitted.claimCost, REVERB_DEFAULTS.itemCost);
  const none = compareSafeShipping({ ...REVERB_DEFAULTS, claimCost: 0 });
  assert.equal(none.expectedClaim, 0);
  assert.equal(none.ownExpectedProfit, none.own.profit);
  assert.equal(none.winner, 'ownExpected');
  assert.equal(none.breakEvenLossRatePct, Infinity);
});

test('rejects an unprotected claim rate above 100%', () => {
  assert.throws(() => compareSafeShipping({ ...REVERB_DEFAULTS, unprotectedLossRatePct: 101 }), /at most 100/);
});
