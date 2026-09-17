import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVERB_DEFAULTS,
  calculateReverbSale,
  calculateEbaySale,
  compareOfferToList,
  compareReverbToEbay,
  offerThatMatchesEbayList,
  counterOfferMessage,
  compareShippingPaths,
  compareSafeShipping,
  compareConsignment,
  consignmentNote,
  ILLUSTRATED_SAFE_SHIPPING_PREMIUM,
  compareBump,
  ILLUSTRATED_BUMP_DEFAULT,
  compareReturnResolution,
  returnResolutionNote,
  compareWaitForBetterOffer,
  waitForBetterOfferNote,
} from './calc.mjs';

test('Reverb at the default list price keeps the published worked example', () => {
  const result = calculateReverbSale(REVERB_DEFAULTS, 800);
  assert.equal(result.revenue, 875);
  assert.equal(result.fees.marketplace, 40);
  assert.equal(result.fees.gives, 0);
  assert.equal(result.fees.payment, 28.4025);
  assert.equal(result.fees.bump, 0);
  assert.equal(result.fees.total, 68.4025);
  assert.equal(Number(result.profit.toFixed(3)), 281.597);
  assert.equal(Number(result.margin.toFixed(2)), 32.18);
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
  assert.equal(Number(result.profit.toFixed(3)), 265.597);
});

test('a $720 offer leaves $73.45 on the table versus the $800 list', () => {
  const comparison = compareOfferToList(REVERB_DEFAULTS);
  assert.equal(Number(comparison.list.profit.toFixed(3)), 281.597);
  assert.equal(Number(comparison.offer.profit.toFixed(3)), 208.149);
  assert.equal(Number(comparison.leaveOnTable.toFixed(2)), 73.45);
  assert.equal(comparison.offerStillPays, true);
});

test('Reverb at list still beats eBay at the same $800 on the default rates', () => {
  const comparison = compareReverbToEbay(REVERB_DEFAULTS, 800);
  assert.equal(comparison.ebay.fees.finalValue, 115.9375);
  assert.equal(Number(comparison.ebay.profit.toFixed(4)), 233.7625);
  assert.equal(Number(comparison.reverbExtra.toFixed(4)), 47.835);
});

test('the crossover offer matches eBay list cash on Reverb', () => {
  const match = offerThatMatchesEbayList(REVERB_DEFAULTS);
  const atOffer = calculateReverbSale(REVERB_DEFAULTS, match.offerPrice);
  assert.ok(Math.abs(atOffer.profit - match.ebayListProfit) < 1e-9);
  assert.ok(match.offerPrice > 720);
  assert.ok(match.offerPrice < 800);
});

test('counterOfferMessage asks for the crossover, rounded up to a whole dollar, when the offer falls short', () => {
  const message = counterOfferMessage(REVERB_DEFAULTS);
  const match = offerThatMatchesEbayList(REVERB_DEFAULTS);
  assert.ok(Math.ceil(match.offerPrice) > 720, 'the worked example should need a counter, not an acceptance');
  assert.match(message, /\$720\.00/);
  assert.match(message, new RegExp(`\\$${Math.ceil(match.offerPrice)}\\b`));
  assert.doesNotMatch(message, /glad to accept/);
});

test('counterOfferMessage reads as an acceptance once the offer already clears the crossover', () => {
  const message = counterOfferMessage({ ...REVERB_DEFAULTS, offerPrice: 760 });
  assert.match(message, /\$760\.00/);
  assert.match(message, /glad to accept/);
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
  assert.equal(Number(comparison.included.profit.toFixed(3)), 277.847);
  assert.equal(Number(comparison.rows[1].vsBuyerPays.toFixed(2)), -3.75);
  assert.equal(comparison.winner, 'buyerPays');
});

