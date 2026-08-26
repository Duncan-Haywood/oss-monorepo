import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, calculatePriceScenarios, calculateRepricingTable, compareListingFormat, listingFormatNote, comparePartialRefund, partialRefundNote, DEFAULT_PARTIAL_REFUND, DEFAULT_MONTHLY_CASES, compareAuthenticity, authenticityNote, DEFAULT_AUTHENTICITY_FEE_RATE, DEFAULT_AUTHENTICITY_EXTRA_SHIP, DEFAULT_WITHOUT_AG_SELL_THROUGH, DEFAULT_AUTHENTICITY_SELL_THROUGH, DEFAULT_AUTHENTICITY_RETURN_RATE, DEFAULT_MONTHLY_AG_LISTINGS, compareLocalPickup, localPickupNote, DEFAULT_SHIP_SELL_THROUGH, DEFAULT_PICKUP_SELL_THROUGH, DEFAULT_PICKUP_NO_SHOW, DEFAULT_PICKUP_MINUTES, DEFAULT_PICKUP_HOURLY_WAGE, DEFAULT_MONTHLY_PICKUP_LISTINGS, compareLotVsSingles, lotVsSinglesNote, DEFAULT_LOT_PIECE_COUNT, DEFAULT_SINGLE_EXPECTED_PRICE, DEFAULT_LOT_SELL_THROUGH, DEFAULT_SINGLE_SELL_THROUGH, DEFAULT_SINGLE_INSERTION_FEE, DEFAULT_MONTHLY_LOT_DECISIONS, compareStandardEnvelope, standardEnvelopeNote, DEFAULT_ENVELOPE_SHIPPING_COST, DEFAULT_ENVELOPE_PACKAGING_COST, DEFAULT_ENVELOPE_CLAIM_RATE, DEFAULT_ENVELOPE_FEE_REFUND_ON_CLAIM, DEFAULT_TRACKED_SELL_THROUGH, DEFAULT_ENVELOPE_SELL_THROUGH, DEFAULT_MONTHLY_ENVELOPE_LISTINGS, compareCombinedShipping, combinedShippingNote, DEFAULT_COMBINED_ITEM_COUNT, DEFAULT_COMBINED_SHIPPING_CHARGED, DEFAULT_COMBINED_SHIPPING_COST, DEFAULT_COMBINED_PACKAGING_COST, DEFAULT_COMBINED_RETURN_SHIPPING_COST, DEFAULT_COMBINED_FIXED_FEE, DEFAULT_MONTHLY_COMBINED_ORDERS, compareSellerInitiatedOffer, sellerInitiatedOfferNote, DEFAULT_OFFER_PERCENT, DEFAULT_WAIT_SELL_THROUGH, DEFAULT_OFFER_ACCEPT, DEFAULT_MONTHLY_OFFERS, comparePromotedOffsite, promotedOffsiteNote, DEFAULT_OFFSITE_SPEND, DEFAULT_OFFSITE_EXTRA_ORDERS, DEFAULT_MONTHLY_OFFSITE_CAMPAIGNS, compareQuantityDiscount, quantityDiscountNote, DEFAULT_QTY_DISCOUNT_UNITS, DEFAULT_QTY_DISCOUNT_PERCENT, DEFAULT_QTY_SHIPPING_CHARGED, DEFAULT_QTY_SHIPPING_COST, DEFAULT_QTY_PACKAGING_COST, DEFAULT_QTY_RETURN_SHIPPING_COST, DEFAULT_QTY_FIXED_FEE, DEFAULT_SINGLES_SELL_THROUGH, DEFAULT_QTY_TAKE_PCT, DEFAULT_MONTHLY_QTY_ORDERS, compareSellerCoupon, sellerCouponNote, DEFAULT_COUPON_PERCENT, DEFAULT_COUPON_REDEEM_PCT, DEFAULT_LISTED_SELL_THROUGH, DEFAULT_COUPON_SELL_THROUGH, DEFAULT_DROP_SELL_THROUGH, DEFAULT_MONTHLY_COUPON_LISTINGS, compareImmediatePayment, immediatePaymentNote, DEFAULT_UNPAID_RATE, DEFAULT_LATER_SELL_THROUGH, DEFAULT_IMMEDIATE_SELL_THROUGH, DEFAULT_UNPAID_RELIST_FEE, DEFAULT_UNPAID_MINUTES, DEFAULT_UNPAID_HOURLY_WAGE, DEFAULT_MONTHLY_IMMEDIATE_LISTINGS, compareGlobalShipping, globalShippingNote, DEFAULT_GSP_RETURN_RATE, DEFAULT_GSP_SELL_THROUGH, DEFAULT_SELF_SHIP_SHIPPING_CHARGED, DEFAULT_SELF_SHIP_SHIPPING_COST, DEFAULT_SELF_SHIP_RETURN_SHIPPING_COST, DEFAULT_SELF_SHIP_INTL_FEE_RATE, DEFAULT_SELF_SHIP_RETURN_RATE, DEFAULT_SELF_SHIP_CLAIM_RATE, DEFAULT_SELF_SHIP_SELL_THROUGH, DEFAULT_MONTHLY_GSP_LISTINGS } from './calc.mjs';

