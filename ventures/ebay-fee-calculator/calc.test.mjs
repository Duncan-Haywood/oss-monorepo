import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, calculatePriceScenarios, calculateRepricingTable, compareListingFormat, listingFormatNote, comparePartialRefund, partialRefundNote, DEFAULT_PARTIAL_REFUND, DEFAULT_MONTHLY_CASES, compareAuthenticity, authenticityNote, DEFAULT_AUTHENTICITY_FEE_RATE, DEFAULT_AUTHENTICITY_EXTRA_SHIP, DEFAULT_WITHOUT_AG_SELL_THROUGH, DEFAULT_AUTHENTICITY_SELL_THROUGH, DEFAULT_AUTHENTICITY_RETURN_RATE, DEFAULT_MONTHLY_AG_LISTINGS } from './calc.mjs';

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