test('local pickup drops postage both ways and loses the shipping charged', () => {
  const comparison = compareShippingPaths(REVERB_DEFAULTS);
  assert.equal(comparison.pickup.salePrice, 800);
  assert.equal(comparison.pickup.revenue, 800);
  assert.equal(comparison.pickup.fees.marketplace, 40);
  assert.equal(comparison.pickup.fees.payment, 26.009999999999998);
  assert.equal(comparison.pickup.profit, 273.99);
  assert.equal(Number(comparison.rows[2].vsBuyerPays.toFixed(3)), -7.607);
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

test('absorbing the label keeps the $800 list and leaves $68.86 versus including shipping', () => {
  const comparison = compareShippingPaths(REVERB_DEFAULTS);
  assert.equal(comparison.absorbed.salePrice, 800);
  assert.equal(comparison.absorbed.revenue, 800);
  assert.equal(comparison.absorbed.fees.marketplace, 40);
  assert.equal(comparison.absorbed.fees.payment, 26.009999999999998);
  assert.equal(comparison.absorbed.profit, 208.99);
  assert.equal(Number(comparison.rows[3].vsBuyerPays.toFixed(3)), -72.607);
  assert.equal(Number(comparison.absorbVsIncluded.toFixed(3)), -68.857);
  assert.ok(comparison.absorbed.profit < comparison.included.profit);
});

test('a meetup cost comes out of pickup cash and does not change the other paths', () => {
  const baseline = compareShippingPaths(REVERB_DEFAULTS);
  const withMeetup = compareShippingPaths({ ...REVERB_DEFAULTS, meetupCost: 20 });
  assert.equal(withMeetup.buyerPays.profit, baseline.buyerPays.profit);
  assert.equal(withMeetup.included.profit, baseline.included.profit);
  assert.equal(withMeetup.absorbed.profit, baseline.absorbed.profit);
  assert.equal(withMeetup.pickup.profit, baseline.pickup.profit - 20);
  assert.equal(withMeetup.meetupCost, 20);
});

test('Safe Shipping at the default $80 quote costs $15 more label than the $65 own label', () => {
  const comparison = compareSafeShipping(REVERB_DEFAULTS);
  assert.equal(comparison.own.profit, calculateReverbSale(REVERB_DEFAULTS, 800).profit);
  assert.equal(comparison.ownLabel, 65);
  assert.equal(comparison.safeLabel, 80);
  assert.equal(comparison.extraLabelCost, 15);
  assert.equal(comparison.usedIllustratedQuote, false);
  assert.equal(Number(comparison.safe.profit.toFixed(3)), 266.597);
  assert.equal(comparison.expectedClaim, 9);
  assert.equal(Number(comparison.ownExpectedProfit.toFixed(3)), 272.597);
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
  assert.equal(Number(above.ownExpectedProfit.toFixed(3)), 263.597);
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

test('a 30% shop cut on an $800 sale leaves $171.60 less than listing it yourself', () => {
  const comparison = compareConsignment(REVERB_DEFAULTS);
  assert.equal(comparison.selfList.profit, calculateReverbSale(REVERB_DEFAULTS, 800).profit);
  assert.equal(comparison.shopSalePrice, 800);
  assert.equal(comparison.consignmentRate, 30);
  assert.equal(comparison.shopCashOffer, 520);
  assert.equal(comparison.shopPayout, 560);
  assert.equal(comparison.consignProfit, 110);
  assert.equal(comparison.cashProfit, 70);
  assert.equal(Number(comparison.rows[1].vsSelfList.toFixed(2)), -171.6);
  assert.equal(Number(comparison.rows[2].vsSelfList.toFixed(2)), -211.6);
  assert.equal(comparison.winner, 'selfList');
  assert.equal(Number(comparison.breakEvenConsignmentRatePct.toFixed(2)), 8.55);
  assert.equal(Number(comparison.breakEvenShopSalePrice.toFixed(2)), 1045.14);
  assert.equal(Number(comparison.breakEvenShopCash.toFixed(2)), 731.6);
  assert.equal(comparison.shopSaleCanMatch, true);
});

test('the break-even shop cut matches Reverb list cash', () => {
  const atDefault = compareConsignment(REVERB_DEFAULTS);
  const comparison = compareConsignment({
    ...REVERB_DEFAULTS,
    consignmentRate: atDefault.breakEvenConsignmentRatePct,
  });
  assert.ok(Math.abs(comparison.consignProfit - comparison.selfList.profit) < 1e-9);
  assert.equal(comparison.winner === 'tie' || comparison.winner === 'selfList' || comparison.winner === 'consign', true);
  assert.ok(Math.abs(comparison.consignProfit - comparison.selfList.profit) < 1e-6);
});

test('a 15% shop cut still loses to list but beats the $720 Reverb offer', () => {
  const comparison = compareConsignment({ ...REVERB_DEFAULTS, consignmentRate: 15 });
  assert.equal(comparison.shopPayout, 680);
  assert.equal(comparison.consignProfit, 230);
  assert.equal(comparison.winner, 'selfList');
  assert.ok(comparison.vsOffer > 0);
  assert.equal(Number(comparison.vsOffer.toFixed(2)), 21.85);
});

test('taking $800 cash today ties listing yourself after Reverb costs on the default rates', () => {
  const comparison = compareConsignment({ ...REVERB_DEFAULTS, shopCashOffer: 731.5975 });
  assert.ok(Math.abs(comparison.cashProfit - comparison.selfList.profit) < 1e-9);
});

test('rejects a shop consignment cut above 100%', () => {
  assert.throws(() => compareConsignment({ ...REVERB_DEFAULTS, consignmentRate: 101 }), /at most 100/);
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
  assert.equal(Number(comparison.offerNoBump.profit.toFixed(3)), 208.149);
  assert.equal(Number(comparison.listWithBump.profit.toFixed(3)), 278.597);
  assert.equal(comparison.bumpPaysIfYouReachList, true);
  assert.equal(Number(comparison.cashBumpSavesVsOfferIfYouReachList.toFixed(2)), 70.45);
  assert.equal(Number(comparison.rows[1].vsOfferNoBump.toFixed(2)), -3);
  assert.ok(comparison.listWithBump.profit > comparison.offerNoBump.profit);
  assert.ok(comparison.offerWithBump.profit < comparison.offerNoBump.profit);
});

test('the extra offer that covers a bump recovers the bump after percentage fees', () => {
  const comparison = compareBump(REVERB_DEFAULTS);
  const atCover = calculateReverbSale({ ...REVERB_DEFAULTS, bumpFee: comparison.bump }, comparison.offerThatCoversBump);
  assert.ok(Math.abs(atCover.profit - comparison.offerNoBump.profit) < 1e-9);
  assert.ok(comparison.offerThatCoversBump > 720);
  assert.equal(Number(comparison.extraSaleToCoverBump.toFixed(4)), Number((3 / 0.9181).toFixed(4)));
});

test('a typed bump replaces the $3 illustration', () => {
  const comparison = compareBump({ ...REVERB_DEFAULTS, bumpFee: 12 });
  assert.equal(comparison.bump, 12);
  assert.equal(comparison.usedTypedBump, true);
  assert.equal(comparison.offerWithBump.fees.bump, 12);
  assert.equal(Number(comparison.listWithBump.profit.toFixed(3)), 269.597);
  assert.equal(comparison.bumpPaysIfYouReachList, true);
});

test('consignmentNote names the default worked example without telling you to consign', () => {
  const note = consignmentNote(compareConsignment(REVERB_DEFAULTS));
  assert.match(note, /Listing it yourself on Reverb still leaves \$171\.60 more/);
  assert.match(note, /30% shop cut/);
  assert.match(note, /\$520\.00 cash offer/);
  assert.match(note, /8\.55%/);
  assert.match(note, /\$1045\.14/);
  assert.match(note, /\$731\.60/);
  assert.doesNotMatch(note, /you should|recommend|must consign/i);
});

test('the return path prices three legs of freight, not one', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  // Out at $65, back at $75, out again at $65 on the relist.
  assert.equal(comparison.freightOnReturnPath, 205);
  assert.equal(Number(comparison.returnPosition.toFixed(3)), 31.174);
  assert.equal(Number(comparison.saleStandsPosition.toFixed(3)), 281.597);
  assert.equal(Number(comparison.costOfTakingTheReturn.toFixed(2)), 250.42);
});

test('the fee credit on a refund covers the percentages only, never the fixed line', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  // 5% of $800 plus 3.19% of $875 is $67.9125 of the $68.4025 charged; the
  // $0.49 per-order fee is the rest and no refund returns it, at any
  // feeRefundOnReturnPct — it is added back in full, never scaled by the
  // refund rate.
  assert.equal(Number((comparison.percentFeeRate * 875).toFixed(3)), 67.912);
  assert.equal(Number(comparison.unrefundedFees.toFixed(3)), Number((67.9125 * 0.39 + 0.49).toFixed(3)));
});

test('the break-even partial refund exactly ties taking the return', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  assert.equal(Number(comparison.breakEvenPartialRefund.toFixed(2)), 262.87);
  const atBreakEven = compareReturnResolution({
    ...REVERB_DEFAULTS,
    partialRefund: comparison.breakEvenPartialRefund,
  });
  assert.ok(Math.abs(atBreakEven.partialPosition - atBreakEven.returnPosition) < 1e-9);
  assert.equal(comparison.breakEvenRefundCappedByOrder, false);
});

test('a refund a dollar either side of break-even lands on the expected side', () => {
  const base = compareReturnResolution(REVERB_DEFAULTS);
  const under = compareReturnResolution({ ...REVERB_DEFAULTS, partialRefund: base.breakEvenPartialRefund - 1 });
  const over = compareReturnResolution({ ...REVERB_DEFAULTS, partialRefund: base.breakEvenPartialRefund + 1 });
  assert.ok(under.partialPosition > under.returnPosition);
  assert.ok(over.partialPosition < over.returnPosition);
});

test('the default $150 concession beats the return and full-refund-and-keep does not', () => {
  const comparison = compareReturnResolution(REVERB_DEFAULTS);
  assert.equal(Number(comparison.partialPosition.toFixed(2)), 138.7);
  assert.ok(comparison.partialPosition > comparison.returnPosition);
  assert.ok(comparison.rows[3].position < comparison.returnPosition);
  assert.equal(comparison.winner, 'sale');
  assert.equal(comparison.rows[2].itemRecovered, true);
  assert.equal(comparison.rows[1].itemRecovered, false);
});

test('a relist that fetches the original price still loses the freight and the residue', () => {
  const comparison = compareReturnResolution({ ...REVERB_DEFAULTS, relistPrice: 800 });
  assert.equal(Number(comparison.relistHaircut.toFixed(2)), 0);
  // Nothing given up on the price, and the return still costs the two extra
  // legs of freight, the second prep, and the unrefunded processing.
  assert.equal(Number(comparison.costOfTakingTheReturn.toFixed(2)), Number((65 + 75 + 10 + 67.9125 * 0.39 + 0.49).toFixed(2)));
});

test('a relist price of $0 prices the piece as coming back unsellable', () => {
  const comparison = compareReturnResolution({ ...REVERB_DEFAULTS, relistPrice: 0 });
  assert.equal(comparison.itemResellable, false);
  assert.equal(comparison.relistNet, -450);
  assert.equal(comparison.relist, null);
  // No second sale means no third leg of freight either.
  assert.equal(comparison.freightOnReturnPath, 140);
  assert.equal(Number(comparison.returnPosition.toFixed(3)), Number((-(65 + 75 + 10 + 67.9125 * 0.39 + 0.49) - 450).toFixed(3)));
  assert.ok(comparison.breakEvenRefundCappedByOrder);
});

test('a bump fee already spent is never credited back on a return, at any refund rate', () => {
  const withoutBump = compareReturnResolution(REVERB_DEFAULTS);
  const withBump = compareReturnResolution({ ...REVERB_DEFAULTS, bumpFee: 15 });
  // The $15 bump adds straight to unrefundedFees — none of it is scaled
  // down by the 61% feeRefundOnReturnPct, matching percentFeeRate's own
  // rule that a bump already spent is not refund-linked.
  assert.equal(
    Number((withBump.unrefundedFees - withoutBump.unrefundedFees).toFixed(3)),
    15,
  );
  assert.equal(Number(withBump.unrefundedFees.toFixed(3)), 41.976);
});

test('a full fee refund still leaves the $0.49 fixed fee unrefunded', () => {
  const comparison = compareReturnResolution({ ...REVERB_DEFAULTS, feeRefundOnReturnPct: 100 });
  // The 100% refund rate applies only to the percentage fees; the fixed
  // per-order payment fee is never refund-linked, so it alone remains.
  assert.equal(Number(comparison.unrefundedFees.toFixed(3)), 0.49);
  assert.equal(Number(comparison.costOfTakingTheReturn.toFixed(2)), Number((65 + 75 + 10 + 73.45 + 0.49).toFixed(2)));
  assert.ok(comparison.breakEvenPartialRefund > 0);
});

test('the return comparison refuses a refund larger than the order', () => {
  assert.throws(
    () => compareReturnResolution({ ...REVERB_DEFAULTS, partialRefund: 900 }),
    /Partial refund cannot exceed the order total/,
  );
  assert.throws(
    () => compareReturnResolution({ ...REVERB_DEFAULTS, feeRefundOnReturnPct: 140 }),
    /at most 100%/,
  );
  assert.throws(
    () => compareReturnResolution({ ...REVERB_DEFAULTS, returnShippingCost: -5 }),
    /non-negative/,
  );
});

test('returnResolutionNote names the ceiling without telling you what to do', () => {
  const note = returnResolutionNote(compareReturnResolution(REVERB_DEFAULTS));
  assert.match(note, /Taking the return costs \$250\.42/);
  assert.match(note, /\$205\.00 of freight over three legs/);
  assert.match(note, /\$26\.98 of fees no refund gives back/);
  assert.match(note, /\$73\.45 given up on the relist/);
  assert.match(note, /partial refund up to \$262\.87/);
  assert.doesNotMatch(note, /you should|we recommend|must refund/i);
});

test('returnResolutionNote flips when the relist is worth more than the sale', () => {
  const note = returnResolutionNote(compareReturnResolution({
    ...REVERB_DEFAULTS,
    relistPrice: 1400,
  }));
  assert.match(note, /Taking the return leaves \$[\d.]+ more/);
  assert.match(note, /No partial refund is cheaper than shipping it back/);
});

test('returnResolutionNote counts two legs of freight when nothing goes back out', () => {
  const note = returnResolutionNote(compareReturnResolution({ ...REVERB_DEFAULTS, relistPrice: 0 }));
  assert.match(note, /\$140\.00 of freight over two legs/);
  assert.doesNotMatch(note, /three legs/);
  assert.match(note, /comes back unsellable/);
  assert.match(note, /Even refunding the whole \$875\.00 order/);
});

// Every comparison above treats "wait for list" as a sure thing. It is not:
// declining an offer buys a chance of list, not list itself, and the
// realistic alternative if that chance doesn't land is usually another
// offer near (or below) the one already in hand.
test('on the worked example, taking the $720 offer beats a 30% chance of list against a $680 fallback', () => {
  const comparison = compareWaitForBetterOffer(REVERB_DEFAULTS);
  assert.equal(Number(comparison.takeOfferNow.profit.toFixed(3)), 208.149);
  assert.equal(Number(comparison.eventualList.profit.toFixed(3)), 281.597);
  assert.equal(Number(comparison.eventualFallback.profit.toFixed(3)), 171.426);
  assert.equal(Number(comparison.expectedWaitProfit.toFixed(4)), 204.4771);
  assert.equal(Number(comparison.vsWaiting.toFixed(2)), 3.67);
  assert.equal(comparison.waitingWins, false);
  assert.equal(comparison.winner, 'takeNow');
  assert.equal(Number(comparison.breakEvenProbPct.toFixed(2)), 33.33);
});

test('waiting wins once the typed probability clears the break-even chance', () => {
  const base = compareWaitForBetterOffer(REVERB_DEFAULTS);
  const above = compareWaitForBetterOffer({ ...REVERB_DEFAULTS, waitProbListPct: base.breakEvenProbPct + 5 });
  const below = compareWaitForBetterOffer({ ...REVERB_DEFAULTS, waitProbListPct: base.breakEvenProbPct - 5 });
  assert.equal(above.waitingWins, true);
  assert.equal(above.winner, 'wait');
  assert.equal(below.waitingWins, false);
  assert.equal(below.winner, 'takeNow');
});

test('the fallback price defaults to the offer price when not typed', () => {
  const comparison = compareWaitForBetterOffer({ ...REVERB_DEFAULTS, waitFallbackPrice: undefined });
  assert.equal(comparison.fallbackPrice, REVERB_DEFAULTS.offerPrice);
  assert.equal(comparison.eventualFallback.profit, comparison.takeOfferNow.profit);
});

test('breakEvenProbPct is null when list and the fallback pay the same, since no probability can move the answer', () => {
  const comparison = compareWaitForBetterOffer({ ...REVERB_DEFAULTS, waitFallbackPrice: REVERB_DEFAULTS.price });
  assert.equal(comparison.breakEvenProbPct, null);
});

test('rejects a chance of reaching list above 100%', () => {
  assert.throws(() => compareWaitForBetterOffer({ ...REVERB_DEFAULTS, waitProbListPct: 101 }), /at most 100/);
});

test('waitForBetterOfferNote states which side wins, the crossover chance, and gives no advice', () => {
  const note = waitForBetterOfferNote(compareWaitForBetterOffer(REVERB_DEFAULTS));
  assert.match(note, /30\.00% chance/);
  assert.match(note, /\$680\.00/);
  assert.match(note, /\$720\.00 offer now still leaves \$3\.67 more/);
  assert.match(note, /break-even chance of eventually reaching list is 33\.33%/);
  assert.doesNotMatch(note, /you should|we recommend/i);
});

test('waitForBetterOfferNote flips its lead sentence when waiting wins', () => {
  const comparison = compareWaitForBetterOffer({ ...REVERB_DEFAULTS, waitProbListPct: 90 });
  const note = waitForBetterOfferNote(comparison);
  assert.match(note, /waiting leaves \$[\d.]+ more in expectation than taking the \$720\.00 offer now/);
});

test('waitForBetterOfferNote names an always-wins edge without a false crossover', () => {
  // A fallback above list-price profit makes waiting win regardless of the
  // odds of reaching list — even a 0% chance still beats the offer, since
  // the guaranteed fallback alone already does.
  const comparison = compareWaitForBetterOffer({
    ...REVERB_DEFAULTS,
    waitProbListPct: 0,
    waitFallbackPrice: REVERB_DEFAULTS.price,
    price: 900,
  });
  assert.ok(comparison.breakEvenProbPct <= 0 || comparison.breakEvenProbPct === null);
  const note = waitForBetterOfferNote(comparison);
  assert.match(note, /Even a 0% chance of reaching list still beats the offer/);
});
