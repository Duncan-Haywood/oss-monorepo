import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, calculatePriceScenarios, calculateRepricingTable, compareListingFormat, listingFormatNote, comparePartialRefund, partialRefundNote, DEFAULT_PARTIAL_REFUND, DEFAULT_MONTHLY_CASES, compareAuthenticity, authenticityNote, DEFAULT_AUTHENTICITY_FEE_RATE, DEFAULT_AUTHENTICITY_EXTRA_SHIP, DEFAULT_WITHOUT_AG_SELL_THROUGH, DEFAULT_AUTHENTICITY_SELL_THROUGH, DEFAULT_AUTHENTICITY_RETURN_RATE, DEFAULT_MONTHLY_AG_LISTINGS, compareLocalPickup, localPickupNote, DEFAULT_SHIP_SELL_THROUGH, DEFAULT_PICKUP_SELL_THROUGH, DEFAULT_PICKUP_NO_SHOW, DEFAULT_PICKUP_MINUTES, DEFAULT_PICKUP_HOURLY_WAGE, DEFAULT_MONTHLY_PICKUP_LISTINGS, compareLotVsSingles, lotVsSinglesNote, DEFAULT_LOT_PIECE_COUNT, DEFAULT_SINGLE_EXPECTED_PRICE, DEFAULT_LOT_SELL_THROUGH, DEFAULT_SINGLE_SELL_THROUGH, DEFAULT_SINGLE_INSERTION_FEE, DEFAULT_MONTHLY_LOT_DECISIONS, compareStandardEnvelope, standardEnvelopeNote, DEFAULT_ENVELOPE_SHIPPING_COST, DEFAULT_ENVELOPE_PACKAGING_COST, DEFAULT_ENVELOPE_CLAIM_RATE, DEFAULT_ENVELOPE_FEE_REFUND_ON_CLAIM, DEFAULT_TRACKED_SELL_THROUGH, DEFAULT_ENVELOPE_SELL_THROUGH, DEFAULT_MONTHLY_ENVELOPE_LISTINGS, compareTopRatedPlus, topRatedPlusNote, DEFAULT_TRS_DISCOUNT_PCT, DEFAULT_STANDARD_SELL_THROUGH, DEFAULT_TRS_SELL_THROUGH, DEFAULT_STANDARD_RETURN_RATE, DEFAULT_TRS_RETURN_RATE, DEFAULT_MONTHLY_TRS_LISTINGS } from './calc.mjs';

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

test('compares Top Rated Plus against staying standard on the default listing', () => {
  // Standard: completed $21.605; return −$6 (buyer-paid label); 8% mix → $19.3966.
  // 60% sell-through → $11.63796.
  // TRP: 10% off 13.25% FVF → 11.925%. Completed $22.2145; return −$11;
  // 16% mix → $16.90018; minus $2.40 handling; 75% sell-through → $10.875135.
  // Standard is ahead. The 10% fee save does not cover free returns.
  const comparison = compareTopRatedPlus(agBase);
  assert.equal(comparison.discountPct, DEFAULT_TRS_DISCOUNT_PCT);
  assert.equal(comparison.standard.sellThroughPct, DEFAULT_STANDARD_SELL_THROUGH);
  assert.equal(comparison.topRated.sellThroughPct, DEFAULT_TRS_SELL_THROUGH);
  assert.equal(comparison.standard.returnRatePercent, DEFAULT_STANDARD_RETURN_RATE);
  assert.equal(comparison.topRated.returnRatePercent, DEFAULT_TRS_RETURN_RATE);
  assert.equal(comparison.monthlyListings, DEFAULT_MONTHLY_TRS_LISTINGS);
  near(comparison.discountedFvf, 11.925, '10% off 13.25');
  near(comparison.fvfSave, 0.6095, 'FVF save on $46');
  near(comparison.handlingCost, 2.4, '8 minutes at $18');
  near(comparison.standard.soldExpectedProfit, 19.3966, 'standard completed expected');
  near(comparison.standard.expectedProfit, 19.3966 * 0.60, 'standard listing expected');
  near(comparison.topRated.completedProfit, 22.2145, 'TRP completed');
  near(comparison.topRated.soldExpectedProfit, 16.90018, 'TRP completed expected');
  near(comparison.topRated.expectedProfit, (16.90018 - 2.4) * 0.75, 'TRP listing expected');
  assert.equal(comparison.winner, 'standard');
  near(comparison.extraKeptOnTopRated, 10.875135 - 11.63796, 'TRP vs standard');
  near(comparison.monthlyExtraOnTopRated, (10.875135 - 11.63796) * 40, '40 listings');
  near(comparison.breakEvenTrsSellThrough, 80.26079676252296, 'sell-through that ties standard');
  near(comparison.breakEvenTrsReturnRate, 12.93778319709766, 'return rate that ties standard');
});

test('break-even Top Rated sell-through and return rate match staying standard', () => {
  const comparison = compareTopRatedPlus(agBase);
  const atSellThrough = compareTopRatedPlus({
    ...agBase,
    trsSellThroughPct: comparison.breakEvenTrsSellThrough,
  });
  near(atSellThrough.topRated.expectedProfit, atSellThrough.standard.expectedProfit, 'ceiling sell-through ties standard');
  const atReturnRate = compareTopRatedPlus({
    ...agBase,
    trsReturnRatePercent: comparison.breakEvenTrsReturnRate,
  });
  near(atReturnRate.topRated.expectedProfit, atReturnRate.standard.expectedProfit, 'ceiling return rate ties standard');
  assert.ok(comparison.breakEvenTrsReturnRate < 16, 'default 16% free returns is above the ceiling');
});

test('a high-ticket listing with a modest return lift flips Top Rated Plus ahead', () => {
  const comparison = compareTopRatedPlus({
    ...agBase,
    price: 180,
    shippingCharged: 12,
    costOfGoods: 70,
    shippingCost: 14,
    packagingCost: 3,
    standardReturnRatePercent: 6,
    trsReturnRatePercent: 10,
    standardSellThroughPct: 55,
    trsSellThroughPct: 72,
    trsReturnShippingCost: 12,
  });
  assert.equal(comparison.winner, 'topRated');
  near(comparison.standard.expectedProfit, 40.41642, 'high-ticket standard');
  near(comparison.topRated.expectedProfit, 49.192992, 'high-ticket Top Rated');
  near(comparison.extraKeptOnTopRated, 49.192992 - 40.41642, 'high-ticket gap');
});

test('Top Rated Plus note names the figures without telling the seller what to do', () => {
  const comparison = compareTopRatedPlus(agBase);
  const note = topRatedPlusNote(comparison);
  assert.match(note, /Staying standard at 60%/);
  assert.match(note, /8% return rate/);
  assert.match(note, /\$0\.00 return postage/);
  assert.match(note, /10% final-value discount/);
  assert.match(note, /75% sell-through/);
  assert.match(note, /16% return rate/);
  assert.match(note, /\$2\.40 of 1-day handling/);
  assert.match(note, /Free returns can rise to about 12\.9%/);
  assert.doesNotMatch(note, /should enroll|must offer free returns|apply for Top Rated/i);
});

test('rejects a Top Rated return rate above 100% and a missing comparison', () => {
  assert.throws(() => compareTopRatedPlus({ ...agBase, trsReturnRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareTopRatedPlus({ ...agBase, trsDiscountPct: 101 }), /at most 100/);
  assert.throws(() => compareTopRatedPlus({ price: -1 }), /Item price/);
  assert.throws(() => topRatedPlusNote({}), /missing rows/);
});