const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} vs ${expected}`);

test('computes fees, profit, margin and ROI for a typical resale order', () => {
  // $40 item + $6 shipping = $46 revenue. FVF 13.25% = 6.095, fixed 0.30,
  // no promoted/intl. Cash invested: $12 goods + $5 label + $1 packaging = $18.
  const r = calculateOrder({
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1,
  });
  near(r.revenue, 46, 'revenue');
  near(r.fees.finalValue, 6.095, 'final value fee');
  near(r.feeTotal, 6.395, 'fee total');
  near(r.cashInvested, 18, 'cash invested');
  near(r.profit, 46 - 6.395 - 18, 'profit');
  near(r.margin, (46 - 6.395 - 18) / 46 * 100, 'margin');
  near(r.roi, (46 - 6.395 - 18) / 18 * 100, 'roi');
});

test('applies promoted-listings and international rates on the full order total', () => {
  const r = calculateOrder({ price: 100, shippingCharged: 0, finalValueRate: 13.25, promotedRate: 5, intlFeeRate: 1.65, fixedFee: 0.3 });
  near(r.fees.promoted, 5, 'promoted fee');
  near(r.fees.international, 1.65, 'international fee');
  near(r.feeTotal, 13.25 + 5 + 1.65 + 0.3, 'fee total with all percentage fees');
});

test('break-even price makes profit exactly zero', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 12, shippingCost: 5, packagingCost: 1 };
  const r = calculateOrder(input);
  const atBreakEven = calculateOrder({ ...input, price: r.breakEvenPrice });
  near(atBreakEven.profit, 0, 'profit at break-even');
});

test('calculates the item price required for a target net margin', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 12, shippingCost: 5, packagingCost: 1, targetMargin: 20 };
  const r = calculateOrder(input);
  const atTarget = calculateOrder({ ...input, price: r.targetMarginPrice });
  near(atTarget.margin, 20, 'margin at target price');
  near(r.targetMarginPrice, 18.3 / 0.6675 - 6, 'target margin price');
});

test('reports an unreachable target margin when fees leave no margin room', () => {
  const r = calculateOrder({ price: 10, finalValueRate: 80, targetMargin: 20 });
  assert.equal(r.targetMarginPrice, Infinity);
});

test('ROI is null when no cash was invested', () => {
  const r = calculateOrder({ price: 20, shippingCharged: 0, costOfGoods: 0, shippingCost: 0, packagingCost: 0, otherCost: 0 });
  assert.equal(r.roi, null);
});

test('margin is zero rather than NaN when revenue is zero', () => {
  const r = calculateOrder({ price: 0, shippingCharged: 0 });
  assert.equal(r.margin, 0);
});

test('applies documented defaults when rates are omitted', () => {
  const r = calculateOrder({ price: 50 });
  near(r.fees.finalValue, 50 * 0.1325, 'default final value fee');
  near(r.fees.fixed, 0.3, 'default fixed fee');
});

test('scales batch economics while keeping price thresholds per unit', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 12, shippingCost: 5, packagingCost: 1 };
  const single = calculateOrder(input);
  const batch = calculateOrder({ ...input, quantity: 3 });
  near(batch.revenue, single.revenue * 3, 'batch revenue');
  near(batch.feeTotal, single.feeTotal * 3, 'batch fees');
  near(batch.cashInvested, single.cashInvested * 3, 'batch investment');
  near(batch.profit, single.profit * 3, 'batch profit');
  near(batch.unitProfit, single.profit, 'unit profit');
  near(batch.breakEvenPrice, single.breakEvenPrice, 'per-unit break-even');
});

test('rejects fractional or zero batch quantities', () => {
  assert.throws(() => calculateOrder({ price: 10, quantity: 0 }), /whole number/);
  assert.throws(() => calculateOrder({ price: 10, quantity: 1.5 }), /whole number/);
});

test('rejects negative and non-numeric inputs', () => {
  assert.throws(() => calculateOrder({ price: -1 }), /Item price/);
  assert.throws(() => calculateOrder({ price: 'abc' }), /Item price/);
  assert.throws(() => calculateOrder({ price: 10, costOfGoods: -5 }), /Cost of goods/);
  assert.throws(() => calculateOrder({ price: 10, targetMargin: 100 }), /less than 100/);
});

test('compares profit at multiple listing prices using the same assumptions', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 12, shippingCost: 5, packagingCost: 1 };
  const scenarios = calculatePriceScenarios(input, [30, 40, 50]);
  assert.deepEqual(scenarios.map(scenario => scenario.price), [30, 40, 50]);
  near(scenarios[1].profit, calculateOrder(input).profit, 'current price profit');
  assert.ok(scenarios[0].profit < scenarios[1].profit);
  assert.ok(scenarios[1].profit < scenarios[2].profit);
  assert.throws(() => calculatePriceScenarios(input, []), /scenario price/);
});

test('builds a repricing table around the seller\'s current price', () => {
  const input = { price: 40, shippingCharged: 6, costOfGoods: 12, shippingCost: 5, packagingCost: 1 };
  const rows = calculateRepricingTable(input);
  assert.equal(rows.length, 5, 'default offsets');
  assert.deepEqual(rows.map(row => row.price), [32, 36, 40, 44, 48], 'prices rounded to whole cents');
  assert.deepEqual(rows.map(row => row.isCurrent), [false, false, true, false, false], 'only the 0% row is current');
  // Every row is the same arithmetic as the headline result, so the table can
  // never disagree with the number the seller is already looking at.
  near(rows[2].profit, calculateOrder(input).profit, 'current row matches the headline order');
  near(rows[2].profitDelta, 0, 'no change against itself');
  assert.ok(rows[0].profitDelta < 0 && rows[4].profitDelta > 0, 'deltas are signed against the current price');
  assert.ok(rows[4].profit > rows[3].profit && rows[1].profit > rows[0].profit, 'profit rises with price');
  // Percentage fees take a cut of every extra dollar, so listing $8 higher must
  // leave the seller less than $8 better off.
  assert.ok(rows[4].profitDelta < 8, 'fees eat part of a price rise');
});

test('rounds repricing scenarios to cents a seller can actually list', () => {
  const rows = calculateRepricingTable({ price: 19.99 }, [-15, 0, 15]);
  assert.deepEqual(rows.map(row => row.price), [16.99, 19.99, 22.99]);
});

test('carries batch quantity and every other assumption into each scenario', () => {
  const input = { price: 40, shippingCharged: 6, costOfGoods: 12, quantity: 4, promotedRate: 2 };
  const rows = calculateRepricingTable(input, [10]);
  const direct = calculateOrder({ ...input, price: 44 });
  near(rows[0].profit, direct.profit, 'batch profit');
  near(rows[0].unitProfit, direct.unitProfit, 'unit profit');
  assert.equal(rows[0].quantity, 4, 'quantity preserved');
});

test('rejects repricing offsets that cannot produce a listable price', () => {
  assert.throws(() => calculateRepricingTable({ price: 40 }, []), /At least one price offset/);
  assert.throws(() => calculateRepricingTable({ price: 40 }, [-100]), /greater than -100/);
  assert.throws(() => calculateRepricingTable({ price: 40 }, ['abc']), /greater than -100/);
  assert.throws(() => calculateRepricingTable({ price: -1 }, [0]), /Item price/);
});

test('expected profit equals completed-sale profit when no orders come back', () => {
  const r = calculateOrder({
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1,
  });
  near(r.expectedProfit, r.profit, 'zero return rate leaves completed-sale profit');
  near(r.expectedProfitDelta, 0, 'no expected-profit change');
  near(r.returnProfit, -(5 + 1), 'one return still eats the outbound label and packaging');
  near(r.cashEatenPerReturn, 6, 'cash eaten per returned unit');
});

test('blends completed-sale profit with the cash a return still eats', () => {
  // Completed sale on the documented $40 order is $21.605. A return that
  // refunds every fee still eats the $5 label, $1 packaging, and $7 return
  // postage — $13 — so a 10% return rate is 0.9 * 21.605 + 0.1 * -13.
  const r = calculateOrder({
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1,
    returnRatePercent: 10, returnShippingCost: 7, feeRefundOnReturnPercent: 100,
  });
  near(r.profit, 21.605, 'completed-sale profit is unchanged');
  near(r.returnProfit, -13, 'return profit');
  near(r.expectedProfit, 0.9 * 21.605 + 0.1 * -13, 'expected profit');
  near(r.expectedProfitDelta, r.expectedProfit - r.profit, 'delta vs completed sale');
  near(r.expectedRevenue, 46 * 0.9, 'expected revenue after refunds');
  near(r.cashEatenPerReturn, 13, 'cash eaten per return');
  near(r.breakEvenReturnRate, 21.605 / (21.605 - -13) * 100, 'break-even return rate');
});

test('unrefunded fees stay in the return loss', () => {
  const r = calculateOrder({
    price: 100, shippingCharged: 0, finalValueRate: 10, fixedFee: 0.4,
    shippingCost: 0, packagingCost: 0, otherCost: 0,
    returnRatePercent: 100, returnShippingCost: 0, feeRefundOnReturnPercent: 0,
  });
  near(r.feeTotal, 10.4, 'fees on the completed sale');
  near(r.returnProfit, -10.4, 'all fees stay with the seller');
  near(r.expectedProfit, -10.4, 'every order comes back');
});

test('break-even return rate is zero when the completed sale already loses', () => {
  const r = calculateOrder({
    price: 10, shippingCharged: 0, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 20, shippingCost: 5,
  });
  assert.ok(r.profit < 0, 'losing sale');
  assert.equal(r.breakEvenReturnRate, 0);
});

test('rejects a return rate or fee-refund rate above 100%', () => {
  assert.throws(() => calculateOrder({ price: 10, returnRatePercent: 101 }), /at most 100/);
  assert.throws(() => calculateOrder({ price: 10, feeRefundOnReturnPercent: 101 }), /at most 100/);
});

test('carries expected return profit into each repricing row', () => {
  const input = {
    price: 40, shippingCharged: 6, costOfGoods: 12, shippingCost: 5, packagingCost: 1,
    returnRatePercent: 20, returnShippingCost: 4,
  };
  const rows = calculateRepricingTable(input, [0, 10]);
  const current = calculateOrder(input);
  const higher = calculateOrder({ ...input, price: 44 });
  near(rows[0].expectedProfit, current.expectedProfit, 'current expected profit');
  near(rows[1].expectedProfit, higher.expectedProfit, 'repriced expected profit');
  assert.ok(rows[1].expectedProfit > rows[0].expectedProfit, 'a higher price still helps after returns');
});

const formatBase = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1,
};

test('compares auction vs Buy It Now after sell-through and insertion', () => {
  const comparison = compareListingFormat({
    ...formatBase,
    auctionExpectedClose: 36,
    binSellThroughPct: 50,
    auctionSellThroughPct: 90,
    binDaysToSell: 21,
    auctionDays: 7,
  });
  const binSold = calculateOrder(formatBase);
  const auctionSold = calculateOrder({ ...formatBase, price: 36, promotedRate: 0 });
  near(comparison.bin.soldExpectedProfit, binSold.expectedProfit, 'BIN completed-sale expected');
  near(comparison.auction.soldExpectedProfit, auctionSold.expectedProfit, 'auction completed-sale expected');
  near(comparison.bin.expectedProfit, binSold.expectedProfit * 0.5, 'BIN listing expected');
  near(comparison.auction.expectedProfit, auctionSold.expectedProfit * 0.9, 'auction listing expected');
  near(comparison.bin.expectedProfitPerDay, comparison.bin.expectedProfit / 21, 'BIN per day');
  near(comparison.auction.expectedProfitPerDay, comparison.auction.expectedProfit / 7, 'auction per day');
  assert.equal(comparison.winner, 'auction');
  assert.ok(comparison.auction.soldExpectedProfit < comparison.bin.soldExpectedProfit, 'auction sale itself is cheaper');
  assert.ok(comparison.auction.expectedProfit > comparison.bin.expectedProfit, 'sell-through still makes auction win');
});

test('defaults a 90% hammer and the usual sell-through / duration pair', () => {
  const comparison = compareListingFormat(formatBase);
  near(comparison.auction.price, 36, 'default hammer is 90% of BIN');
  assert.equal(comparison.bin.sellThroughPct, 50);
  assert.equal(comparison.auction.sellThroughPct, 90);
  assert.equal(comparison.bin.days, 21);
  assert.equal(comparison.auction.days, 7);
});

test('subtracts insertion fees that are sunk whether the listing sells', () => {
  const comparison = compareListingFormat({
    ...formatBase,
    auctionExpectedClose: 36,
    binInsertionFee: 0.35,
    auctionInsertionFee: 0.35,
  });
  const without = compareListingFormat({ ...formatBase, auctionExpectedClose: 36 });
  near(comparison.bin.expectedProfit, without.bin.expectedProfit - 0.35, 'BIN insertion');
  near(comparison.auction.expectedProfit, without.auction.expectedProfit - 0.35, 'auction insertion');
});

test('keeps Promoted Listings Standard on Buy It Now only', () => {
  const comparison = compareListingFormat({
    ...formatBase,
    promotedRate: 5,
    auctionExpectedClose: 36,
    auctionPromotedRate: 0,
  });
  const binPromoted = calculateOrder({ ...formatBase, promotedRate: 5 });
  const auctionPlain = calculateOrder({ ...formatBase, price: 36, promotedRate: 0 });
  near(comparison.bin.soldFees, binPromoted.feeTotal, 'BIN carries promoted');
  near(comparison.auction.soldFees, auctionPlain.feeTotal, 'auction omits BIN promoted');
});

test('break-even auction close matches Buy It Now expected profit', () => {
  const comparison = compareListingFormat({
    ...formatBase,
    auctionExpectedClose: 36,
    binSellThroughPct: 50,
    auctionSellThroughPct: 90,
  });
  const atBreakEven = compareListingFormat({
    ...formatBase,
    auctionExpectedClose: comparison.breakEvenAuctionClose,
    binSellThroughPct: 50,
    auctionSellThroughPct: 90,
  });
  near(atBreakEven.auction.expectedProfit, atBreakEven.bin.expectedProfit, 'hammer matches BIN expected');
  assert.ok(comparison.breakEvenAuctionClose < 36, 'matching hammer is below the 90% default');
});

test('carries the typed return rate into both listing formats', () => {
  const input = { ...formatBase, returnRatePercent: 10, returnShippingCost: 7 };
  const comparison = compareListingFormat({ ...input, auctionExpectedClose: 36 });
  const binSold = calculateOrder(input);
  near(comparison.bin.soldExpectedProfit, binSold.expectedProfit, 'BIN after returns');
  assert.ok(comparison.bin.soldExpectedProfit < comparison.bin.soldProfit, 'returns reduce the sale that sell-through scales');
});

test('listing-format note names the winner without telling the seller what to do', () => {
  const comparison = compareListingFormat({ ...formatBase, auctionExpectedClose: 36 });
  const note = listingFormatNote(comparison);
  assert.match(note, /Auction at \$36\.00/);
  assert.match(note, /Buy It Now at \$40\.00/);
  assert.match(note, /hammer is about/);
  assert.doesNotMatch(note, /should list|must list|list as/i);
});

test('rejects sell-through above 100% and non-positive listing days', () => {
  assert.throws(() => compareListingFormat({ ...formatBase, binSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareListingFormat({ ...formatBase, auctionDays: 0 }), /greater than zero/);
  assert.throws(() => compareListingFormat({ price: -1 }), /Item price/);
});

const caseBase = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1, returnShippingCost: 5,
  feeRefundOnReturnPercent: 100,
};

test('compares a partial refund against taking the return on the default case', () => {
  // Completed sale: $46 revenue, $6.395 fees, $18 invested → $21.605 profit.
  // Return: fees come back, item comes back, $5+$1+$5 postage stays → −$11.
  // $15 partial: $15 out, $1.9875 FVF back → $21.605 − $15 + $1.9875 = $8.5925.
  const sold = calculateOrder(caseBase);
  const comparison = comparePartialRefund(caseBase);
  near(sold.profit, 21.605, 'completed profit');
  near(sold.returnProfit, -11, 'return profit');
  assert.equal(comparison.partialRefund, DEFAULT_PARTIAL_REFUND);
  assert.equal(comparison.monthlyCases, DEFAULT_MONTHLY_CASES);
  near(comparison.partial.feeReturned, 15 * 0.1325, 'FVF returned on the concession');
  near(comparison.partial.kept, 21.605 - 15 + 15 * 0.1325, 'partial keep');
  near(comparison.takeReturn.kept, -11, 'take-the-return keep');
  near(comparison.keepItemFull.kept, 21.605 - 46 + 46 * 0.1325, 'full refund they keep');
  near(comparison.extraKeptOnPartial, comparison.partial.kept - comparison.takeReturn.kept, 'gap vs return');
  near(comparison.monthlyExtraOnPartial, comparison.extraKeptOnPartial * 4, 'four cases');
  assert.equal(comparison.winner, 'partial');
  assert.ok(comparison.partial.kept > comparison.takeReturn.kept, 'partial beats a real return');
  assert.ok(comparison.takeReturn.kept > comparison.keepItemFull.kept, 'getting the item back beats a full no-return refund');
});

test('break-even partial matches taking the return', () => {
  const comparison = comparePartialRefund(caseBase);
  const atCeiling = comparePartialRefund({ ...caseBase, partialRefundAmount: comparison.breakEvenPartial });
  near(atCeiling.partial.kept, atCeiling.takeReturn.kept, 'ceiling partial ties the return');
  assert.ok(comparison.breakEvenPartial > 15, 'default $15 is under the ceiling');
  near(comparison.breakEvenPartial, (21.605 - (-11)) / (1 - 0.1325), 'closed-form ceiling');
});

test('a partial above the ceiling makes taking the return win', () => {
  const comparison = comparePartialRefund({ ...caseBase, partialRefundAmount: 45 });
  assert.equal(comparison.winner, 'return');
  assert.ok(comparison.takeReturn.kept > comparison.partial.kept, 'return beats a $45 concession');
});

test('full refund they keep loses the sourcing cost that a return recovers', () => {
  const comparison = comparePartialRefund({ ...caseBase, partialRefundAmount: 15 });
  // Fixed fee stays on a completed-order refund; percentage fees come back.
  near(comparison.keepItemFull.kept, -0.3 - 18, 'fixed fee plus sunk COGS/postage');
  assert.equal(comparison.keepItemFull.itemRecovered, false);
  assert.equal(comparison.takeReturn.itemRecovered, true);
});

test('promoted-listings fee comes back only on the refunded amount', () => {
  const comparison = comparePartialRefund({ ...caseBase, promotedRate: 5, partialRefundAmount: 10 });
  const sold = calculateOrder({ ...caseBase, promotedRate: 5 });
  near(comparison.partial.feeReturned, 10 * (0.1325 + 0.05), 'FVF + promoted on $10');
  near(comparison.partial.kept, sold.profit - 10 + 10 * 0.1825, 'keep after promoted-aware concession');
});

test('unrefunded fees stay on a partial the same way they stay on a return', () => {
  const comparison = comparePartialRefund({
    ...caseBase,
    feeRefundOnReturnPercent: 0,
    partialRefundAmount: 15,
  });
  near(comparison.partial.feeReturned, 0, 'no fee comes back');
  near(comparison.partial.kept, 21.605 - 15, 'concession with fees kept');
});

test('partial-refund note names the figures without telling the seller what to do', () => {
  const comparison = comparePartialRefund(caseBase);
  const note = partialRefundNote(comparison);
  assert.match(note, /\$15\.00 partial refund/);
  assert.match(note, /taking the return at -\$11\.00/);
  assert.match(note, /partial exceeds about/);
  assert.doesNotMatch(note, /should offer|must refund|refuse the case/i);
});

test('rejects a partial larger than the order and a missing comparison', () => {
  assert.throws(() => comparePartialRefund({ ...caseBase, partialRefundAmount: 46.01 }), /cannot exceed the order total/);
  assert.throws(() => comparePartialRefund({ ...caseBase, partialRefundAmount: -1 }), /Partial refund/);
  assert.throws(() => partialRefundNote({}), /missing rows/);
});

const agBase = {
  ...caseBase,
  returnRatePercent: 10,
};

test('compares Authenticity Guarantee against skip-AG on the default listing', () => {
  // Completed sale $21.605; return −$11; 10% mix → $18.3445 expected.
  // Skip-AG at 55% sell-through → $10.089475.
  // AG: $1.20 fee + $8 hub label. Completed $12.405; return −$19;
  // 4% mix → $11.1488; 80% sell-through → $8.91904. Skip-AG is ahead.
  const comparison = compareAuthenticity(agBase);
  assert.equal(comparison.authenticityFeeRate, DEFAULT_AUTHENTICITY_FEE_RATE);
  assert.equal(comparison.authenticityExtraShip, DEFAULT_AUTHENTICITY_EXTRA_SHIP);
  assert.equal(comparison.skip.sellThroughPct, DEFAULT_WITHOUT_AG_SELL_THROUGH);
  assert.equal(comparison.authenticity.sellThroughPct, DEFAULT_AUTHENTICITY_SELL_THROUGH);
  assert.equal(comparison.authenticity.returnRatePercent, DEFAULT_AUTHENTICITY_RETURN_RATE);
  assert.equal(comparison.monthlyListings, DEFAULT_MONTHLY_AG_LISTINGS);
  near(comparison.authenticityFee, 1.2, '3% of $40');
  near(comparison.skip.soldExpectedProfit, 18.3445, 'skip-AG completed expected');
  near(comparison.skip.expectedProfit, 18.3445 * 0.55, 'skip-AG listing expected');
  near(comparison.authenticity.completedProfit, 21.605 - 1.2 - 8, 'AG completed');
  near(comparison.authenticity.soldExpectedProfit, 0.96 * 12.405 + 0.04 * -19, 'AG completed expected');
  near(comparison.authenticity.expectedProfit, 11.1488 * 0.80, 'AG listing expected');
  assert.equal(comparison.winner, 'skip');
  near(comparison.extraKeptOnAuthenticity, 8.91904 - 10.089475, 'AG vs skip');
  near(comparison.monthlyExtraOnAuthenticity, (8.91904 - 10.089475) * 8, 'eight listings');
});

test('break-even extra hub shipping matches skip-AG expected profit', () => {
  const comparison = compareAuthenticity(agBase);
  const atCeiling = compareAuthenticity({ ...agBase, authenticityExtraShip: comparison.breakEvenExtraShip });
  near(atCeiling.authenticity.expectedProfit, atCeiling.skip.expectedProfit, 'ceiling hub ship ties skip-AG');
  assert.ok(comparison.breakEvenExtraShip < 8, 'default $8 is above the ceiling');
  near(comparison.breakEvenExtraShip, 6.53695625, 'closed-form hub-ship ceiling');
  assert.ok(comparison.breakEvenAuthenticityFee < 0, 'no non-negative fee matches with an $8 hub label');
});

test('a prepaid hub label flips Authenticity ahead on the same 3% fee', () => {
  const comparison = compareAuthenticity({ ...agBase, authenticityExtraShip: 0 });
  assert.equal(comparison.winner, 'authenticity');
  near(comparison.authenticity.completedProfit, 21.605 - 1.2, 'AG completed without extra ship');
  near(comparison.authenticity.soldExpectedProfit, 0.96 * 20.405 + 0.04 * -11, 'AG expected without extra ship');
  near(comparison.authenticity.expectedProfit, 19.1488 * 0.80, 'AG listing without extra ship');
  near(comparison.extraKeptOnAuthenticity, 15.31904 - 10.089475, 'prepaid-label gap');
});

test('a high without-AG authenticity-claim rate can flip the table', () => {
  const comparison = compareAuthenticity({ ...agBase, returnRatePercent: 25 });
  assert.equal(comparison.winner, 'authenticity');
  near(comparison.skip.soldExpectedProfit, 0.75 * 21.605 + 0.25 * -11, '25% mix');
  near(comparison.skip.expectedProfit, 13.45375 * 0.55, 'skip-AG at 25% returns');
  assert.ok(comparison.authenticity.expectedProfit > comparison.skip.expectedProfit, 'AG beats fake-claim bleed');
});

test('authenticity note names the figures without telling the seller what to do', () => {
  const comparison = compareAuthenticity(agBase);
  const note = authenticityNote(comparison);
  assert.match(note, /Skip Authenticity Guarantee at 55%/);
  assert.match(note, /3% authenticity fee/);
  assert.match(note, /\$8\.00 extra hub shipping/);
  assert.match(note, /Extra hub shipping has to be about/);
  assert.doesNotMatch(note, /should enroll|must use|list with authenticity/i);
});

test('rejects a missing price, a return rate above 100%, and a missing comparison', () => {
  assert.throws(() => compareAuthenticity({ ...agBase, authenticityReturnRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareAuthenticity({ price: -1 }), /Item price/);
  assert.throws(() => authenticityNote({}), /missing rows/);
});

test('compares local pickup against shipping on the default listing', () => {
  // Completed sale $21.605; return −$11; 10% mix → $18.3445 expected.
  // Ship at 70% sell-through → $12.84115.
  // Pickup: $0 label, $0 pack, 2% returns → completed $22.40, expected $21.952.
  // 20% no-show and $7.50 meetup: per-commit $10.0616; 35% sell-through → $3.52156.
  const comparison = compareLocalPickup(agBase);
  assert.equal(comparison.ship.sellThroughPct, DEFAULT_SHIP_SELL_THROUGH);
  assert.equal(comparison.pickup.sellThroughPct, DEFAULT_PICKUP_SELL_THROUGH);
  assert.equal(comparison.pickup.noShowPct, DEFAULT_PICKUP_NO_SHOW);
  assert.equal(comparison.timeCost, DEFAULT_PICKUP_MINUTES / 60 * DEFAULT_PICKUP_HOURLY_WAGE);
  assert.equal(comparison.monthlyListings, DEFAULT_MONTHLY_PICKUP_LISTINGS);
  near(comparison.ship.soldExpectedProfit, 18.3445, 'ship completed expected');
  near(comparison.ship.expectedProfit, 18.3445 * 0.70, 'ship listing expected');
  near(comparison.pickup.completedProfit, 22.4, 'pickup completed');
  near(comparison.pickup.soldExpectedProfit, 0.98 * 22.4, 'pickup completed expected');
  near(comparison.pickup.expectedProfit, (0.80 * 21.952 - 7.5) * 0.35, 'pickup listing expected');
  assert.equal(comparison.winner, 'ship');
  near(comparison.extraKeptOnPickup, 3.52156 - 12.84115, 'pickup vs ship');
  near(comparison.monthlyExtraOnPickup, (3.52156 - 12.84115) * 8, 'eight listings');
  near(comparison.breakEvenShippingCost, 18.3137, 'label that ties pickup');
  assert.equal(comparison.breakEvenPickupSellThrough, Infinity);
  assert.equal(comparison.breakEvenNoShow, Infinity);
});

test('break-even outbound label matches pickup expected profit', () => {
  const comparison = compareLocalPickup(agBase);
  const atCeiling = compareLocalPickup({ ...agBase, shippingCost: comparison.breakEvenShippingCost });
  near(atCeiling.ship.expectedProfit, atCeiling.pickup.expectedProfit, 'ceiling label ties pickup');
  assert.ok(comparison.breakEvenShippingCost > 5, 'default $5 label is below the ceiling');
});

test('a freight label flips local pickup ahead on the same $40 SKU', () => {
  const comparison = compareLocalPickup({ ...agBase, shippingCost: 40 });
  assert.equal(comparison.winner, 'pickup');
  near(comparison.ship.expectedProfit, -11.65885, '$40 label listing expected');
  near(comparison.pickup.expectedProfit, 3.52156, 'pickup unchanged');
  near(comparison.extraKeptOnPickup, 3.52156 - -11.65885, 'freight gap');
});

test('a 90% local sell-through with no no-shows and no meetup time flips pickup', () => {
  const comparison = compareLocalPickup({
    ...agBase,
    pickupSellThroughPct: 90,
    pickupNoShowPct: 0,
    pickupMinutes: 0,
  });
  assert.equal(comparison.winner, 'pickup');
  near(comparison.pickup.expectedProfit, 21.952 * 0.90, 'pickup listing with no friction');
  near(comparison.breakEvenPickupSellThrough, 12.84115 / 21.952 * 100, 'sell-through that ties ship');
});

test('a bulky freight listing keeps more as local pickup', () => {
  const comparison = compareLocalPickup({
    price: 180,
    shippingCharged: 0,
    finalValueRate: 13.25,
    fixedFee: 0.3,
    costOfGoods: 60,
    shippingCost: 85,
    packagingCost: 8,
    returnShippingCost: 45,
    feeRefundOnReturnPercent: 100,
    returnRatePercent: 8,
    pickupSellThroughPct: 50,
  });
  assert.equal(comparison.winner, 'pickup');
  near(comparison.ship.soldExpectedProfit, -8.418, 'freight completed expected');
  near(comparison.ship.expectedProfit, -8.418 * 0.70, 'freight listing expected');
  near(comparison.pickup.soldExpectedProfit, 93.933, 'pickup completed expected');
  near(comparison.pickup.expectedProfit, (0.80 * 93.933 - 7.5) * 0.50, 'pickup listing expected');
  near(comparison.extraKeptOnPickup, 33.8232 - -5.8926, 'bulky gap');
});

test('local-pickup note names the figures without telling the seller what to do', () => {
  const comparison = compareLocalPickup(agBase);
  const note = localPickupNote(comparison);
  assert.match(note, /Shipping at 70%/);
  assert.match(note, /\$6\.00 postage and pack/);
  assert.match(note, /Local pickup at 35%/);
  assert.match(note, /20% no-show/);
  assert.match(note, /\$7\.50 of meetup time/);
  assert.match(note, /outbound label has to be about/);
  assert.doesNotMatch(note, /should offer pickup|must ship|list as local pickup/i);
});

test('rejects a pickup no-show above 100% and a missing comparison', () => {
  assert.throws(() => compareLocalPickup({ ...agBase, pickupNoShowPct: 101 }), /at most 100/);
  assert.throws(() => compareLocalPickup({ price: -1 }), /Item price/);
  assert.throws(() => localPickupNote({}), /missing rows/);
});

test('compares keeping a lot against splitting it into singles', () => {
  // Lot: completed $21.605; return −$11; 10% mix → $18.3445 expected.
  // 80% sell-through minus $2.40 listing time → $12.2756.
  // Single at $14+$5: completed $8.7825; return −$10; 10% mix → $6.90425.
  // 55% sell-through minus $0.35 insertion → $3.4473375 × 5 − $12 time → $5.2366875.
  const comparison = compareLotVsSingles(agBase);
  assert.equal(comparison.pieceCount, DEFAULT_LOT_PIECE_COUNT);
  assert.equal(comparison.singlePrice, DEFAULT_SINGLE_EXPECTED_PRICE);
  assert.equal(comparison.lot.sellThroughPct, DEFAULT_LOT_SELL_THROUGH);
  assert.equal(comparison.singles.sellThroughPct, DEFAULT_SINGLE_SELL_THROUGH);
  assert.equal(comparison.singleInsertion, DEFAULT_SINGLE_INSERTION_FEE);
  assert.equal(comparison.monthlyDecisions, DEFAULT_MONTHLY_LOT_DECISIONS);
  near(comparison.lot.soldExpectedProfit, 18.3445, 'lot completed expected');
  near(comparison.lot.expectedProfit, 18.3445 * 0.80 - 2.4, 'lot listing expected');
  near(comparison.singleCompletedProfit, 8.7825, 'one single completed');
  near(comparison.singles.soldExpectedProfit, 6.90425 * 5, 'five singles if they all sell');
  near(comparison.singles.expectedProfit, (6.90425 * 0.55 - 0.35) * 5 - 12, 'singles listing expected');
  assert.equal(comparison.winner, 'lot');
  near(comparison.extraKeptOnSingles, 5.2366875 - 12.2756, 'singles vs lot');
  near(comparison.monthlyExtraOnSingles, (5.2366875 - 12.2756) * 6, 'six decisions');
  near(comparison.breakEvenSingleSellThrough, 75.39008581670711, 'sell-through that ties the lot');
  near(comparison.breakEvenSinglePrice, 17.278391989054818, 'single price that ties the lot');
});

test('break-even single price and sell-through match the lot', () => {
  const comparison = compareLotVsSingles(agBase);
  const atPrice = compareLotVsSingles({ ...agBase, singleExpectedPrice: comparison.breakEvenSinglePrice });
  near(atPrice.singles.expectedProfit, atPrice.lot.expectedProfit, 'ceiling price ties the lot');
  const atSellThrough = compareLotVsSingles({
    ...agBase,
    singleSellThroughPct: comparison.breakEvenSingleSellThrough,
  });
  near(atSellThrough.singles.expectedProfit, atSellThrough.lot.expectedProfit, 'ceiling sell-through ties the lot');
  assert.ok(comparison.breakEvenSinglePrice > 14, 'default $14 single is below the ceiling');
});

test('a known SKU with store insertion and a cheap label flips splitting ahead', () => {
  const comparison = compareLotVsSingles({
    ...agBase,
    singleExpectedPrice: 18,
    singleSellThroughPct: 85,
    singleInsertionFee: 0,
    singleListingMinutes: 3,
    singleShippingCost: 3,
  });
  assert.equal(comparison.winner, 'singles');
  near(comparison.lot.expectedProfit, 12.2756, 'lot unchanged');
  near(comparison.singles.expectedProfit, 42.3658125, 'known-SKU singles');
  near(comparison.extraKeptOnSingles, 42.3658125 - 12.2756, 'known-SKU gap');
});

test('lot-versus-singles note names the figures without telling the seller what to do', () => {
  const comparison = compareLotVsSingles(agBase);
  const note = lotVsSinglesNote(comparison);
  assert.match(note, /Keeping the lot at 80%/);
  assert.match(note, /\$6\.00 postage and pack/);
  assert.match(note, /\$2\.40 of listing time/);
  assert.match(note, /Splitting into 5 listings at \$14\.00/);
  assert.match(note, /55% sell-through/);
  assert.match(note, /\$12\.00 of listing time/);
  assert.match(note, /Each single has to list at about/);
  assert.doesNotMatch(note, /should split|must keep the lot|break the lot/i);
});

test('rejects a one-piece lot, a sell-through above 100%, and a missing comparison', () => {
  assert.throws(() => compareLotVsSingles({ ...agBase, lotPieceCount: 1 }), /at least 2/);
  assert.throws(() => compareLotVsSingles({ ...agBase, lotPieceCount: 2.5 }), /at least 2/);
  assert.throws(() => compareLotVsSingles({ ...agBase, singleSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareLotVsSingles({ price: -1 }), /Item price/);
  assert.throws(() => lotVsSinglesNote({}), /missing rows/);
});

test('compares Standard Envelope against a tracked label on the default listing', () => {
  // Tracked: completed $21.605, return −$11, 10% mix → $18.3445;
  // 90% sell-through → $16.51005.
  // Envelope: $0.66 + $0.35 pack. Completed $26.595. An 8% INR claim
  // loses $12 + $1.01 and does not restock → −$13.01. Mix → $23.4266;
  // 85% sell-through → $19.91261. Envelope is ahead.
  const comparison = compareStandardEnvelope(agBase);
  assert.equal(comparison.envelopeShip, DEFAULT_ENVELOPE_SHIPPING_COST);
  assert.equal(comparison.envelopePack, DEFAULT_ENVELOPE_PACKAGING_COST);
  assert.equal(comparison.claimRate, DEFAULT_ENVELOPE_CLAIM_RATE);
  assert.equal(comparison.feeRefundOnClaim, DEFAULT_ENVELOPE_FEE_REFUND_ON_CLAIM);
  assert.equal(comparison.tracked.sellThroughPct, DEFAULT_TRACKED_SELL_THROUGH);
  assert.equal(comparison.envelope.sellThroughPct, DEFAULT_ENVELOPE_SELL_THROUGH);
  assert.equal(comparison.monthlyListings, DEFAULT_MONTHLY_ENVELOPE_LISTINGS);
  near(comparison.tracked.soldExpectedProfit, 18.3445, 'tracked completed expected');
  near(comparison.tracked.expectedProfit, 18.3445 * 0.90, 'tracked listing expected');
  near(comparison.envelope.completedProfit, 26.595, 'envelope completed');
  near(comparison.claimProfit, -13.01, 'claim loses COGS and envelope postage');
  near(comparison.envelope.soldExpectedProfit, 23.4266, 'envelope after claims');
  near(comparison.envelope.expectedProfit, 23.4266 * 0.85, 'envelope listing expected');
  near(comparison.extraKeptOnEnvelope, 19.91261 - 16.51005, 'envelope gap');
  near(comparison.monthlyExtraOnEnvelope, (19.91261 - 16.51005) * 40, 'forty listings');
  assert.equal(comparison.winner, 'envelope');
  assert.equal(comparison.tracked.lossKind, 'return');
  assert.equal(comparison.envelope.lossKind, 'claim');
});

test('break-even claim rate and envelope postage match the tracked label', () => {
  const comparison = compareStandardEnvelope(agBase);
  const atClaim = compareStandardEnvelope({
    ...agBase,
    envelopeClaimRatePercent: comparison.breakEvenClaimRate,
  });
  near(atClaim.envelope.expectedProfit, atClaim.tracked.expectedProfit, 'ceiling claim ties tracked');
  const atPostage = compareStandardEnvelope({
    ...agBase,
    envelopeShippingCost: comparison.breakEvenEnvelopePostage,
  });
  near(atPostage.envelope.expectedProfit, atPostage.tracked.expectedProfit, 'ceiling postage ties tracked');
  assert.ok(comparison.breakEvenClaimRate > 8, 'default 8% claims are below the ceiling');
  assert.ok(comparison.breakEvenEnvelopePostage > 0.66, 'default $0.66 postage is below the ceiling');
});

test('a vintage card with high COGS flips the tracked label ahead', () => {
  const comparison = compareStandardEnvelope({
    price: 80,
    shippingCharged: 0,
    finalValueRate: 13.25,
    fixedFee: 0.3,
    costOfGoods: 40,
    shippingCost: 4.25,
    packagingCost: 0.4,
    returnShippingCost: 4.25,
    feeRefundOnReturnPercent: 100,
    returnRatePercent: 2,
  });
  assert.equal(comparison.winner, 'tracked');
  near(comparison.tracked.soldExpectedProfit, 23.783, 'tracked completed expected');
  near(comparison.tracked.expectedProfit, 23.783 * 0.90, 'tracked listing expected');
  near(comparison.envelope.soldExpectedProfit, 22.562, 'envelope after claims');
  near(comparison.envelope.expectedProfit, 22.562 * 0.85, 'envelope listing expected');
  near(comparison.extraKeptOnEnvelope, 19.1777 - 21.4047, 'vintage gap');
  assert.equal(comparison.breakEvenEnvelopePostage, Infinity);
});

test('a 25% claim rate flips the tracked label ahead on the $40 SKU', () => {
  const comparison = compareStandardEnvelope({ ...agBase, envelopeClaimRatePercent: 25 });
  assert.equal(comparison.winner, 'tracked');
  near(comparison.envelope.soldExpectedProfit, 0.75 * 26.595 + 0.25 * -13.01, '25% claim mix');
  assert.ok(comparison.envelope.expectedProfit < comparison.tracked.expectedProfit);
});

test('Standard Envelope note reports both paths without telling the seller which to use', () => {
  const comparison = compareStandardEnvelope(agBase);
  const note = standardEnvelopeNote(comparison);
  assert.match(note, /tracked label at 90%/);
  assert.match(note, /\$6\.00 postage and pack/);
  assert.match(note, /10% return rate/);
  assert.match(note, /Standard Envelope at 85%/);
  assert.match(note, /\$1\.01 postage and pack/);
  assert.match(note, /8% item-not-received claim rate/);
  assert.match(note, /Claims have to stay at about 18\.1%/);
  assert.doesNotMatch(note, /should use the envelope|must buy a label/i);
});

test('rejects a claim rate above 100% and a missing envelope comparison', () => {
  assert.throws(() => compareStandardEnvelope({ ...agBase, envelopeClaimRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareStandardEnvelope({ ...agBase, envelopeSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareStandardEnvelope({ price: -1 }), /Item price/);
  assert.throws(() => standardEnvelopeNote({}), /missing rows/);
});

test('compares combined shipping against two separate labels on the default sales', () => {
  // One listing: completed $21.605, return −$11, 10% mix → $18.3445.
  // Separate ×2 → $36.689 after returns, $12 collected, $12 postage and pack.
  // Combined: $80 + $8, $6.50 + $1.25 pack, $0.30 one checkout. Completed
  // $44.29; return −$14.25; 10% mix → $38.436. Combined is ahead.
  const comparison = compareCombinedShipping(agBase);
  assert.equal(comparison.itemCount, DEFAULT_COMBINED_ITEM_COUNT);
  assert.equal(comparison.combinedCharged, DEFAULT_COMBINED_SHIPPING_CHARGED);
  assert.equal(comparison.combinedShip, DEFAULT_COMBINED_SHIPPING_COST);
  assert.equal(comparison.combinedPack, DEFAULT_COMBINED_PACKAGING_COST);
  assert.equal(comparison.combinedReturnShip, DEFAULT_COMBINED_RETURN_SHIPPING_COST);
  assert.equal(comparison.combinedFixed, DEFAULT_COMBINED_FIXED_FEE);
  assert.equal(comparison.monthlyOrders, DEFAULT_MONTHLY_COMBINED_ORDERS);
  near(comparison.separate.completedProfit, 43.21, 'separate completed');
  near(comparison.separate.expectedProfit, 36.689, 'separate after returns');
  near(comparison.combined.completedProfit, 44.29, 'combined completed');
  near(comparison.combined.expectedProfit, 38.436, 'combined after returns');
  near(comparison.extraKeptOnCombined, 1.747, 'combined gap');
  near(comparison.monthlyExtraOnCombined, 1.747 * 12, 'twelve invoices');
  near(comparison.separate.postageAndPack, 12, 'two labels and packs');
  near(comparison.combined.postageAndPack, 7.75, 'one box');
  assert.equal(comparison.winner, 'combined');
  assert.equal(comparison.separate.shipments, 2);
  assert.equal(comparison.combined.shipments, 1);
});

test('break-even combined charge and postage match separate labels', () => {
  const comparison = compareCombinedShipping(agBase);
  const atCharge = compareCombinedShipping({
    ...agBase,
    combinedShippingCharged: comparison.breakEvenCombinedCharged,
  });
  near(atCharge.combined.expectedProfit, atCharge.separate.expectedProfit, 'ceiling charge ties separate');
  const atPostage = compareCombinedShipping({
    ...agBase,
    combinedShippingCost: comparison.breakEvenCombinedPostage,
  });
  near(atPostage.combined.expectedProfit, atPostage.separate.expectedProfit, 'ceiling postage ties separate');
  assert.ok(comparison.breakEvenCombinedCharged < 8, 'default $8 charged is above the floor');
  assert.ok(comparison.breakEvenCombinedPostage > 6.5, 'default $6.50 postage is below the ceiling');
});

test('a $4 combine-cheap invoice flips separate labels ahead', () => {
  const comparison = compareCombinedShipping({ ...agBase, combinedShippingCharged: 4 });
  assert.equal(comparison.winner, 'separate');
  near(comparison.combined.expectedProfit, 35.313, '$4 combined after returns');
  near(comparison.extraKeptOnCombined, 35.313 - 36.689, 'cheap-combine gap');
});

test('combined-shipping note reports both paths without telling the seller which to use', () => {
  const comparison = compareCombinedShipping(agBase);
  const note = combinedShippingNote(comparison);
  assert.match(note, /Shipping 2 separately/);
  assert.match(note, /\$12\.00 postage/);
  assert.match(note, /\$36\.69/);
  assert.match(note, /Combining into one box/);
  assert.match(note, /\$8\.00/);
  assert.match(note, /\$7\.75 postage and pack/);
  assert.match(note, /\$38\.44/);
  assert.match(note, /\$5\.76/);
  assert.doesNotMatch(note, /should combine|must ship separately/i);
});

test('rejects a one-item combine, a return rate above 100%, and a missing comparison', () => {
  assert.throws(() => compareCombinedShipping({ ...agBase, combinedItemCount: 1 }), /at least 2/);
  assert.throws(() => compareCombinedShipping({ ...agBase, combinedItemCount: 2.5 }), /at least 2/);
  assert.throws(() => compareCombinedShipping({ ...agBase, combinedReturnRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareCombinedShipping({ price: -1 }), /Item price/);
  assert.throws(() => combinedShippingNote({}), /missing rows/);
});

test('compares a 10% seller-initiated offer against waiting on the default listing', () => {
  // Completed sale $21.605; return −$11; 10% mix → $18.3445.
  // Wait at 40% → $7.3378. 10% offer ($36): completed $18.135;
  // expected $15.2215; 55% accept → $8.371825. Offer is ahead.
  const comparison = compareSellerInitiatedOffer(agBase);
  assert.equal(comparison.offerPercent, DEFAULT_OFFER_PERCENT);
  assert.equal(comparison.wait.sellThroughPct, DEFAULT_WAIT_SELL_THROUGH);
  assert.equal(comparison.offer.sellThroughPct, DEFAULT_OFFER_ACCEPT);
  assert.equal(comparison.monthlyOffers, DEFAULT_MONTHLY_OFFERS);
  near(comparison.offer.price, 36, '10% of $40');
  near(comparison.wait.soldExpectedProfit, 18.3445, 'wait packed leftover');
  near(comparison.wait.expectedProfit, 18.3445 * 0.40, 'wait listing expected');
  near(comparison.offer.soldProfit, 18.135, 'offer completed');
  near(comparison.offer.soldExpectedProfit, 15.2215, 'offer packed leftover');
  near(comparison.offer.expectedProfit, 15.2215 * 0.55, 'offer listing expected');
  near(comparison.extraKeptOnOffer, 8.371825 - 7.3378, 'offer vs wait');
  near(comparison.monthlyExtraOnOffer, (8.371825 - 7.3378) * 40, 'forty offers');
  near(comparison.breakEvenAcceptPct, 7.3378 / 15.2215 * 100, 'accept floor');
  assert.equal(comparison.winner, 'offer');
  assert.equal(comparison.offerPays, true);
});

test('break-even accept rate and offer-percent ceiling match waiting', () => {
  const comparison = compareSellerInitiatedOffer(agBase);
  const atAccept = compareSellerInitiatedOffer({
    ...agBase,
    offerAcceptPct: comparison.breakEvenAcceptPct,
  });
  near(atAccept.offer.expectedProfit, atAccept.wait.expectedProfit, 'ceiling accept ties wait');
  const atPercent = compareSellerInitiatedOffer({
    ...agBase,
    offerPercent: comparison.offerPercentCeiling,
  });
  near(atPercent.offer.expectedProfit, atPercent.wait.expectedProfit, 'ceiling percent ties wait');
  assert.ok(comparison.breakEvenAcceptPct < 55, 'default 55% accept is above the floor');
  assert.ok(comparison.offerPercentCeiling > 10, 'default 10% off is below the ceiling');
  near(comparison.offerPriceCeiling, 33.59200069862894, 'price at the typed lift');
});

test('a 20% make-them-take-it offer loses to waiting', () => {
  const comparison = compareSellerInitiatedOffer({ ...agBase, offerPercent: 20 });
  assert.equal(comparison.winner, 'wait');
  near(comparison.offer.price, 32, '20% of $40');
  near(comparison.offer.soldExpectedProfit, 12.0985, '20% packed leftover');
  near(comparison.offer.expectedProfit, 12.0985 * 0.55, '20% listing expected');
  assert.equal(comparison.offerPays, false);
});

test('waiting at 50% sell-through already beats a 10% offer', () => {
  const comparison = compareSellerInitiatedOffer({ ...agBase, waitSellThroughPct: 50 });
  assert.equal(comparison.winner, 'wait');
  near(comparison.wait.expectedProfit, 18.3445 * 0.50, '50% wait');
  near(comparison.offer.expectedProfit, 15.2215 * 0.55, 'unchanged offer');
});

test('seller-initiated-offer note reports both paths without telling the seller which to send', () => {
  const note = sellerInitiatedOfferNote(compareSellerInitiatedOffer(agBase));
  assert.match(note, /Waiting for Buy It Now/);
  assert.match(note, /\$40\.00/);
  assert.match(note, /40% sell-through/);
  assert.match(note, /\$7\.34/);
  assert.match(note, /10% offer/);
  assert.match(note, /\$36\.00/);
  assert.match(note, /55% accept/);
  assert.match(note, /\$8\.37/);
  assert.match(note, /\$1\.03/);
  assert.match(note, /\$18\.34/);
  assert.match(note, /\$15\.22/);
  assert.match(note, /48\.2%/);
  assert.match(note, /16\.0%/);
  assert.match(note, /\$33\.59/);
  assert.doesNotMatch(note, /should send the offer|must wait/i);
});

test('rejects an offer percent above 100% and a missing comparison', () => {
  assert.throws(() => compareSellerInitiatedOffer({ ...agBase, offerPercent: 101 }), /at most 100/);
  assert.throws(() => compareSellerInitiatedOffer({ ...agBase, waitSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareSellerInitiatedOffer({ ...agBase, offerAcceptPct: -1 }), /Offer accept rate/);
  assert.throws(() => compareSellerInitiatedOffer({ price: -1 }), /Item price/);
  assert.throws(() => sellerInitiatedOfferNote({}), /missing rows/);
});

const offsiteBase = {
  price: 40,
  shippingCharged: 6,
  finalValueRate: 13.25,
  fixedFee: 0.3,
  costOfGoods: 12,
  shippingCost: 5,
  packagingCost: 1,
  returnShippingCost: 5,
  feeRefundOnReturnPercent: 100,
  returnRatePercent: 10,
};

test('a $20 Offsite campaign that buys two extra sales still pays after returns', () => {
  const comparison = comparePromotedOffsite(offsiteBase);
  assert.equal(comparison.offsiteSpend, DEFAULT_OFFSITE_SPEND);
  assert.equal(comparison.extraOrders, DEFAULT_OFFSITE_EXTRA_ORDERS);
  assert.equal(comparison.monthlyCampaigns, DEFAULT_MONTHLY_OFFSITE_CAMPAIGNS);
  near(comparison.listingExpectedProfit, 18.3445, 'listing after returns');
  near(comparison.extraSaleExpectedProfit, 18.3445, 'one extra sale after returns');
  near(comparison.skip.expectedProfit, 18.3445, 'skip Offsite');
  near(comparison.offsite.expectedProfit, 35.0335, 'add Offsite');
  near(comparison.extraKeptOnOffsite, 16.689, 'Offsite gap');
  near(comparison.monthlyExtraOnOffsite, 16.689 * 4, 'four campaigns');
  near(comparison.breakEvenExtraOrders, 20 / 18.3445, 'extra-sale floor');
  near(comparison.breakEvenOffsiteSpend, 36.689, 'spend ceiling');
  near(comparison.costPerExtraSale, 10, 'spend per extra sale');
  assert.equal(comparison.winner, 'offsite');
  assert.equal(comparison.skip.adSpend, 0);
  assert.equal(comparison.offsite.adSpend, 20);
  assert.equal(comparison.offsite.extraOrders, 2);
});

test('break-even extra sales and spend match skip-Offsite', () => {
  const comparison = comparePromotedOffsite(offsiteBase);
  const atOrders = comparePromotedOffsite({
    ...offsiteBase,
    offsiteExtraOrders: comparison.breakEvenExtraOrders,
  });
  near(atOrders.offsite.expectedProfit, atOrders.skip.expectedProfit, 'floor extras tie skip');
  const atSpend = comparePromotedOffsite({
    ...offsiteBase,
    offsiteSpend: comparison.breakEvenOffsiteSpend,
  });
  near(atSpend.offsite.expectedProfit, atSpend.skip.expectedProfit, 'ceiling spend ties skip');
  assert.ok(comparison.breakEvenExtraOrders < 2, 'default two extras is above the floor');
  assert.ok(comparison.breakEvenOffsiteSpend > 20, 'default $20 spend is below the ceiling');
});

test('one extra sale for the same $20 flips skip-Offsite ahead', () => {
  const comparison = comparePromotedOffsite({ ...offsiteBase, offsiteExtraOrders: 1 });
  assert.equal(comparison.winner, 'skip');
  near(comparison.offsite.expectedProfit, 16.689, 'one extra after spend');
  near(comparison.extraKeptOnOffsite, -1.6555, 'one-extra gap');
});

test('extra Offsite sales still paying Promoted Listings Standard reduce the gap', () => {
  const comparison = comparePromotedOffsite({ ...offsiteBase, offsitePromotedRate: 8 });
  near(comparison.extraSaleExpectedProfit, 15.0325, '8% Standard on extras');
  near(comparison.offsite.expectedProfit, 28.4095, 'stacked after spend');
  near(comparison.extraKeptOnOffsite, 10.065, 'stacked gap');
  assert.equal(comparison.winner, 'offsite');
  assert.equal(comparison.offsite.promotedRate, 8);
  assert.equal(comparison.skip.promotedRate, 0);
});

test('Promoted Offsite note reports both paths without telling the seller which to use', () => {
  const comparison = comparePromotedOffsite(offsiteBase);
  const note = promotedOffsiteNote(comparison);
  assert.match(note, /Skip Promoted Offsite/);
  assert.match(note, /\$18\.34/);
  assert.match(note, /\$20\.00 Offsite campaign/);
  assert.match(note, /2 extra sales/);
  assert.match(note, /\$35\.03/);
  assert.match(note, /\$16\.69 more/);
  assert.match(note, /1\.09/);
  assert.doesNotMatch(note, /should turn on|must skip|turn Offsite on/i);
});

test('rejects a missing price, a negative spend, and a missing Offsite comparison', () => {
  assert.throws(() => comparePromotedOffsite({ price: -1 }), /Item price/);
  assert.throws(() => comparePromotedOffsite({ ...offsiteBase, offsiteSpend: -1 }), /Promoted Offsite spend/);
  assert.throws(() => comparePromotedOffsite({ ...offsiteBase, offsiteExtraOrders: -1 }), /Extra Offsite orders/);
  assert.throws(() => comparePromotedOffsite({ ...offsiteBase, offsitePromotedRate: 101 }), /at most 100/);
  assert.throws(() => promotedOffsiteNote({}), /missing rows/);
});

test('compares 10% off two units against two singles on the default listing', () => {
  // Two singles: completed $43.21; 10% mix → $36.689 packed; 55% → $20.17895.
  // 10% off ($36) in one $6 / $5.50 / $1.25 box: completed $36.615;
  // packed $31.7285; 70% take → $22.20995. Discount is ahead after
  // sell-through and behind on leftover.
  const comparison = compareQuantityDiscount(agBase);
  assert.equal(comparison.units, DEFAULT_QTY_DISCOUNT_UNITS);
  assert.equal(comparison.discountPercent, DEFAULT_QTY_DISCOUNT_PERCENT);
  assert.equal(comparison.charged, DEFAULT_QTY_SHIPPING_CHARGED);
  assert.equal(comparison.ship, DEFAULT_QTY_SHIPPING_COST);
  assert.equal(comparison.pack, DEFAULT_QTY_PACKAGING_COST);
  assert.equal(comparison.returnShip, DEFAULT_QTY_RETURN_SHIPPING_COST);
  assert.equal(comparison.fixed, DEFAULT_QTY_FIXED_FEE);
  assert.equal(comparison.singles.sellThroughPct, DEFAULT_SINGLES_SELL_THROUGH);
  assert.equal(comparison.discount.sellThroughPct, DEFAULT_QTY_TAKE_PCT);
  assert.equal(comparison.monthlyQtyOrders, DEFAULT_MONTHLY_QTY_ORDERS);
  near(comparison.discount.unitPrice, 36, '10% of $40');
  near(comparison.singles.completedProfit, 43.21, 'two completed singles');
  near(comparison.singles.soldExpectedProfit, 36.689, 'two packed singles');
  near(comparison.singles.expectedProfit, 36.689 * 0.55, 'singles after 55%');
  near(comparison.discount.completedProfit, 36.615, 'discount completed');
  near(comparison.discount.soldExpectedProfit, 31.7285, 'discount packed leftover');
  near(comparison.discount.expectedProfit, 31.7285 * 0.70, 'discount after 70%');
  near(comparison.extraPackedOnDiscount, 31.7285 - 36.689, 'packed gap');
  near(comparison.extraKeptOnDiscount, 31.7285 * 0.70 - 36.689 * 0.55, 'ST gap');
  near(comparison.monthlyExtraOnDiscount, (31.7285 * 0.70 - 36.689 * 0.55) * 20, 'twenty orders');
  near(comparison.breakEvenTakePct, (36.689 * 0.55) / 31.7285 * 100, 'take floor');
  assert.equal(comparison.winner, 'discount');
  assert.equal(comparison.discountPays, true);
});

test('break-even discount percent and take rate match selling separately', () => {
  const comparison = compareQuantityDiscount(agBase);
  const atPercent = compareQuantityDiscount({
    ...agBase,
    qtyDiscountPercent: comparison.breakEvenDiscountPercent,
  });
  near(atPercent.discount.soldExpectedProfit, atPercent.singles.soldExpectedProfit, 'ceiling percent ties leftover');
  const atTake = compareQuantityDiscount({
    ...agBase,
    qtyTakePct: comparison.breakEvenTakePct,
  });
  near(atTake.discount.expectedProfit, atTake.singles.expectedProfit, 'ceiling take ties sell-through');
  assert.ok(comparison.breakEvenDiscountPercent < 10, 'default 10% off is above the leftover ceiling');
  assert.ok(comparison.breakEvenTakePct < 70, 'default 70% take is above the floor');
  near(comparison.breakEvenDiscountPercent, 2.0581171950048014, 'leftover ceiling');
});

test('a 20% quantity discount loses even at the default take rate', () => {
  const comparison = compareQuantityDiscount({ ...agBase, qtyDiscountPercent: 20 });
  assert.equal(comparison.winner, 'singles');
  near(comparison.discount.unitPrice, 32, '20% of $40');
  near(comparison.discount.soldExpectedProfit, 25.4825, '20% packed leftover');
  near(comparison.discount.expectedProfit, 25.4825 * 0.70, '20% after 70%');
  assert.equal(comparison.discountPays, false);
});

test('matching the singles sell-through already loses on a 10% discount', () => {
  const comparison = compareQuantityDiscount({ ...agBase, qtyTakePct: 55 });
  assert.equal(comparison.winner, 'singles');
  near(comparison.discount.expectedProfit, 31.7285 * 0.55, 'matched take');
  near(comparison.singles.expectedProfit, 36.689 * 0.55, 'unchanged singles');
});

test('expensive singles labels flip leftover in favor of the multi-buy', () => {
  const comparison = compareQuantityDiscount({ ...agBase, shippingCost: 12 });
  assert.ok(comparison.extraPackedOnDiscount > 0, 'saving two $12 labels covers 10% off');
  assert.equal(comparison.winner, 'discount');
});

test('quantity-discount note reports both frames without telling the seller which to offer', () => {
  const note = quantityDiscountNote(compareQuantityDiscount(agBase));
  assert.match(note, /Selling 2 separately/);
  assert.match(note, /\$40\.00/);
  assert.match(note, /\$36\.69/);
  assert.match(note, /10% off/);
  assert.match(note, /\$36\.00/);
  assert.match(note, /\$31\.73/);
  assert.match(note, /\$4\.96/);
  assert.match(note, /55%/);
  assert.match(note, /70%/);
  assert.match(note, /\$20\.18/);
  assert.match(note, /\$22\.21/);
  assert.match(note, /\$2\.03/);
  assert.match(note, /63\.6%/);
  assert.match(note, /2\.1%/);
  assert.doesNotMatch(note, /should offer the discount|must sell separately/i);
});

test('rejects a quantity-discount percent above 100% and a missing comparison', () => {
  assert.throws(() => compareQuantityDiscount({ ...agBase, qtyDiscountPercent: 101 }), /at most 100/);
  assert.throws(() => compareQuantityDiscount({ ...agBase, singlesSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareQuantityDiscount({ ...agBase, qtyTakePct: -1 }), /Quantity-discount take rate/);
  assert.throws(() => compareQuantityDiscount({ ...agBase, qtyDiscountUnits: 1 }), /at least 2/);
  assert.throws(() => compareQuantityDiscount({ price: -1 }), /Item price/);
  assert.throws(() => quantityDiscountNote({}), /missing rows/);
});

test('compares a 15% coupon against staying listed and dropping the list', () => {
  // Listed completed $21.605; 10% mix → $18.3445 packed; 40% → $7.3378.
  // 15% coupon ($34): completed $16.40; packed $13.66. At 40% redeem the
  // mix leftover is $16.4707; 55% badge ST → $9.058885. Drop everyone
  // to $34 at 50% → $6.83. Coupon is ahead after sell-through and
  // behind on leftover.
  const comparison = compareSellerCoupon(agBase);
  assert.equal(comparison.couponPercent, DEFAULT_COUPON_PERCENT);
  assert.equal(comparison.couponRedeemPct, DEFAULT_COUPON_REDEEM_PCT);
  assert.equal(comparison.listed.sellThroughPct, DEFAULT_LISTED_SELL_THROUGH);
  assert.equal(comparison.coupon.sellThroughPct, DEFAULT_COUPON_SELL_THROUGH);
  assert.equal(comparison.drop.sellThroughPct, DEFAULT_DROP_SELL_THROUGH);
  assert.equal(comparison.monthlyCouponListings, DEFAULT_MONTHLY_COUPON_LISTINGS);
  near(comparison.coupon.price, 34, '15% of $40');
  near(comparison.listed.completedProfit, 21.605, 'listed completed');
  near(comparison.listed.soldExpectedProfit, 18.3445, 'listed packed leftover');
  near(comparison.listed.expectedProfit, 18.3445 * 0.40, 'listed after 40%');
  near(comparison.coupon.soldExpectedProfit, 16.4707, 'coupon mix leftover');
  near(comparison.coupon.expectedProfit, 16.4707 * 0.55, 'coupon after 55%');
  near(comparison.drop.soldExpectedProfit, 13.66, 'drop leftover');
  near(comparison.drop.expectedProfit, 13.66 * 0.50, 'drop after 50%');
  near(comparison.extraPackedOnCoupon, 16.4707 - 18.3445, 'packed gap');
  near(comparison.extraKeptOnCoupon, 16.4707 * 0.55 - 18.3445 * 0.40, 'ST gap');
  near(comparison.monthlyExtraOnCoupon, (16.4707 * 0.55 - 18.3445 * 0.40) * 40, 'forty listings');
  near(comparison.breakEvenCouponSellThroughPct, (18.3445 * 0.40) / 16.4707 * 100, 'coupon ST floor');
  near(comparison.breakEvenDropSellThroughPct, (16.4707 * 0.55) / 13.66 * 100, 'drop ST floor');
  assert.equal(comparison.winner, 'coupon');
  assert.equal(comparison.couponPays, true);
  assert.equal(comparison.dropPays, false);
});

test('break-even coupon and drop sell-through match the other path', () => {
  const comparison = compareSellerCoupon(agBase);
  const atCouponSt = compareSellerCoupon({
    ...agBase,
    couponSellThroughPct: comparison.breakEvenCouponSellThroughPct,
  });
  near(atCouponSt.coupon.expectedProfit, atCouponSt.listed.expectedProfit, 'coupon ST floor ties listed');
  const atDropSt = compareSellerCoupon({
    ...agBase,
    dropSellThroughPct: comparison.breakEvenDropSellThroughPct,
  });
  near(atDropSt.drop.expectedProfit, atDropSt.coupon.expectedProfit, 'drop ST floor ties coupon');
  assert.ok(comparison.breakEvenCouponSellThroughPct < 55, 'default 55% coupon ST is above the floor');
  assert.ok(comparison.breakEvenDropSellThroughPct > 50, 'default 50% drop ST is below the floor');
});

test('matching listed sell-through already loses on a 15% coupon', () => {
  const comparison = compareSellerCoupon({ ...agBase, couponSellThroughPct: 40 });
  assert.equal(comparison.winner, 'listed');
  near(comparison.coupon.expectedProfit, 16.4707 * 0.40, 'matched coupon ST');
  near(comparison.listed.expectedProfit, 18.3445 * 0.40, 'unchanged listed');
  assert.equal(comparison.couponPays, false);
});

test('a 25% coupon that everyone redeems loses even at the default badge lift', () => {
  const comparison = compareSellerCoupon({ ...agBase, couponPercent: 25, couponRedeemPct: 100 });
  assert.equal(comparison.winner, 'listed');
  near(comparison.coupon.price, 30, '25% of $40');
  near(comparison.coupon.soldExpectedProfit, 10.537, '25% leftover');
  near(comparison.coupon.expectedProfit, 10.537 * 0.55, '25% after 55%');
  assert.equal(comparison.couponPays, false);
});

test('an 80% dropped-list sell-through flips the cheaper BIN ahead of the coupon', () => {
  const comparison = compareSellerCoupon({ ...agBase, dropSellThroughPct: 80 });
  assert.equal(comparison.winner, 'drop');
  near(comparison.drop.expectedProfit, 13.66 * 0.80, '80% drop');
  near(comparison.coupon.expectedProfit, 16.4707 * 0.55, 'unchanged coupon');
  assert.equal(comparison.dropPays, true);
});

test('seller-coupon note reports all three paths without telling the seller which to publish', () => {
  const note = sellerCouponNote(compareSellerCoupon(agBase));
  assert.match(note, /Staying listed/);
  assert.match(note, /\$40\.00/);
  assert.match(note, /\$18\.34/);
  assert.match(note, /15% coupon/);
  assert.match(note, /\$34\.00/);
  assert.match(note, /\$16\.47/);
  assert.match(note, /\$1\.87/);
  assert.match(note, /40%/);
  assert.match(note, /55%/);
  assert.match(note, /\$7\.34/);
  assert.match(note, /\$9\.06/);
  assert.match(note, /\$1\.72/);
  assert.match(note, /\$13\.66/);
  assert.match(note, /\$6\.83/);
  assert.match(note, /\$2\.23/);
  assert.match(note, /44\.6%/);
  assert.match(note, /66\.3%/);
  assert.doesNotMatch(note, /should offer the coupon|must stay listed|must drop the list/i);
});

test('rejects a coupon percent above 100% and a missing comparison', () => {
  assert.throws(() => compareSellerCoupon({ ...agBase, couponPercent: 101 }), /at most 100/);
  assert.throws(() => compareSellerCoupon({ ...agBase, couponRedeemPct: 101 }), /at most 100/);
  assert.throws(() => compareSellerCoupon({ ...agBase, listedSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareSellerCoupon({ ...agBase, couponSellThroughPct: -1 }), /Coupon sell-through/);
  assert.throws(() => compareSellerCoupon({ price: -1 }), /Item price/);
  assert.throws(() => sellerCouponNote({}), /missing rows/);
});

test('compares requiring immediate payment against unpaid later checkouts', () => {
  // Paid completed $21.605; 10% mix → $18.3445 packed. Unpaid leftover
  // is −$0.35 relist − $6.00 of 20 min at $18 = −$6.35. At 8% unpaid
  // the later mix is $16.36894; 55% ST → $9.002917. Immediate payment
  // keeps the $18.3445 packed leftover at 45% → $8.255025. Later is
  // ahead after sell-through and behind on leftover.
  const comparison = compareImmediatePayment(agBase);
  assert.equal(comparison.unpaidRatePercent, DEFAULT_UNPAID_RATE);
  assert.equal(comparison.later.sellThroughPct, DEFAULT_LATER_SELL_THROUGH);
  assert.equal(comparison.immediate.sellThroughPct, DEFAULT_IMMEDIATE_SELL_THROUGH);
  assert.equal(comparison.unpaidRelistFee, DEFAULT_UNPAID_RELIST_FEE);
  assert.equal(comparison.unpaidMinutes, DEFAULT_UNPAID_MINUTES);
  assert.equal(comparison.unpaidHourlyWage, DEFAULT_UNPAID_HOURLY_WAGE);
  assert.equal(comparison.monthlyImmediateListings, DEFAULT_MONTHLY_IMMEDIATE_LISTINGS);
  near(comparison.timeCost, 6, '20 min at $18');
  near(comparison.unpaidOutcome, -6.35, 'relist plus time');
  near(comparison.immediate.soldExpectedProfit, 18.3445, 'paid leftover');
  near(comparison.later.soldExpectedProfit, 0.92 * 18.3445 + 0.08 * -6.35, 'later mix leftover');
  near(comparison.later.expectedProfit, (0.92 * 18.3445 + 0.08 * -6.35) * 0.55, 'later after 55%');
  near(comparison.immediate.expectedProfit, 18.3445 * 0.45, 'immediate after 45%');
  near(comparison.extraPackedOnImmediate, 18.3445 - (0.92 * 18.3445 + 0.08 * -6.35), 'packed gap');
  near(
    comparison.extraKeptOnImmediate,
    18.3445 * 0.45 - (0.92 * 18.3445 + 0.08 * -6.35) * 0.55,
    'ST gap',
  );
  near(
    comparison.monthlyExtraOnImmediate,
    (18.3445 * 0.45 - (0.92 * 18.3445 + 0.08 * -6.35) * 0.55) * 40,
    'forty listings',
  );
  near(
    comparison.breakEvenUnpaidRate,
    (18.3445 - (18.3445 * 0.45) / 0.55) / (18.3445 - -6.35) * 100,
    'unpaid floor',
  );
  near(
    comparison.breakEvenImmediateSellThroughPct,
    ((0.92 * 18.3445 + 0.08 * -6.35) * 0.55) / 18.3445 * 100,
    'immediate ST floor',
  );
  assert.equal(comparison.winner, 'later');
  assert.equal(comparison.immediatePays, false);
});

test('break-even unpaid rate and immediate sell-through match the other path', () => {
  const comparison = compareImmediatePayment(agBase);
  const atUnpaid = compareImmediatePayment({
    ...agBase,
    unpaidRatePercent: comparison.breakEvenUnpaidRate,
  });
  near(atUnpaid.later.expectedProfit, atUnpaid.immediate.expectedProfit, 'unpaid floor ties immediate');
  const atImmediateSt = compareImmediatePayment({
    ...agBase,
    immediateSellThroughPct: comparison.breakEvenImmediateSellThroughPct,
  });
  near(atImmediateSt.immediate.expectedProfit, atImmediateSt.later.expectedProfit, 'immediate ST floor ties later');
  assert.ok(comparison.breakEvenUnpaidRate > 8, 'default 8% unpaid is below the floor');
  assert.ok(comparison.breakEvenImmediateSellThroughPct > 45, 'default 45% immediate ST is below the floor');
});

test('matching immediate sell-through already loses on later checkout', () => {
  const comparison = compareImmediatePayment({ ...agBase, laterSellThroughPct: 45 });
  assert.equal(comparison.winner, 'immediate');
  near(comparison.later.expectedProfit, (0.92 * 18.3445 + 0.08 * -6.35) * 0.45, 'matched later ST');
  near(comparison.immediate.expectedProfit, 18.3445 * 0.45, 'unchanged immediate');
  assert.equal(comparison.immediatePays, true);
});

test('a 20% unpaid rate loses even at the default later-pay lift', () => {
  const comparison = compareImmediatePayment({ ...agBase, unpaidRatePercent: 20 });
  assert.equal(comparison.winner, 'immediate');
  near(comparison.later.soldExpectedProfit, 0.80 * 18.3445 + 0.20 * -6.35, '20% mix leftover');
  near(comparison.later.expectedProfit, (0.80 * 18.3445 + 0.20 * -6.35) * 0.55, '20% after 55%');
  assert.equal(comparison.immediatePays, true);
});

test('a 50% immediate-pay sell-through flips require-now ahead of later checkout', () => {
  const comparison = compareImmediatePayment({ ...agBase, immediateSellThroughPct: 50 });
  assert.equal(comparison.winner, 'immediate');
  near(comparison.immediate.expectedProfit, 18.3445 * 0.50, '50% immediate');
  near(comparison.later.expectedProfit, (0.92 * 18.3445 + 0.08 * -6.35) * 0.55, 'unchanged later');
  assert.equal(comparison.immediatePays, true);
});

test('immediate-payment note reports both paths without telling the seller which setting to flip', () => {
  const note = immediatePaymentNote(compareImmediatePayment(agBase));
  assert.match(note, /Allowing checkout later/);
  assert.match(note, /8%/);
  assert.match(note, /\$16\.37/);
  assert.match(note, /\$6\.35/);
  assert.match(note, /\$0\.35/);
  assert.match(note, /\$6\.00/);
  assert.match(note, /\$18\.34/);
  assert.match(note, /\$1\.98/);
  assert.match(note, /55%/);
  assert.match(note, /45%/);
  assert.match(note, /\$9\.00/);
  assert.match(note, /\$8\.26/);
  assert.match(note, /\$0\.75/);
  assert.match(note, /13\.5%/);
  assert.match(note, /49\.1%/);
  assert.doesNotMatch(note, /should require immediate|must allow later|must flip/i);
});

test('rejects an unpaid rate above 100% and a missing comparison', () => {
  assert.throws(() => compareImmediatePayment({ ...agBase, unpaidRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareImmediatePayment({ ...agBase, laterSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareImmediatePayment({ ...agBase, immediateSellThroughPct: -1 }), /Immediate-pay sell-through/);
  assert.throws(() => compareImmediatePayment({ price: -1 }), /Item price/);
  assert.throws(() => immediatePaymentNote({}), /missing rows/);
});

test('compares Global Shipping Program against you-ship on the default listing', () => {
  // GSP: same $21.605 completed sale as the domestic form, 6% return
  // mix → $19.6487 leftover; 40% ST → $7.85948.
  // You-ship: $62 revenue, 14.90% fees + $0.30 = $9.538, $31 invested
  // → $21.462 completed. Return −$37; 10% mix → $15.6158. An 8%
  // claim loses COGS + intl label + pack (−$31) → $11.886536 packed;
  // 55% ST → $6.5375948. GSP is ahead after sell-through.
  const comparison = compareGlobalShipping(agBase);
  assert.equal(comparison.gspReturnRate, DEFAULT_GSP_RETURN_RATE);
  assert.equal(comparison.gsp.sellThroughPct, DEFAULT_GSP_SELL_THROUGH);
  assert.equal(comparison.selfShipCharged, DEFAULT_SELF_SHIP_SHIPPING_CHARGED);
  assert.equal(comparison.selfShipCost, DEFAULT_SELF_SHIP_SHIPPING_COST);
  assert.equal(comparison.selfShipReturnCost, DEFAULT_SELF_SHIP_RETURN_SHIPPING_COST);
  assert.equal(comparison.selfShipIntlFee, DEFAULT_SELF_SHIP_INTL_FEE_RATE);
  assert.equal(comparison.selfShipReturnRate, DEFAULT_SELF_SHIP_RETURN_RATE);
  assert.equal(comparison.selfShipClaimRate, DEFAULT_SELF_SHIP_CLAIM_RATE);
  assert.equal(comparison.selfShip.sellThroughPct, DEFAULT_SELF_SHIP_SELL_THROUGH);
  assert.equal(comparison.monthlyListings, DEFAULT_MONTHLY_GSP_LISTINGS);
  near(comparison.gsp.completedProfit, 21.605, 'GSP completed');
  near(comparison.gsp.soldExpectedProfit, 0.94 * 21.605 + 0.06 * -11, 'GSP leftover');
  near(comparison.gsp.expectedProfit, (0.94 * 21.605 + 0.06 * -11) * 0.40, 'GSP after 40%');
  near(comparison.selfShip.completedProfit, 21.462, 'you-ship completed');
  near(comparison.claimProfit, -31, 'claim loses COGS and the intl label');
  near(comparison.selfShip.soldExpectedProfit, 0.92 * 15.6158 + 0.08 * -31, 'you-ship leftover');
  near(comparison.selfShip.expectedProfit, (0.92 * 15.6158 + 0.08 * -31) * 0.55, 'you-ship after 55%');
  near(
    comparison.extraKeptOnGsp,
    (0.94 * 21.605 + 0.06 * -11) * 0.40 - (0.92 * 15.6158 + 0.08 * -31) * 0.55,
    'ST gap',
  );
  near(
    comparison.monthlyExtraOnGsp,
    ((0.94 * 21.605 + 0.06 * -11) * 0.40 - (0.92 * 15.6158 + 0.08 * -31) * 0.55) * 20,
    'twenty listings',
  );
  assert.equal(comparison.winner, 'gsp');
  assert.equal(comparison.gspPays, true);
});

test('break-even claim rate and you-ship sell-through match GSP', () => {
  const comparison = compareGlobalShipping(agBase);
  const atClaim = compareGlobalShipping({
    ...agBase,
    selfShipClaimRatePercent: comparison.breakEvenClaimRate,
  });
  near(atClaim.selfShip.expectedProfit, atClaim.gsp.expectedProfit, 'claim floor ties GSP');
  const atSelfSt = compareGlobalShipping({
    ...agBase,
    selfShipSellThroughPct: comparison.breakEvenSelfShipSellThroughPct,
  });
  near(atSelfSt.selfShip.expectedProfit, atSelfSt.gsp.expectedProfit, 'you-ship ST floor ties GSP');
  assert.ok(comparison.breakEvenClaimRate < 8, 'default 8% claims sit above the floor');
  assert.ok(comparison.breakEvenSelfShipSellThroughPct > 55, 'default 55% you-ship ST is below the floor');
});

test('matching 40% sell-through already loses on you-ship', () => {
  const comparison = compareGlobalShipping({ ...agBase, selfShipSellThroughPct: 40 });
  assert.equal(comparison.winner, 'gsp');
  near(comparison.selfShip.expectedProfit, (0.92 * 15.6158 + 0.08 * -31) * 0.40, 'matched you-ship ST');
  near(comparison.gsp.expectedProfit, (0.94 * 21.605 + 0.06 * -11) * 0.40, 'unchanged GSP');
});

test('zero claims flip you-ship ahead of GSP at the default close rates', () => {
  const comparison = compareGlobalShipping({ ...agBase, selfShipClaimRatePercent: 0 });
  assert.equal(comparison.winner, 'self-ship');
  near(comparison.selfShip.soldExpectedProfit, 15.6158, 'no-claim leftover');
  near(comparison.selfShip.expectedProfit, 15.6158 * 0.55, 'no-claim after 55%');
  assert.equal(comparison.gspPays, false);
});

test('a 70% you-ship sell-through flips the international label ahead', () => {
  const comparison = compareGlobalShipping({ ...agBase, selfShipSellThroughPct: 70 });
  assert.equal(comparison.winner, 'self-ship');
  near(comparison.selfShip.expectedProfit, (0.92 * 15.6158 + 0.08 * -31) * 0.70, '70% you-ship');
  near(comparison.gsp.expectedProfit, (0.94 * 21.605 + 0.06 * -11) * 0.40, 'unchanged GSP');
});

test('a 30% GSP sell-through loses to the default you-ship close rate', () => {
  const comparison = compareGlobalShipping({ ...agBase, gspSellThroughPct: 30 });
  assert.equal(comparison.winner, 'self-ship');
  near(comparison.gsp.expectedProfit, (0.94 * 21.605 + 0.06 * -11) * 0.30, '30% GSP');
});

test('Global Shipping note reports both paths without telling the seller which program to enroll', () => {
  const note = globalShippingNote(compareGlobalShipping(agBase));
  assert.match(note, /Global Shipping Program/);
  assert.match(note, /\$6\.00/);
  assert.match(note, /6%/);
  assert.match(note, /\$19\.65/);
  assert.match(note, /\$22\.00/);
  assert.match(note, /\$19\.00/);
  assert.match(note, /1\.65%/);
  assert.match(note, /10%/);
  assert.match(note, /8%/);
  assert.match(note, /\$11\.89/);
  assert.match(note, /\$7\.76/);
  assert.match(note, /40%/);
  assert.match(note, /55%/);
  assert.match(note, /\$7\.86/);
  assert.match(note, /\$6\.54/);
  assert.match(note, /\$1\.32/);
  assert.match(note, /2\.8%/);
  assert.match(note, /66\.1%/);
  assert.doesNotMatch(note, /should enroll|must use GSP|must self-ship/i);
});

test('rejects a claim rate above 100% and a missing comparison', () => {
  assert.throws(() => compareGlobalShipping({ ...agBase, selfShipClaimRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareGlobalShipping({ ...agBase, gspSellThroughPct: 101 }), /at most 100/);
  assert.throws(() => compareGlobalShipping({ ...agBase, selfShipIntlFeeRate: -1 }), /Self-ship international fee/);
  assert.throws(() => compareGlobalShipping({ price: -1 }), /Item price/);
  assert.throws(() => globalShippingNote({}), /missing rows/);
});
