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
  compareBump,
  ILLUSTRATED_BUMP_DEFAULT,
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

test('a $0 bump fee is illustrated at $3 so the table is not the same sale twice', () => {
  const comparison = compareBump(REVERB_DEFAULTS);
  assert.equal(comparison.bump, ILLUSTRATED_BUMP_DEFAULT);
  assert.equal(comparison.usedTypedBump, false);
  assert.equal(comparison.offerNoBump.profit, calculateReverbSale({ ...REVERB_DEFAULTS, bumpFee: 0 }, 720).profit);
  assert.equal(comparison.offerWithBump.fees.bump, 3);
  assert.equal(Number(comparison.offerWithBump.profit.toFixed(3)), Number((comparison.offerNoBump.profit - 3).toFixed(3)));
  assert.equal(Number(comparison.listWithBump.profit.toFixed(3)), Number((comparison.listNoBump.profit - 3).toFixed(3)));
  assert.equal(comparison.winner, 'listNoBump');
});

test('a $3 bump only pays if it gets you from the $720 offer to the $800 list', () => {
  const comparison = compareBump(REVERB_DEFAULTS);
  assert.equal(Number(comparison.offerNoBump.profit.toFixed(3)), 210.645);
  assert.equal(Number(comparison.listWithBump.profit.toFixed(3)), 281.325);
  assert.equal(comparison.bumpPaysIfYouReachList, true);
  assert.equal(Number(comparison.cashBumpSavesVsOfferIfYouReachList.toFixed(2)), 70.68);
  assert.equal(Number(comparison.rows[1].vsOfferNoBump.toFixed(2)), -3);
  assert.ok(comparison.listWithBump.profit > comparison.offerNoBump.profit);
  assert.ok(comparison.offerWithBump.profit < comparison.offerNoBump.profit);
});

test('the extra offer that covers a bump recovers the bump after percentage fees', () => {
  const comparison = compareBump(REVERB_DEFAULTS);
  const atCover = calculateReverbSale({ ...REVERB_DEFAULTS, bumpFee: comparison.bump }, comparison.offerThatCoversBump);
  assert.ok(Math.abs(atCover.profit - comparison.offerNoBump.profit) < 1e-9);
  assert.ok(comparison.offerThatCoversBump > 720);
  assert.equal(Number(comparison.extraSaleToCoverBump.toFixed(4)), Number((3 / 0.921).toFixed(4)));
});

test('a typed bump replaces the $3 illustration', () => {
  const comparison = compareBump({ ...REVERB_DEFAULTS, bumpFee: 12 });
  assert.equal(comparison.bump, 12);
  assert.equal(comparison.usedTypedBump, true);
  assert.equal(comparison.offerWithBump.fees.bump, 12);
  assert.equal(Number(comparison.listWithBump.profit.toFixed(3)), 272.325);
  assert.equal(comparison.bumpPaysIfYouReachList, true);
});
