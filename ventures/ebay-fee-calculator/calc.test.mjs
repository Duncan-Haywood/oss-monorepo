import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, calculateSourcingCeiling, calculatePriceScenarios, calculateRepricingTable, priceToMatchProfit, calculatePromotedTable, maxAffordablePromotedRate, compareListingFormat, listingFormatNote, comparePartialRefund, partialRefundNote, DEFAULT_PARTIAL_REFUND, DEFAULT_MONTHLY_CASES, compareAuthenticity, authenticityNote, DEFAULT_AUTHENTICITY_FEE_RATE, DEFAULT_AUTHENTICITY_EXTRA_SHIP, DEFAULT_WITHOUT_AG_SELL_THROUGH, DEFAULT_AUTHENTICITY_SELL_THROUGH, DEFAULT_AUTHENTICITY_RETURN_RATE, DEFAULT_MONTHLY_AG_LISTINGS, compareLocalPickup, localPickupNote, DEFAULT_SHIP_SELL_THROUGH, DEFAULT_PICKUP_SELL_THROUGH, DEFAULT_PICKUP_NO_SHOW, DEFAULT_PICKUP_MINUTES, DEFAULT_PICKUP_HOURLY_WAGE, DEFAULT_MONTHLY_PICKUP_LISTINGS, compareLotVsSingles, lotVsSinglesNote, DEFAULT_LOT_PIECE_COUNT, DEFAULT_SINGLE_EXPECTED_PRICE, DEFAULT_LOT_SELL_THROUGH, DEFAULT_SINGLE_SELL_THROUGH, DEFAULT_SINGLE_INSERTION_FEE, DEFAULT_MONTHLY_LOT_DECISIONS, compareStandardEnvelope, standardEnvelopeNote, DEFAULT_ENVELOPE_SHIPPING_COST, DEFAULT_ENVELOPE_PACKAGING_COST, DEFAULT_ENVELOPE_CLAIM_RATE, DEFAULT_ENVELOPE_FEE_REFUND_ON_CLAIM, DEFAULT_TRACKED_SELL_THROUGH, DEFAULT_ENVELOPE_SELL_THROUGH, DEFAULT_MONTHLY_ENVELOPE_LISTINGS, compareCombinedShipping, combinedShippingNote, DEFAULT_COMBINED_ITEM_COUNT, DEFAULT_COMBINED_SHIPPING_CHARGED, DEFAULT_COMBINED_SHIPPING_COST, DEFAULT_COMBINED_PACKAGING_COST, DEFAULT_COMBINED_RETURN_SHIPPING_COST, DEFAULT_COMBINED_FIXED_FEE, DEFAULT_MONTHLY_COMBINED_ORDERS, compareSellerInitiatedOffer, sellerInitiatedOfferNote, DEFAULT_OFFER_PERCENT, DEFAULT_WAIT_SELL_THROUGH, DEFAULT_OFFER_ACCEPT, DEFAULT_MONTHLY_OFFERS, comparePromotedOffsite, promotedOffsiteNote, DEFAULT_OFFSITE_SPEND, DEFAULT_OFFSITE_EXTRA_ORDERS, DEFAULT_MONTHLY_OFFSITE_CAMPAIGNS, comparePromotedStandard, promotedStandardNote, DEFAULT_PROMOTED_STANDARD_RATE, DEFAULT_PROMOTED_STANDARD_EXTRA_ORDERS, DEFAULT_MONTHLY_PROMOTED_LISTINGS, compareQuantityDiscount, quantityDiscountNote, DEFAULT_QTY_DISCOUNT_UNITS, DEFAULT_QTY_DISCOUNT_PERCENT, DEFAULT_QTY_SHIPPING_CHARGED, DEFAULT_QTY_SHIPPING_COST, DEFAULT_QTY_PACKAGING_COST, DEFAULT_QTY_RETURN_SHIPPING_COST, DEFAULT_QTY_FIXED_FEE, DEFAULT_SINGLES_SELL_THROUGH, DEFAULT_QTY_TAKE_PCT, DEFAULT_MONTHLY_QTY_ORDERS, compareSellerCoupon, sellerCouponNote, DEFAULT_COUPON_PERCENT, DEFAULT_COUPON_REDEEM_PCT, DEFAULT_LISTED_SELL_THROUGH, DEFAULT_COUPON_SELL_THROUGH, DEFAULT_DROP_SELL_THROUGH, DEFAULT_MONTHLY_COUPON_LISTINGS, compareImmediatePayment, immediatePaymentNote, DEFAULT_UNPAID_RATE, DEFAULT_LATER_SELL_THROUGH, DEFAULT_IMMEDIATE_SELL_THROUGH, DEFAULT_UNPAID_RELIST_FEE, DEFAULT_UNPAID_MINUTES, DEFAULT_UNPAID_HOURLY_WAGE, DEFAULT_MONTHLY_IMMEDIATE_LISTINGS, compareTopRatedPlus, topRatedPlusNote, DEFAULT_TRS_DISCOUNT_PCT, DEFAULT_STANDARD_SELL_THROUGH, DEFAULT_TRS_SELL_THROUGH, DEFAULT_STANDARD_RETURN_RATE, DEFAULT_TRS_RETURN_RATE, DEFAULT_MONTHLY_TRS_LISTINGS, compareManagedReturns, managedReturnsNote, DEFAULT_SELF_RETURN_LABEL, DEFAULT_SELF_RETURN_RATE, DEFAULT_MANAGED_RETURN_FEE, DEFAULT_MANAGED_RETURN_RATE, DEFAULT_BUYER_PAYS_RETURN_RATE, DEFAULT_MONTHLY_MANAGED_LISTINGS, compareGlobalShipping, globalShippingNote, DEFAULT_GSP_RETURN_RATE, DEFAULT_GSP_SELL_THROUGH, DEFAULT_SELF_SHIP_SHIPPING_CHARGED, DEFAULT_SELF_SHIP_SHIPPING_COST, DEFAULT_SELF_SHIP_RETURN_SHIPPING_COST, DEFAULT_SELF_SHIP_INTL_FEE_RATE, DEFAULT_SELF_SHIP_RETURN_RATE, DEFAULT_SELF_SHIP_CLAIM_RATE, DEFAULT_SELF_SHIP_SELL_THROUGH, DEFAULT_MONTHLY_GSP_LISTINGS, compareStoreTiers, storeTiersNote, storeBreakEvenOrders, STORE_TIER_PRESETS, DEFAULT_MONTHLY_STORE_ORDERS, DEFAULT_MONTHLY_STORE_FEE, compareBestOffer, bestOfferRows, bestOfferNote, bestOfferSummary, DEFAULT_INCOMING_BEST_OFFER, DEFAULT_INCOMING_WAIT_CHANCE, compareInternational, internationalNote, internationalSummary, ILLUSTRATIVE_INTL_FEE_RATE, DEFAULT_INTL_EXTRA_SHIPPING, compareFreeShipping, freeShippingNote, DEFAULT_BUYER_PAYS_SHIP_SELL_THROUGH, DEFAULT_FREE_SHIP_SELL_THROUGH, DEFAULT_MONTHLY_FREE_SHIP_LISTINGS, comparePromotedAdvanced, promotedAdvancedNote, DEFAULT_ADVANCED_CPC, DEFAULT_ADVANCED_CLICKS, DEFAULT_ADVANCED_EXTRA_ORDERS, DEFAULT_MONTHLY_ADVANCED_CAMPAIGNS, comparePackageProtection, packageProtectionNote, packageProtectionSummary, DEFAULT_SKIP_CLAIM_RATE, DEFAULT_INSURANCE_PREMIUM, DEFAULT_INSURANCE_CLAIM_RATE, DEFAULT_SIGNATURE_FEE, DEFAULT_SIGNATURE_CLAIM_RATE, DEFAULT_MONTHLY_PROTECTION_SHIPMENTS, compareEbayLabels, ebayLabelsNote, ebayLabelsSummary, DEFAULT_THIRD_PARTY_LABEL_COST, DEFAULT_EBAY_LABEL_CLAIM_RATE, DEFAULT_THIRD_PARTY_CLAIM_RATE, DEFAULT_LABEL_UPLOAD_MINUTES, DEFAULT_LABEL_UPLOAD_WAGE, DEFAULT_MONTHLY_LABEL_SHIPMENTS } from './calc.mjs';

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
  near(r.cashRecovered, 46 - 6.395, 'cash recovered');
  near(r.cashRecoveryPct, (46 - 6.395) / 18 * 100, 'cash recovery percentage');
  near(r.cashSurplus, r.profit, 'cash surplus agrees with profit');
});

test('reports a cash shortfall when fees leave less than the invested cash', () => {
  const r = calculateOrder({ price: 10, finalValueRate: 20, fixedFee: 1, costOfGoods: 12 });
  assert.ok(r.cashRecovered < r.cashInvested);
  assert.ok(r.cashSurplus < 0);
  near(r.cashSurplus, r.profit, 'shortfall agrees with profit');
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

test('priceToMatchProfit holds the typed leftover after percentage fees', () => {
  const input = {
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1,
  };
  const hold = priceToMatchProfit(input, 20);
  const atHold = calculateOrder({ ...input, price: hold });
  assert.ok(Math.abs(atHold.profit - 20) < 0.02, `hold leftover ${atHold.profit}`);
  near(calculateOrder({ ...input, targetProfit: 20 }).targetProfitPrice, hold, 'calculateOrder exposes the same price');
});

test('maxAffordablePromotedRate is the unpromoted margin leftover for ads', () => {
  const input = {
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1,
  };
  const unpromoted = calculateOrder({ ...input, promotedRate: 0 });
  const cap = maxAffordablePromotedRate(input);
  near(cap, unpromoted.margin, 'break-even ad cap equals unpromoted margin');
  const atCap = calculateOrder({ ...input, promotedRate: cap });
  near(atCap.profit, 0, 'profit at the break-even ad rate');
});

test('maxAffordablePromotedRate for a target margin subtracts that target', () => {
  const input = {
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1, targetMargin: 20,
  };
  const unpromoted = calculateOrder({ ...input, promotedRate: 0 });
  const cap = maxAffordablePromotedRate(input, { forTargetMargin: true });
  near(cap, unpromoted.margin - 20, 'target-margin ad cap');
  const atCap = calculateOrder({ ...input, promotedRate: cap });
  near(atCap.margin, 20, 'margin at the target-margin ad cap');
});

test('calculatePromotedTable includes the typed rate and measures ad cost vs 0%', () => {
  const input = {
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1, promotedRate: 5,
  };
  const rows = calculatePromotedTable(input, [0, 2, 8]);
  assert.deepEqual(rows.map((row) => row.promotedRate), [0, 2, 5, 8]);
  assert.deepEqual(rows.map((row) => row.isCurrent), [false, false, true, false]);
  assert.equal(rows[0].isUnpromoted, true);
  near(rows[2].profit, calculateOrder(input).profit, 'current row matches headline');
  near(rows[0].profitDelta, 0, 'unpromoted row has no ad cost');
  assert.ok(rows[3].profitDelta < rows[2].profitDelta, 'higher ad rate costs more');
  near(rows[3].profitDelta, -46 * 0.08, 'ad cost is a share of order revenue');
});

test('priceToMatchProfit rejects a non-finite target and an unreachable fee stack', () => {
  assert.throws(() => priceToMatchProfit({ price: 40 }, Number.NaN), /Target profit/);
  assert.equal(priceToMatchProfit({ price: 40, finalValueRate: 80, promotedRate: 20, intlFeeRate: 10 }, 5), Infinity);
});

test('calculates the item price required for a target net margin', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 12, shippingCost: 5, packagingCost: 1, targetMargin: 20 };
  const r = calculateOrder(input);
  const atTarget = calculateOrder({ ...input, price: r.targetMarginPrice });
  near(atTarget.margin, 20, 'margin at target price');
  near(r.targetMarginPrice, 18.3 / 0.6675 - 6, 'target margin price');
});

test('calculates the maximum acquisition cost for a target margin', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, shippingCost: 5, packagingCost: 1, targetMargin: 20 };
  const r = calculateOrder({ ...input, costOfGoods: 12 });
  const atMaxCost = calculateOrder({ ...input, costOfGoods: r.maxCostOfGoods });
  near(atMaxCost.margin, 20, 'margin at maximum acquisition cost');
  near(r.maxCostOfGoods, 46 * 0.6675 - 0.3 - 5 - 1, 'maximum acquisition cost');
});

test('clamps maximum acquisition cost at zero when the target is not met without sourcing cost', () => {
  const r = calculateOrder({ price: 10, finalValueRate: 80, targetMargin: 20 });
  assert.equal(r.maxCostOfGoods, 0);
});

test('maximum acquisition cost stays per item when the fixed fee is shared across a batch', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, shippingCost: 5, packagingCost: 1, targetMargin: 20, quantity: 3 };
  const r = calculateOrder({ ...input, costOfGoods: 12 });
  const atMaxCost = calculateOrder({ ...input, costOfGoods: r.maxCostOfGoods });
  near(atMaxCost.margin, 20, 'batch margin at maximum acquisition cost');
  near(r.maxCostOfGoods, 46 * 0.6675 - 0.3 / 3 - 5 - 1, 'batch maximum acquisition cost');
});

test('reports an unreachable target margin when fees leave no margin room', () => {
  const r = calculateOrder({ price: 10, finalValueRate: 80, targetMargin: 20 });
  assert.equal(r.targetMarginPrice, Infinity);
});

test('ROI is null when no cash was invested', () => {
  const r = calculateOrder({ price: 20, shippingCharged: 0, costOfGoods: 0, shippingCost: 0, packagingCost: 0, otherCost: 0 });
  assert.equal(r.roi, null);
  assert.equal(r.cashRecoveryPct, null);
  near(r.cashSurplus, r.profit, 'zero-investment surplus agrees with profit');
});

test('sourcing ceiling is the buy cost that still hits the target ROI', () => {
  const input = { price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 12, shippingCost: 5, packagingCost: 1 };
  const ceiling = calculateSourcingCeiling(input, 50);
  near(ceiling.maximumAcquisitionCost, ((40 + 6) * (1 - 0.1325) - 0.3 - 5 - 1 - 0.5 * (5 + 1)) / 1.5, '50% ROI sourcing ceiling');
  const atCeiling = calculateOrder({ ...input, costOfGoods: ceiling.maximumAcquisitionCost });
  near(atCeiling.roi, 50, 'ROI at sourcing ceiling');
  assert.equal(ceiling.isReachable, true);
  assert.equal(ceiling.amountOverCeiling, 0);
});

test('sourcing ceiling stays per item across batches and flags unreachable targets', () => {
  const input = { price: 40, shippingCharged: 6, quantity: 3, finalValueRate: 13.25, fixedFee: 0.3, shippingCost: 5, packagingCost: 1 };
  const single = calculateSourcingCeiling({ ...input, quantity: 1 }, 100);
  const batch = calculateSourcingCeiling(input, 100);
  near(batch.maximumAcquisitionCost, single.maximumAcquisitionCost, 'batch ceiling remains per item');
  near(batch.maximumBatchAcquisitionCost, batch.maximumAcquisitionCost * 3, 'batch buy budget is the per-item ceiling times units');
  near(single.maximumBatchAcquisitionCost, single.maximumAcquisitionCost, 'one unit budget matches the per-item ceiling');
  assert.equal(calculateSourcingCeiling({ price: 10, finalValueRate: 90, shippingCost: 5 }, 100).isReachable, false);
  assert.throws(() => calculateSourcingCeiling(input, -1), /non-negative/);
});

test('sourcing ceiling does not hide invalid acquisition costs', () => {
  assert.throws(() => calculateSourcingCeiling({ price: 40, costOfGoods: 'not-a-number' }, 50), /Cost of goods/);
  assert.throws(() => calculateSourcingCeiling({ price: 40, costOfGoods: -1 }, 50), /Cost of goods/);
  assert.throws(() => calculateSourcingCeiling({ price: 40, quantity: 1.5 }, 50), /whole number/);
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
  near(batch.feeTotal, (single.feeTotal - single.fees.fixed) * 3 + single.fees.fixed, 'batch fees charge the fixed fee once');
  near(batch.cashInvested, single.cashInvested * 3, 'batch investment');
  near(batch.profit, batch.revenue - batch.feeTotal - batch.cashInvested, 'batch profit');
  near(batch.cashRecovered, batch.revenue - batch.feeTotal, 'batch cash recovered');
  near(batch.cashSurplus, batch.profit, 'batch cash surplus');
  near(batch.cashRecoveryPct, batch.cashRecovered / batch.cashInvested * 100, 'batch recovery percentage');
  near(batch.unitProfit, batch.profit / 3, 'unit profit');
  assert.ok(batch.breakEvenPrice < single.breakEvenPrice, 'larger batch lowers per-unit break-even');
});

test('spreads one per-order fixed fee across a batch threshold', () => {
  const input = {
    price: 40,
    quantity: 3,
    shippingCharged: 6,
    finalValueRate: 13.25,
    fixedFee: 0.3,
    costOfGoods: 12,
    shippingCost: 5,
    packagingCost: 1,
  };
  const batch = calculateOrder(input);
  near(batch.fees.fixed, 0.3, 'fixed fee charged once per order');
  near(calculateOrder({ ...input, price: batch.breakEvenPrice }).profit, 0, 'batch break-even');
});

// Guards the seller-visible payoff of charging the order fee once: batching
// five units must beat five separate single-unit orders by four fixed fees.
test('batching beats five separate single-unit orders', () => {
  const single = calculateOrder({ price: 40, quantity: 1, fixedFee: 0.3 });
  const batch = calculateOrder({ price: 40, quantity: 5, fixedFee: 0.3 });
  near(batch.fees.fixed, 0.3, 'one fixed fee for the order');
  near(batch.profit - single.profit * 5, 0.3 * 4, 'batch saves four duplicate fixed fees');
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

// Regression: breakEvenReturnRate used to hard-code 0% whenever the
// completed sale already lost money -- the same wrong-branch defect fixed
// in shopify-fee-calculator's breakEvenRefundRate. At 0% returns, this
// order's expected profit is -$16.625, not $0, so "0%" told a seller the
// order was already break-even when it was already a $16.625 loss.
// returnProfit here (-$5) is a smaller loss than completing the sale, but
// it never reaches $0 even at a 100% return rate, so no return rate can
// zero expected profit -- the honest answer is unreachable (Infinity), not
// 0%. Brute force (independent of the formula under test) confirms
// expectedProfit stays negative across the full [0, 100] range.
test('break-even return rate is unreachable, not zero, when returning is a smaller loss but never a gain', () => {
  const r = calculateOrder({
    price: 10, shippingCharged: 0, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 20, shippingCost: 5,
  });
  assert.ok(r.profit < 0, 'losing sale');
  near(r.returnProfit, -5, 'a return is a smaller loss, not a gain');
  assert.equal(r.breakEvenReturnRate, Infinity);
  for (let pct = 0; pct <= 100; pct += 5) {
    const at = calculateOrder({
      price: 10, shippingCharged: 0, finalValueRate: 13.25, fixedFee: 0.3,
      costOfGoods: 20, shippingCost: 5, returnRatePercent: pct,
    });
    assert.ok(at.expectedProfit < 0, `expected profit stays negative at ${pct}% returns, got ${at.expectedProfit}`);
  }
});

// Regression: the same defect, but confirming a genuine reachable
// break-even is still found once profit is negative -- returnProfit can be
// exactly $0 (no unrefunded fees, no sunk shipping/packaging/return-label
// cost) even though the completed sale lost money, and 100% returns is
// then the real -- if extreme -- crossing point, not the 0% the old branch
// reported.
test('break-even return rate solves to 100% when a full-refund return costs nothing and the sale already lost money', () => {
  const r = calculateOrder({
    price: 10, shippingCharged: 0, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 20, shippingCost: 0, packagingCost: 0, otherCost: 0,
    returnShippingCost: 0, feeRefundOnReturnPercent: 100,
  });
  assert.ok(r.profit < 0, 'losing sale');
  near(r.returnProfit, 0, 'a full refund on this order sinks nothing');
  near(r.breakEvenReturnRate, 100, 'only returning every order zeroes expected profit');
  const atBreakEven = calculateOrder({
    price: 10, shippingCharged: 0, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 20, shippingCost: 0, packagingCost: 0, otherCost: 0,
    returnShippingCost: 0, feeRefundOnReturnPercent: 100, returnRatePercent: 100,
  });
  near(atBreakEven.expectedProfit, 0, 'expected profit actually reaches zero at the reported rate');
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

test('a 5% Standard campaign that buys one extra sale still pays after the ad cut', () => {
  const comparison = comparePromotedStandard(offsiteBase);
  assert.equal(comparison.promotedRate, DEFAULT_PROMOTED_STANDARD_RATE);
  assert.equal(comparison.extraOrders, DEFAULT_PROMOTED_STANDARD_EXTRA_ORDERS);
  assert.equal(comparison.monthlyListings, DEFAULT_MONTHLY_PROMOTED_LISTINGS);
  near(comparison.listingExpectedProfit, 18.3445, 'skip after returns');
  near(comparison.extraSaleExpectedProfit, 16.2745, 'one promoted sale after returns');
  near(comparison.skip.expectedProfit, 18.3445, 'skip Standard');
  near(comparison.promote.expectedProfit, 32.549, 'add Standard');
  near(comparison.extraKeptOnPromote, 14.2045, 'Standard gap');
  near(comparison.monthlyExtraOnPromote, 14.2045 * 20, 'twenty listings');
  near(comparison.breakEvenExtraOrders, 18.3445 / 16.2745 - 1, 'extra-sale floor');
  near(comparison.breakEvenPromotedRate, 22.155193236714993, 'rate ceiling');
  near(comparison.noLiftExpectedProfit, 16.2745, 'no-lift leftover');
  near(comparison.adDragOnExistingSale, 2.07, 'ad drag on the sale you already had');
  near(comparison.promotedAdFee, 2.3, '5% of $46');
  assert.equal(comparison.winner, 'promote');
  assert.equal(comparison.skip.adFee, 0);
  assert.equal(comparison.promote.extraOrders, 1);
});

test('break-even extra sales and Standard rate match skip', () => {
  const comparison = comparePromotedStandard(offsiteBase);
  const atOrders = comparePromotedStandard({
    ...offsiteBase,
    promotedStandardExtraOrders: comparison.breakEvenExtraOrders,
  });
  near(atOrders.promote.expectedProfit, atOrders.skip.expectedProfit, 'floor extras tie skip');
  const atRate = comparePromotedStandard({
    ...offsiteBase,
    promotedStandardRate: comparison.breakEvenPromotedRate,
  });
  near(atRate.promote.expectedProfit, atRate.skip.expectedProfit, 'ceiling rate ties skip');
  assert.ok(comparison.breakEvenExtraOrders < 1, 'default one extra is above the floor');
  assert.ok(comparison.breakEvenPromotedRate > 5, 'default 5% is below the ceiling');
});

test('zero extra sales flips skip-Standard ahead by the ad cut', () => {
  const comparison = comparePromotedStandard({ ...offsiteBase, promotedStandardExtraOrders: 0 });
  assert.equal(comparison.winner, 'skip');
  near(comparison.promote.expectedProfit, 16.2745, 'no-lift leftover');
  near(comparison.extraKeptOnPromote, -2.07, 'no-lift gap');
});

test('Promoted Listings Standard note reports both paths without telling the seller which to use', () => {
  const comparison = comparePromotedStandard(offsiteBase);
  const note = promotedStandardNote(comparison);
  assert.match(note, /Skip Promoted Listings/);
  assert.match(note, /\$18\.34/);
  assert.match(note, /5% Standard campaign/);
  assert.match(note, /1 extra sale/);
  assert.match(note, /\$32\.55/);
  assert.match(note, /\$14\.20 more/);
  assert.match(note, /\$16\.27/);
  assert.match(note, /\$2\.07 less/);
  assert.match(note, /0\.13/);
  assert.doesNotMatch(note, /should turn on|must promote|enroll/i);
});

test('rejects a missing price, a rate above 100%, and a missing Standard comparison', () => {
  assert.throws(() => comparePromotedStandard({ price: -1 }), /Item price/);
  assert.throws(() => comparePromotedStandard({ ...offsiteBase, promotedStandardRate: 101 }), /at most 100/);
  assert.throws(() => comparePromotedStandard({ ...offsiteBase, promotedStandardExtraOrders: -1 }), /Extra Standard orders/);
  assert.throws(() => promotedStandardNote({}), /missing rows/);
});

test('a $0.40 CPC Advanced campaign on 40 clicks that buys one extra sale still pays after the bill', () => {
  const comparison = comparePromotedAdvanced(offsiteBase);
  assert.equal(comparison.cpc, DEFAULT_ADVANCED_CPC);
  assert.equal(comparison.clicks, DEFAULT_ADVANCED_CLICKS);
  assert.equal(comparison.extraOrders, DEFAULT_ADVANCED_EXTRA_ORDERS);
  assert.equal(comparison.monthlyCampaigns, DEFAULT_MONTHLY_ADVANCED_CAMPAIGNS);
  near(comparison.adSpend, 16, '40 clicks at $0.40');
  near(comparison.listingExpectedProfit, 18.3445, 'skip after returns');
  near(comparison.extraSaleExpectedProfit, 18.3445, 'one extra organic sale after returns');
  near(comparison.skip.expectedProfit, 18.3445, 'skip Advanced');
  near(comparison.advanced.expectedProfit, 20.689, 'add Advanced');
  near(comparison.extraKeptOnAdvanced, 2.3445, 'Advanced gap');
  near(comparison.monthlyExtraOnAdvanced, 2.3445 * 20, 'twenty campaigns');
  near(comparison.breakEvenExtraOrders, 16 / 18.3445, 'extra-sale floor');
  near(comparison.breakEvenCpc, 18.3445 / 40, 'CPC ceiling');
  near(comparison.breakEvenClicks, 18.3445 / 0.4, 'click ceiling');
  near(comparison.noLiftExpectedProfit, 2.3445, 'bill with no extra sales');
  near(comparison.costPerExtraSale, 16, 'spend per extra sale');
  near(comparison.conversionPct, 2.5, '1 / 40');
  near(comparison.breakEvenConversionPct, 16 / 18.3445 / 40 * 100, 'conversion floor');
  assert.equal(comparison.winner, 'advanced');
  assert.equal(comparison.skip.adSpend, 0);
  assert.equal(comparison.advanced.clicks, 40);
});

test('break-even extra sales, CPC, and clicks match skip-Advanced', () => {
  const comparison = comparePromotedAdvanced(offsiteBase);
  const atOrders = comparePromotedAdvanced({
    ...offsiteBase,
    advancedExtraOrders: comparison.breakEvenExtraOrders,
  });
  near(atOrders.advanced.expectedProfit, atOrders.skip.expectedProfit, 'floor extras tie skip');
  const atCpc = comparePromotedAdvanced({
    ...offsiteBase,
    advancedCpc: comparison.breakEvenCpc,
  });
  near(atCpc.advanced.expectedProfit, atCpc.skip.expectedProfit, 'ceiling CPC ties skip');
  const atClicks = comparePromotedAdvanced({
    ...offsiteBase,
    advancedClicks: Math.round(comparison.breakEvenClicks),
  });
  // 46 clicks at $0.40 is $18.40, just above the $18.3445 extra-sale leftover.
  assert.ok(atClicks.advanced.expectedProfit < atClicks.skip.expectedProfit, '46 clicks overshoots skip');
  const atFloorClicks = comparePromotedAdvanced({
    ...offsiteBase,
    advancedClicks: 45,
  });
  assert.ok(atFloorClicks.advanced.expectedProfit > atFloorClicks.skip.expectedProfit, '45 clicks still pays');
  assert.ok(comparison.breakEvenExtraOrders < 1, 'default one extra is above the floor');
  assert.ok(comparison.breakEvenCpc > 0.4, 'default $0.40 is below the ceiling');
});

test('zero extra Advanced sales flips skip ahead by the click bill', () => {
  const comparison = comparePromotedAdvanced({ ...offsiteBase, advancedExtraOrders: 0 });
  assert.equal(comparison.winner, 'skip');
  near(comparison.advanced.expectedProfit, 2.3445, 'organic leftover minus $16');
  near(comparison.extraKeptOnAdvanced, -16, 'no-lift gap');
});

test('Advanced extra sales that also pay Standard still subtract the click bill', () => {
  const comparison = comparePromotedAdvanced({
    ...offsiteBase,
    advancedPromotedRate: 5,
  });
  near(comparison.extraSaleExpectedProfit, 16.2745, '5% Standard on the extra sale');
  near(comparison.advanced.expectedProfit, 18.3445 + 16.2745 - 16, 'skip + extra after Standard − bill');
  near(comparison.extraKeptOnAdvanced, 16.2745 - 16, 'extra after Standard minus $16');
});

test('Promoted Listings Advanced note reports both paths without telling the seller which to use', () => {
  const comparison = comparePromotedAdvanced(offsiteBase);
  const note = promotedAdvancedNote(comparison);
  assert.match(note, /Skip Promoted Listings Advanced/);
  assert.match(note, /\$18\.34/);
  assert.match(note, /\$0\.40 CPC campaign/);
  assert.match(note, /40 clicks/);
  assert.match(note, /\$16\.00 billed either way/);
  assert.match(note, /1 extra sale/);
  assert.match(note, /\$20\.69/);
  assert.match(note, /\$2\.34 more/);
  assert.match(note, /\$2\.34/);
  assert.match(note, /\$16\.00 less than skip/);
  assert.match(note, /0\.87/);
  assert.doesNotMatch(note, /should turn on|must promote|enroll/i);
});

test('rejects a missing price, a fractional click count, and a missing Advanced comparison', () => {
  assert.throws(() => comparePromotedAdvanced({ price: -1 }), /Item price/);
  assert.throws(() => comparePromotedAdvanced({ ...offsiteBase, advancedCpc: -1 }), /Promoted Listings Advanced CPC/);
  assert.throws(() => comparePromotedAdvanced({ ...offsiteBase, advancedClicks: 40.5 }), /whole number/);
  assert.throws(() => comparePromotedAdvanced({ ...offsiteBase, advancedExtraOrders: -1 }), /Extra Advanced orders/);
  assert.throws(() => comparePromotedAdvanced({ ...offsiteBase, advancedPromotedRate: 101 }), /at most 100/);
  assert.throws(() => promotedAdvancedNote({}), /missing rows/);
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

const MANAGED_BASE = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1,
};

test('defaults match the published Managed Returns mix', () => {
  assert.equal(DEFAULT_SELF_RETURN_LABEL, 8);
  assert.equal(DEFAULT_SELF_RETURN_RATE, 10);
  assert.equal(DEFAULT_MANAGED_RETURN_FEE, 5.5);
  assert.equal(DEFAULT_MANAGED_RETURN_RATE, 14);
  assert.equal(DEFAULT_BUYER_PAYS_RETURN_RATE, 6);
  assert.equal(DEFAULT_MONTHLY_MANAGED_LISTINGS, 40);
});

test('a higher Managed Returns rate wipes the cheaper program fee', () => {
  // Completed sale $21.605. Self-label $8 at 10%: expected $18.0445.
  // Managed $5.50 at 14%: expected $16.9703. Buyer-pays $0 at 6%: $19.9487.
  const r = compareManagedReturns(MANAGED_BASE);
  near(r.completedProfit, 21.605, 'completed sale');
  near(r.self.expectedProfit, 18.0445, 'self-label mix');
  near(r.managed.expectedProfit, 16.9703, 'managed mix');
  near(r.buyerPays.expectedProfit, 19.9487, 'buyer-pays mix');
  near(r.extraKeptOnManaged, 16.9703 - 18.0445, 'managed vs self');
  near(r.extraKeptOnBuyerPays, 19.9487 - 18.0445, 'buyer vs self');
  near(r.monthlyExtraOnManaged, (16.9703 - 18.0445) * 40, 'forty listings');
  near(r.breakEvenManagedRate, 10.755172934602024, 'rate ceiling');
  assert.equal(r.winner, 'buyer_pays');
  assert.ok(r.buyerPays.expectedProfit > r.self.expectedProfit, 'buyer-pays beats self-label');
  assert.ok(r.self.expectedProfit > r.managed.expectedProfit, 'self-label beats the extra returns');
});

test('the same return rate makes the cheaper Managed Returns fee win versus self-label', () => {
  const r = compareManagedReturns({ ...MANAGED_BASE, managedReturnRatePercent: 10 });
  near(r.extraKeptOnManaged, 0.25, 'label save at matched rate');
  assert.ok(r.managed.expectedProfit > r.self.expectedProfit, 'cheaper label wins when rates match');
  assert.equal(r.winner, 'buyer_pays');
});

test('dedicated self-label fields win over the headline return mix', () => {
  const r = compareManagedReturns({
    ...MANAGED_BASE,
    returnShippingCost: 5,
    returnRatePercent: 8,
    selfReturnShippingCost: 8,
    selfReturnRatePercent: 10,
  });
  near(r.selfLabel, 8, 'dedicated label');
  near(r.self.returnRatePercent, 10, 'dedicated rate');
  near(r.self.expectedProfit, 18.0445, 'published mix still used');
});

test('empty Managed Returns fields use the published defaults', () => {
  const r = compareManagedReturns(MANAGED_BASE);
  near(r.selfLabel, DEFAULT_SELF_RETURN_LABEL, 'default label');
  near(r.managedFee, DEFAULT_MANAGED_RETURN_FEE, 'default fee');
  near(r.managed.returnRatePercent, DEFAULT_MANAGED_RETURN_RATE, 'default managed rate');
});

test('compareManagedReturns rejects an impossible rate or zero month', () => {
  assert.throws(() => compareManagedReturns({ ...MANAGED_BASE, managedReturnRatePercent: 101 }), /Managed Returns rate/);
  assert.throws(() => compareManagedReturns({ ...MANAGED_BASE, monthlyManagedListings: 0 }), /Monthly listings/);
  assert.throws(() => compareManagedReturns({ ...MANAGED_BASE, managedReturnFee: -1 }), /Managed Returns fee/);
  assert.throws(() => compareManagedReturns({ price: -1 }), /Item price/);
});

test('summary names the extra returns and the rate ceiling', () => {
  const text = compareManagedReturns(MANAGED_BASE).summary;
  assert.match(text, /\$5\.50/);
  assert.match(text, /\$1\.07 less/);
  assert.match(text, /10\.8%/);
  assert.match(text, /\$1\.90 more/);
  assert.doesNotMatch(text, /should enroll|must join|turn on Managed/i);
  assert.equal(text, managedReturnsNote(compareManagedReturns(MANAGED_BASE)));
  assert.throws(() => managedReturnsNote({}), /missing rows/);
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

const STORE_BASE = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1,
};

test('defaults match the published store mix', () => {
  assert.equal(DEFAULT_MONTHLY_STORE_ORDERS, 40);
  assert.equal(DEFAULT_MONTHLY_STORE_FEE, 0);
  assert.equal(STORE_TIER_PRESETS[0].monthlyFee, 7.95);
  assert.equal(STORE_TIER_PRESETS[0].finalValueRate, 12.95);
  assert.equal(STORE_TIER_PRESETS[1].monthlyFee, 27.95);
  assert.equal(STORE_TIER_PRESETS[2].monthlyFee, 74.95);
});

test('forty $40 sales leave Starter $2.43 behind the no-store rate', () => {
  const r = compareStoreTiers(STORE_BASE);
  near(r.current.profit, 21.605, 'completed sale');
  near(r.current.monthlyProfit, 864.2, 'forty no-store sales');
  near(r.starter.profit, 21.743, 'starter sale');
  near(r.starter.monthlyProfit, 861.77, 'starter month');
  near(r.extraKeptOnStarter, -2.43, 'starter vs no store');
  near(r.basic.monthlyProfit, 849.13, 'basic month');
  near(r.premium.monthlyProfit, 815.01, 'premium month');
  near(r.starter.breakEvenOrders, 57.60869565217378, 'starter floor');
  near(r.basic.breakEvenOrders, 86.80124223602493, 'basic floor');
  near(r.premium.breakEvenOrders, 116.38198757763972, 'premium floor');
  assert.equal(r.winner, 'current');
  assert.ok(r.current.monthlyProfit > r.starter.monthlyProfit, 'no store beats Starter at 40');
});

test('eighty of the same sales flip Starter ahead', () => {
  const r = compareStoreTiers({ ...STORE_BASE, monthlyStoreOrders: 80 });
  near(r.extraKeptOnStarter, 3.09, 'starter at 80');
  assert.equal(r.winner, 'starter');
});

test('a store rate that is not cheaper never recovers the subscription', () => {
  assert.equal(storeBreakEvenOrders({
    revenue: 46,
    currentFinalValueRate: 12.95,
    storeFinalValueRate: 13.25,
    monthlyFee: 7.95,
  }), Infinity);
});

test('empty store fields use the published defaults', () => {
  const r = compareStoreTiers(STORE_BASE);
  near(r.monthlyOrders, DEFAULT_MONTHLY_STORE_ORDERS, 'default volume');
  near(r.currentStoreFee, DEFAULT_MONTHLY_STORE_FEE, 'default fee');
  near(r.starter.monthlyFee, 7.95, 'example Starter');
});

test('dedicated monthlyStoreOrders wins over a leftover monthlyOrders alias', () => {
  const r = compareStoreTiers({ ...STORE_BASE, monthlyOrders: 10, monthlyStoreOrders: 80 });
  near(r.monthlyOrders, 80, 'dedicated field');
  assert.equal(r.winner, 'starter');
});

test('compareStoreTiers rejects an impossible month or missing price', () => {
  assert.throws(() => compareStoreTiers({ ...STORE_BASE, monthlyStoreOrders: 0 }), /Monthly store orders/);
  assert.throws(() => compareStoreTiers({ ...STORE_BASE, monthlyStoreOrders: 1.5 }), /Monthly store orders/);
  assert.throws(() => compareStoreTiers({ ...STORE_BASE, monthlyStoreFee: -1 }), /Current monthly store fee/);
  assert.throws(() => compareStoreTiers({ price: -1 }), /Item price/);
  assert.throws(() => compareStoreTiers(STORE_BASE, []), /At least one store tier/);
});

test('store note names the $2.43 gap and the 58-sale floor', () => {
  const text = compareStoreTiers(STORE_BASE).summary;
  assert.match(text, /\$7\.95/);
  assert.match(text, /12\.95%/);
  assert.match(text, /\$2\.43 less/);
  assert.match(text, /13\.25%/);
  assert.match(text, /58 of these sales/);
  assert.doesNotMatch(text, /should subscribe|must enroll|buy a store/i);
  assert.equal(text, storeTiersNote(compareStoreTiers(STORE_BASE)));
  assert.throws(() => storeTiersNote({}), /missing rows/);
});

test('store break-even is monthly fee divided by final-value savings per order', () => {
  // $46 revenue × 0.30% lower FVF = $0.138 saved per order. $7.95 / $0.138
  // is the volume where a $7.95 Starter example starts to pay.
  const orders = storeBreakEvenOrders({
    revenue: 46, currentFinalValueRate: 13.25, storeFinalValueRate: 12.95, monthlyFee: 7.95,
  });
  near(orders, 7.95 / 0.138, 'starter break-even orders');
});

test('Basic example wins once volume covers its fee and still beats Starter', () => {
  const r = compareStoreTiers({ ...STORE_BASE, monthlyStoreOrders: 120 });
  near(r.starter.monthlyProfit - r.current.monthlyProfit, 120 * 0.138 - 7.95, 'starter at 120');
  near(r.basic.monthlyProfit - r.current.monthlyProfit, 120 * 0.322 - 27.95, 'basic at 120');
  near(r.premium.monthlyProfit - r.current.monthlyProfit, 120 * 0.644 - 74.95, 'premium at 120');
  assert.equal(r.winner, 'basic');
  assert.ok(r.basic.monthlyProfit > r.starter.monthlyProfit);
  near(r.basic.breakEvenOrders, 27.95 / 0.322, 'basic break-even');
});

test('current monthly store fee is deducted from the stay-put row', () => {
  const r = compareStoreTiers({ ...STORE_BASE, monthlyStoreFee: 27.95, finalValueRate: 12.55 });
  const order = calculateOrder({ ...STORE_BASE, finalValueRate: 12.55 });
  near(r.current.monthlyProfit, order.profit * 40 - 27.95, 'current includes the store already paid');
  assert.ok(r.starter, 'starter row still compared');
  assert.ok(r.starter.monthlyProfit !== r.current.monthlyProfit);
});

test('skips a preset that is identical to the seller\'s current setup', () => {
  const r = compareStoreTiers({
    ...STORE_BASE, finalValueRate: 12.95, monthlyStoreFee: 7.95,
  });
  assert.deepEqual(r.rows.map((row) => row.id), ['current', 'basic', 'premium']);
  assert.equal(r.starter, undefined);
});

test('carries batch quantity into every store-tier order', () => {
  const input = { ...STORE_BASE, quantity: 3 };
  const r = compareStoreTiers(input, [{ id: 'starter', label: 'Starter (example)', monthlyFee: 7.95, finalValueRate: 12.95 }]);
  const direct = calculateOrder({ ...input, finalValueRate: 12.95 });
  near(r.starter.profit, direct.profit, 'batch order profit');
  near(r.starter.revenue, 46 * 3, 'batch revenue');
});

const OFFER_BASE = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1, targetMargin: 20,
};

test('defaults match the published Best Offer mix', () => {
  assert.equal(DEFAULT_INCOMING_BEST_OFFER, 34);
  assert.equal(DEFAULT_INCOMING_WAIT_CHANCE, 50);
});

test('a $34 offer keeps $5.60 more than waiting at a 50% chance of list', () => {
  const comparison = compareBestOffer(OFFER_BASE);
  near(comparison.listing.profit, 21.605, 'list profit');
  near(comparison.offer.price, 34, 'offer price');
  near(comparison.offer.profit, 16.4, 'offer profit');
  near(comparison.offer.margin, 41, 'offer margin');
  near(comparison.cashLeftOnTable, 5.205, 'cash left on the table');
  near(comparison.midpoint.price, 37, 'midpoint counter');
  near(comparison.expectedWaitProfit, 10.8025, '50% of list profit');
  near(comparison.extraKeptOnAccept, 5.5975, 'offer vs wait');
  near(comparison.waitChanceCeiling, 16.4 / 21.605 * 100, 'chance ceiling');
  assert.equal(comparison.aboveBreakEven, true);
  assert.equal(comparison.meetsTargetMargin, true);
  assert.equal(comparison.acceptBeatsWait, true);
  assert.equal(comparison.winner, 'offer');
  const rows = bestOfferRows(comparison);
  assert.deepEqual(rows.map((row) => row.kind), ['wait', 'offer', 'midpoint', 'target']);
});

test('flags an offer that still pays but misses the target margin', () => {
  const comparison = compareBestOffer({ ...OFFER_BASE, incomingBestOffer: 16 });
  near(comparison.offer.profit, 0.785, 'thin offer profit');
  assert.equal(comparison.aboveBreakEven, true);
  assert.equal(comparison.meetsTargetMargin, false);
  assert.equal(comparison.acceptBeatsWait, false);
  assert.equal(comparison.winner, 'wait');
  assert.match(bestOfferNote(comparison), /misses your target margin/);
  assert.match(bestOfferNote(comparison), /Counter \$21\.42/);
});

test('flags a Best Offer that loses money after fees', () => {
  const comparison = compareBestOffer({ ...OFFER_BASE, incomingBestOffer: 15 });
  near(comparison.offer.profit, -0.0825, 'below break-even');
  assert.equal(comparison.aboveBreakEven, false);
  assert.equal(comparison.acceptBeatsWait, false);
  assert.match(bestOfferNote(comparison), /loses \$0\.08/);
  assert.match(bestOfferNote(comparison), /Counter at least \$15\.10/);
  assert.match(bestOfferNote(comparison), /No chance of list makes this losing offer match waiting/);
  assert.doesNotMatch(bestOfferNote(comparison), /-\d/);
});

test('waiting wins when the seller is sure the item still sells at list', () => {
  const comparison = compareBestOffer({ ...OFFER_BASE, incomingWaitChancePct: 100 });
  assert.equal(comparison.winner, 'wait');
  assert.equal(comparison.acceptBeatsWait, false);
  near(comparison.expectedWaitProfit, 21.605, 'sure list');
  near(comparison.extraKeptOnAccept, 16.4 - 21.605, 'offer vs sure list');
});

test('empty Best Offer fields use the published defaults', () => {
  const r = compareBestOffer(OFFER_BASE);
  near(r.offer.price, DEFAULT_INCOMING_BEST_OFFER, 'default offer');
  near(r.chanceOfFullPricePct, DEFAULT_INCOMING_WAIT_CHANCE, 'default chance');
});

test('dedicated incomingBestOffer wins over a leftover bestOffer alias', () => {
  const r = compareBestOffer({ ...OFFER_BASE, bestOffer: 15, incomingBestOffer: 34 });
  near(r.offer.price, 34, 'dedicated field');
  assert.equal(r.winner, 'offer');
});

test('compareBestOffer rejects an impossible chance or missing price', () => {
  assert.throws(() => compareBestOffer({ ...OFFER_BASE, incomingWaitChancePct: 101 }), /at most 100/);
  assert.throws(() => compareBestOffer({ ...OFFER_BASE, incomingBestOffer: -1 }), /Best offer/);
  assert.throws(() => compareBestOffer({ price: -1 }), /Item price/);
});

test('Best Offer note names the $5.60 gap and the 75.9% chance floor', () => {
  const text = compareBestOffer(OFFER_BASE).summary;
  assert.match(text, /\$34\.00/);
  assert.match(text, /\$16\.40/);
  assert.match(text, /41\.0% margin/);
  assert.match(text, /\$5\.21 less/);
  assert.match(text, /\$5\.60 more/);
  assert.match(text, /50% chance/);
  assert.match(text, /75\.9% chance/);
  assert.doesNotMatch(text, /should accept|must take|decline this/i);
  assert.equal(text, bestOfferNote(compareBestOffer(OFFER_BASE)));
  assert.equal(text, bestOfferSummary(compareBestOffer(OFFER_BASE)));
  assert.throws(() => bestOfferNote({}), /missing rows/);
});

const FREE_SHIP_BASE = {
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

test('defaults match the published free-shipping mix', () => {
  assert.equal(DEFAULT_BUYER_PAYS_SHIP_SELL_THROUGH, 55);
  assert.equal(DEFAULT_FREE_SHIP_SELL_THROUGH, 70);
  assert.equal(DEFAULT_MONTHLY_FREE_SHIP_LISTINGS, 40);
});

test('baking shipping charged into the item is cash-identical per completed sale', () => {
  const r = compareFreeShipping(FREE_SHIP_BASE);
  near(r.buyerPays.completedProfit, 21.605, 'completed buyer-pays');
  near(r.freeShip.completedProfit, 21.605, 'completed free-ship');
  near(r.buyerPays.soldExpectedProfit, 18.3445, 'buyer-pays after returns');
  near(r.freeShip.soldExpectedProfit, 18.3445, 'baked free-ship after returns');
  near(r.extraPackedOnFreeShip, 0, 'same leftover after bake-in');
  near(r.buyerPays.expectedProfit, 10.089475, 'buyer-pays after 55%');
  near(r.freeShip.expectedProfit, 12.84115, 'free-ship after 70%');
  near(r.extraKeptOnFreeShip, 2.751675, 'sell-through lift');
  near(r.monthlyExtraOnFreeShip, 2.751675 * 40, 'forty listings');
  near(r.breakEvenFreeShipSellThroughPct, 55, 'sell-through floor');
  near(r.breakEvenFreeShipPrice, 40.9651434060656, 'list that ties at 70%');
  near(r.bakeInPrice, 46, 'bake-in');
  near(r.underBake, 0, 'no under-bake');
  assert.equal(r.winner, 'free_ship');
});

test('leaving the list at $40 loses after the postage you still buy', () => {
  const r = compareFreeShipping({ ...FREE_SHIP_BASE, freeShipPrice: 40 });
  near(r.freeShip.soldExpectedProfit, 13.66, 'under-baked sale');
  near(r.freeShip.expectedProfit, 9.562, 'under-baked listing');
  near(r.extraKeptOnFreeShip, 9.562 - 10.089475, 'loses versus buyer-pays');
  near(r.breakEvenFreeShipSellThroughPct, 73.86145680819912, 'needs more sell-through');
  assert.equal(r.winner, 'buyer_pays');
});

test('a $44 free-ship list still beats buyer-pays after the typed lift', () => {
  const r = compareFreeShipping({ ...FREE_SHIP_BASE, freeShipPrice: 44 });
  near(r.freeShip.soldExpectedProfit, 16.783, 'partial bake-in');
  near(r.freeShip.expectedProfit, 11.7481, 'partial bake-in listing');
  near(r.extraKeptOnFreeShip, 1.658625, 'still ahead');
  assert.equal(r.winner, 'free_ship');
});

test('matched sell-through on a baked-in list is a tie', () => {
  const r = compareFreeShipping({ ...FREE_SHIP_BASE, freeShipSellThroughPct: 55 });
  near(r.extraKeptOnFreeShip, 0, 'same leftover');
  assert.equal(r.winner, 'tie');
});

test('50% free-ship sell-through loses even when the list is baked in', () => {
  const r = compareFreeShipping({ ...FREE_SHIP_BASE, freeShipSellThroughPct: 50 });
  near(r.freeShip.expectedProfit, 9.17225, '50% listing');
  near(r.extraKeptOnFreeShip, -0.917225, 'loses the lift');
  assert.equal(r.winner, 'buyer_pays');
});

test('empty free-shipping fields use the published defaults', () => {
  const r = compareFreeShipping(FREE_SHIP_BASE);
  near(r.freeShipPrice, 46, 'default bake-in');
  near(r.buyerPaysSellThroughPct, DEFAULT_BUYER_PAYS_SHIP_SELL_THROUGH, 'default buyer ST');
  near(r.freeShipSellThroughPct, DEFAULT_FREE_SHIP_SELL_THROUGH, 'default free ST');
  near(r.monthlyFreeShipListings, DEFAULT_MONTHLY_FREE_SHIP_LISTINGS, 'default month');
});

test('compareFreeShipping rejects an impossible rate or negative list', () => {
  assert.throws(() => compareFreeShipping({ ...FREE_SHIP_BASE, freeShipSellThroughPct: 101 }), /Free-shipping sell-through/);
  assert.throws(() => compareFreeShipping({ ...FREE_SHIP_BASE, buyerPaysSellThroughPct: 101 }), /Buyer-pays sell-through/);
  assert.throws(() => compareFreeShipping({ ...FREE_SHIP_BASE, freeShipPrice: -1 }), /Free-shipping list price/);
  assert.throws(() => compareFreeShipping({ price: -1 }), /Item price/);
});

test('summary names the bake-in leftover and the sell-through floor', () => {
  const text = compareFreeShipping(FREE_SHIP_BASE).summary;
  assert.match(text, /\$10\.09/);
  assert.match(text, /\$12\.84/);
  assert.match(text, /\$2\.75 more/);
  assert.match(text, /\$18\.34/);
  assert.match(text, /55\.0%/);
  assert.match(text, /\$40\.97/);
  assert.doesNotMatch(text, /should offer free shipping|must offer free|turn on free shipping/i);
  assert.equal(text, freeShippingNote(compareFreeShipping(FREE_SHIP_BASE)));
  assert.throws(() => freeShippingNote({}), /missing rows/);
});

const INTL_BASE = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1, targetMargin: 20,
};

test('defaults match the published international mix', () => {
  assert.equal(ILLUSTRATIVE_INTL_FEE_RATE, 1.65);
  assert.equal(DEFAULT_INTL_EXTRA_SHIPPING, 12);
});

test('worldwide at the same $40 list keeps less than domestic only', () => {
  const comparison = compareInternational(INTL_BASE);
  near(comparison.domesticProfit, 21.605, 'domestic profit');
  near(comparison.buyerPaysProfit, 20.846, 'buyer-pays profit');
  near(comparison.youShipProfit, 8.846, 'you-ship profit');
  near(comparison.extraKeptOnBuyerPays, -0.759, 'intl fee drag');
  near(comparison.extraKeptOnYouShip, -12.759, 'fee plus extra postage');
  near(comparison.rows[1].holdPrice, 40.89, 'buyer-pays hold price');
  near(comparison.rows[2].holdPrice, 54.99, 'you-ship hold price');
  assert.equal(comparison.usedIllustrativeIntlRate, true);
  assert.equal(comparison.winner, 'domestic');
  assert.equal(comparison.rows.filter((row) => row.winner).length, 1);
});

test('a typed international fee replaces the illustrative rate', () => {
  const comparison = compareInternational({ ...INTL_BASE, intlFeeRate: 2.5 });
  assert.equal(comparison.usedIllustrativeIntlRate, false);
  near(comparison.intlFeeRate, 2.5, 'typed rate');
  near(comparison.buyerPaysProfit, 20.455, '2.5% of $46');
});

test('zero extra postage makes you-ship match buyer-pays', () => {
  const comparison = compareInternational({ ...INTL_BASE, intlExtraShipping: 0 });
  near(comparison.buyerPaysProfit, comparison.youShipProfit, 'same leftover');
  assert.equal(comparison.winner, 'domestic');
});

test('expected leftover after a 10% return still ranks domestic first', () => {
  const comparison = compareInternational({
    ...INTL_BASE,
    returnRatePercent: 10,
    returnShippingCost: 5,
    feeRefundOnReturnPercent: 100,
  });
  near(comparison.domesticExpectedProfit, 18.3445, 'domestic after returns');
  near(comparison.rows[1].expectedProfit, 17.6614, 'buyer-pays after returns');
  near(comparison.rows[2].expectedProfit, 5.6614, 'you-ship after returns');
  assert.equal(comparison.winner, 'domestic');
});

test('compareInternational rejects a missing price', () => {
  assert.throws(() => compareInternational({}), /Item price/);
  assert.throws(() => compareInternational({ price: -1 }), /Item price/);
  assert.throws(() => compareInternational({ ...INTL_BASE, intlExtraShipping: -1 }), /Extra international/);
});

test('international note names the $0.76 fee drag and the $40.89 hold price', () => {
  const text = compareInternational(INTL_BASE).summary;
  assert.match(text, /\$21\.61/);
  assert.match(text, /1\.65%/);
  assert.match(text, /\$0\.76 less/);
  assert.match(text, /\$20\.85/);
  assert.match(text, /\$40\.89/);
  assert.match(text, /\$12\.76 less/);
  assert.match(text, /\$8\.85/);
  assert.match(text, /\$54\.99/);
  assert.doesNotMatch(text, /should offer|must ship worldwide|turn international on/i);
  assert.equal(text, internationalNote(compareInternational(INTL_BASE)));
  assert.equal(text, internationalSummary(compareInternational(INTL_BASE)));
  assert.throws(() => internationalNote({}), /missing rows/);
});

const PROTECT_BASE = {
  price: 40,
  shippingCharged: 6,
  finalValueRate: 13.25,
  fixedFee: 0.3,
  costOfGoods: 12,
  shippingCost: 5,
  packagingCost: 1,
  returnRatePercent: 10,
  returnShippingCost: 5,
  feeRefundOnReturnPercent: 100,
};

test('skip insurance on the default $40 SKU still beats a $1.80 premium', () => {
  const comparison = comparePackageProtection(PROTECT_BASE);
  near(comparison.skip.expectedProfit, 17.4358875, 'skip after 2.5% claims');
  near(comparison.insure.expectedProfit, 16.434433, 'insure after leftover claims');
  near(comparison.signature.expectedProfit, 14.749122, 'signature after leftover claims');
  near(comparison.skip.claimProfit, -18, 'skip claim is sunk cost');
  near(comparison.insure.claimProfit, -1.8, 'insured claim leftover is the premium');
  near(comparison.extraKeptOnInsure, -1.0014545, 'insurance drag');
  near(comparison.monthlyExtraOnInsure, -40.05818, 'forty shipments');
  near(comparison.breakEvenSkipClaimRate, 5.255449930525944, 'skip claim floor');
  near(comparison.breakEvenInsurancePremium, 0.7985455, 'premium ceiling');
  assert.equal(comparison.winner, 'skip');
  assert.equal(comparison.insurancePayout, 18);
  assert.equal(comparison.usedDefaultPayout, true);
  assert.equal(comparison.skipClaimRate, DEFAULT_SKIP_CLAIM_RATE);
  assert.equal(comparison.insurancePremium, DEFAULT_INSURANCE_PREMIUM);
  assert.equal(comparison.insuranceClaimRate, DEFAULT_INSURANCE_CLAIM_RATE);
  assert.equal(comparison.signatureFee, DEFAULT_SIGNATURE_FEE);
  assert.equal(comparison.signatureClaimRate, DEFAULT_SIGNATURE_CLAIM_RATE);
  assert.equal(comparison.monthlyShipments, DEFAULT_MONTHLY_PROTECTION_SHIPMENTS);
});

test('an 8% skip claim rate flips insurance ahead on the same $40 SKU', () => {
  const comparison = comparePackageProtection({ ...PROTECT_BASE, skipClaimRatePercent: 8 });
  near(comparison.skip.expectedProfit, 15.43694, '8% skip claims');
  near(comparison.insure.expectedProfit, 16.434433, 'insured leftover unchanged');
  assert.equal(comparison.winner, 'insure');
});

test('a high-COGS $180 SKU flips insurance ahead at the default 2.5% claim rate', () => {
  const comparison = comparePackageProtection({
    ...PROTECT_BASE,
    price: 180,
    shippingCharged: 12,
    costOfGoods: 85,
    shippingCost: 12,
    packagingCost: 2,
    returnShippingCost: 12,
  });
  near(comparison.skip.expectedProfit, 54.01065, 'high-ticket skip');
  near(comparison.insure.expectedProfit, 55.786396, 'high-ticket insure');
  near(comparison.extraKeptOnInsure, 1.775746, 'insurance save');
  near(comparison.breakEvenSkipClaimRate, 1.3684759198134164, '1.4% floor');
  assert.equal(comparison.winner, 'insure');
  assert.equal(comparison.insurancePayout, 99);
});

test('a typed insurance payout replaces the replacement-value default', () => {
  const comparison = comparePackageProtection({ ...PROTECT_BASE, insurancePayout: 46 });
  assert.equal(comparison.usedDefaultPayout, false);
  near(comparison.insurancePayout, 46, 'retail declaration');
  assert.ok(comparison.insure.claimProfit > comparison.skip.claimProfit);
});

test('comparePackageProtection rejects impossible inputs', () => {
  assert.throws(() => comparePackageProtection({}), /Item price/);
  assert.throws(() => comparePackageProtection({ price: -1 }), /Item price/);
  assert.throws(() => comparePackageProtection({ ...PROTECT_BASE, skipClaimRatePercent: 101 }), /at most 100/);
  assert.throws(() => comparePackageProtection({ ...PROTECT_BASE, monthlyProtectionShipments: 0 }), /greater than zero/);
});

test('package-protection note names the $1.00 drag and the 5.3% floor', () => {
  const text = comparePackageProtection(PROTECT_BASE).summary;
  assert.match(text, /\$17\.44/);
  assert.match(text, /\$16\.43/);
  assert.match(text, /\$1\.00 less/);
  assert.match(text, /\$14\.75/);
  assert.match(text, /\$2\.69 less/);
  assert.match(text, /5\.3%/);
  assert.match(text, /\$0\.80/);
  assert.doesNotMatch(text, /should buy insurance|must add signature|buy a policy/i);
  assert.equal(text, packageProtectionNote(comparePackageProtection(PROTECT_BASE)));
  assert.equal(text, packageProtectionSummary(comparePackageProtection(PROTECT_BASE)));
  assert.throws(() => packageProtectionNote({}), /missing rows/);
});

const LABEL_BASE = {
  price: 40,
  shippingCharged: 6,
  finalValueRate: 13.25,
  fixedFee: 0.3,
  costOfGoods: 12,
  shippingCost: 5,
  packagingCost: 1,
  returnRatePercent: 10,
  returnShippingCost: 5,
  feeRefundOnReturnPercent: 100,
};

test('a $4.25 Pirate Ship quote still loses after four minutes on the default $40 SKU', () => {
  const comparison = compareEbayLabels(LABEL_BASE);
  near(comparison.ebay.expectedProfit, 18.053744, 'eBay label after 0.8% claims');
  near(comparison.third.expectedProfit, 16.9858875, 'third-party after time and 2.5% claims');
  near(comparison.postageOnly.expectedProfit, 18.1858875, 'third-party with no extra time');
  near(comparison.ebay.claimProfit, -18, 'eBay claim is sunk cost');
  near(comparison.uploadTimeCost, 1.2, '4 minutes at $18');
  near(comparison.extraKeptOnThird, -1.0678565, 'timed third-party drag');
  near(comparison.extraKeptOnPostageOnly, 0.1321435, 'postage-only save');
  near(comparison.monthlyExtraOnThird, -42.71426, 'forty shipments');
  near(comparison.breakEvenThirdPartyLabelCost, 3.1821435, 'label ceiling');
  near(comparison.breakEvenUploadMinutes, 0.44047833333333786, 'time ceiling');
  assert.equal(comparison.winner, 'third_party_no_time');
  assert.equal(comparison.breakEvenThirdPartyClaimRate, Infinity);
  assert.equal(comparison.ebayLabelCost, 5);
  assert.equal(comparison.thirdPartyLabelCost, DEFAULT_THIRD_PARTY_LABEL_COST);
  assert.equal(comparison.ebayClaimRate, DEFAULT_EBAY_LABEL_CLAIM_RATE);
  assert.equal(comparison.thirdPartyClaimRate, DEFAULT_THIRD_PARTY_CLAIM_RATE);
  assert.equal(comparison.uploadMinutes, DEFAULT_LABEL_UPLOAD_MINUTES);
  assert.equal(comparison.uploadWage, DEFAULT_LABEL_UPLOAD_WAGE);
  assert.equal(comparison.monthlyShipments, DEFAULT_MONTHLY_LABEL_SHIPMENTS);
  assert.equal(comparison.usedDefaultEbayLabel, true);
  assert.equal(comparison.usedDefaultThirdPartyLabel, true);
});

test('a 4% third-party claim rate flips the postage-only path behind the eBay label', () => {
  const comparison = compareEbayLabels({
    ...LABEL_BASE,
    labelUploadMinutes: 0,
    thirdPartyClaimRatePercent: 4,
  });
  near(comparison.ebay.expectedProfit, 18.053744, 'eBay leftover unchanged');
  near(comparison.third.expectedProfit, 17.64072, '4% third-party claims');
  near(comparison.breakEvenThirdPartyClaimRate, 2.8635859621125666, '2.9% floor');
  assert.equal(comparison.winner, 'ebay');
});

test('a high-COGS $180 SKU keeps the eBay label ahead of a $9.50 third-party quote', () => {
  const comparison = compareEbayLabels({
    ...LABEL_BASE,
    price: 180,
    shippingCharged: 12,
    costOfGoods: 85,
    shippingCost: 12,
    packagingCost: 2,
    returnShippingCost: 12,
    thirdPartyLabelCost: 9.5,
  });
  near(comparison.ebay.expectedProfit, 56.678528, 'high-ticket eBay label');
  near(comparison.third.expectedProfit, 55.31065, 'high-ticket third-party');
  near(comparison.postageOnly.expectedProfit, 56.51065, 'high-ticket postage-only');
  near(comparison.extraKeptOnThird, -1.367878, 'timed third-party drag');
  near(comparison.breakEvenThirdPartyClaimRate, 1.6283737112416787, '1.6% floor');
  assert.equal(comparison.winner, 'ebay');
  assert.equal(comparison.ebayLabelCost, 12);
});

test('a typed eBay label replaces the shipping-cost default', () => {
  const comparison = compareEbayLabels({ ...LABEL_BASE, ebayLabelCost: 5.4 });
  assert.equal(comparison.usedDefaultEbayLabel, false);
  near(comparison.ebayLabelCost, 5.4, 'typed eBay quote');
  assert.ok(comparison.ebay.expectedProfit < 18.053744);
});

test('compareEbayLabels rejects impossible inputs', () => {
  assert.throws(() => compareEbayLabels({}), /Item price/);
  assert.throws(() => compareEbayLabels({ price: -1 }), /Item price/);
  assert.throws(() => compareEbayLabels({ ...LABEL_BASE, thirdPartyClaimRatePercent: 101 }), /at most 100/);
  assert.throws(() => compareEbayLabels({ ...LABEL_BASE, monthlyLabelShipments: 0 }), /greater than zero/);
});

test('label note names the $1.07 drag, the $0.13 postage-only save, and the $3.18 ceiling', () => {
  const text = compareEbayLabels(LABEL_BASE).summary;
  assert.match(text, /\$18\.05/);
  assert.match(text, /\$16\.99/);
  assert.match(text, /\$1\.07 less/);
  assert.match(text, /\$18\.19/);
  assert.match(text, /\$0\.13 more/);
  assert.match(text, /\$3\.18/);
  assert.match(text, /No third-party claim rate/);
  assert.doesNotMatch(text, /should buy Pirate Ship|must use eBay labels|buy the eBay label/i);
  assert.equal(text, ebayLabelsNote(compareEbayLabels(LABEL_BASE)));
  assert.equal(text, ebayLabelsSummary(compareEbayLabels(LABEL_BASE)));
  assert.throws(() => ebayLabelsNote({}), /missing rows/);
});

// Regression: eight break-even/ceiling rates across this file shared one
// defect, the same class fixed in etsy-profit-calculator's
// breakEvenSellThroughRate and shopify-fee-calculator's six break-even
// solvers -- each gated its division on "the scaled path's profit is
// positive" and hard-coded 0% (or, for waitChanceCeiling, effectively
// claimed a trivial tie at 0% chance) whenever that path was already
// losing money, without checking whether the value it was being compared
// against was also negative. When both are negative they can still cross
// at a real, positive rate (breakEvenScaledRate(target, profitAtFullRate)
// = target / profitAtFullRate * 100 is positive whenever target and
// profitAtFullRate share a sign). A high cost-of-goods relative to price
// makes both sides of each comparison lose money below; each case below
// independently reconstructs the crossing by scaling the pipeline's own
// per-unit/per-order fields (not by calling breakEvenScaledRate), and
// confirms the reported rate actually ties the two paths.
test('compareSellerInitiatedOffer.breakEvenAcceptPct solves when both accepting and waiting already lose money', () => {
  const input = {
    price: 20, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 25, shippingCost: 2,
    offerPercent: 10, waitSellThroughPct: 40, offerAcceptPct: 55,
  };
  const r = compareSellerInitiatedOffer(input);
  assert.ok(r.wait.expectedProfit < 0, 'waiting for list already loses money');
  assert.ok(r.offer.soldExpectedProfit < 0, 'the discounted offer, if sold, also loses money');
  assert.ok(
    Number.isFinite(r.breakEvenAcceptPct) && r.breakEvenAcceptPct > 0,
    `accept floor should be reachable and nonzero, got ${r.breakEvenAcceptPct}`,
  );
  assert.notEqual(r.breakEvenAcceptPct, 0);
  near(
    (r.breakEvenAcceptPct / 100) * r.offer.soldExpectedProfit,
    r.wait.expectedProfit,
    'accepting at the reported rate ties waiting',
  );
});

test('compareQuantityDiscount.breakEvenTakePct solves when both singles and the discounted box already lose money', () => {
  const input = {
    price: 20, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 22, shippingCost: 2,
    qtyDiscountUnits: 3, qtyDiscountPercent: 15, qtyTakePct: 60, singlesSellThroughPct: 40,
  };
  const r = compareQuantityDiscount(input);
  assert.ok(r.singles.expectedProfit < 0, 'selling separately already loses money');
  assert.ok(r.discount.soldExpectedProfit < 0, 'the discounted box, if taken, also loses money');
  assert.ok(
    Number.isFinite(r.breakEvenTakePct) && r.breakEvenTakePct > 0,
    `take floor should be reachable and nonzero, got ${r.breakEvenTakePct}`,
  );
  assert.notEqual(r.breakEvenTakePct, 0);
  near(
    (r.breakEvenTakePct / 100) * r.discount.soldExpectedProfit,
    r.singles.expectedProfit,
    'taking the box at the reported rate ties selling separately',
  );
});

test('compareSellerCoupon solves both sell-through floors when every path already loses money', () => {
  const input = {
    price: 20, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 22, shippingCost: 2,
    couponPercent: 15, couponRedeemPct: 40,
    listedSellThroughPct: 40, couponSellThroughPct: 55, dropSellThroughPct: 50,
  };
  const r = compareSellerCoupon(input);
  assert.ok(r.listed.expectedProfit < 0, 'staying listed already loses money');
  assert.ok(r.coupon.soldExpectedProfit < 0, 'a coupon sale also loses money');
  assert.ok(r.drop.soldExpectedProfit < 0, 'a dropped-list sale also loses money');
  assert.ok(
    Number.isFinite(r.breakEvenCouponSellThroughPct) && r.breakEvenCouponSellThroughPct > 0,
    `coupon ST floor should be reachable and nonzero, got ${r.breakEvenCouponSellThroughPct}`,
  );
  assert.ok(
    Number.isFinite(r.breakEvenDropSellThroughPct) && r.breakEvenDropSellThroughPct > 0,
    `drop ST floor should be reachable and nonzero, got ${r.breakEvenDropSellThroughPct}`,
  );
  near(
    (r.breakEvenCouponSellThroughPct / 100) * r.coupon.soldExpectedProfit,
    r.listed.expectedProfit,
    'the coupon at its reported sell-through ties staying listed',
  );
  near(
    (r.breakEvenDropSellThroughPct / 100) * r.drop.soldExpectedProfit,
    r.coupon.expectedProfit,
    'dropping the list at its reported sell-through ties the coupon',
  );
});

test('compareImmediatePayment.breakEvenImmediateSellThroughPct solves when both paths already lose money', () => {
  const input = {
    price: 20, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 22, shippingCost: 2,
    laterSellThroughPct: 40, immediateSellThroughPct: 55,
  };
  const r = compareImmediatePayment(input);
  assert.ok(r.later.expectedProfit < 0, 'allowing later checkout already loses money');
  assert.ok(r.immediate.soldExpectedProfit < 0, 'requiring immediate payment also loses money');
  assert.ok(
    Number.isFinite(r.breakEvenImmediateSellThroughPct) && r.breakEvenImmediateSellThroughPct > 0,
    `immediate ST floor should be reachable and nonzero, got ${r.breakEvenImmediateSellThroughPct}`,
  );
  near(
    (r.breakEvenImmediateSellThroughPct / 100) * r.immediate.soldExpectedProfit,
    r.later.expectedProfit,
    'requiring immediate payment at its reported sell-through ties allowing later checkout',
  );
});

test('compareGlobalShipping.breakEvenSelfShipSellThroughPct solves when both GSP and self-ship already lose money', () => {
  const input = {
    price: 20, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 22, shippingCost: 2,
    gspSellThroughPct: 40, selfShipSellThroughPct: 55,
  };
  const r = compareGlobalShipping(input);
  assert.ok(r.gsp.expectedProfit < 0, 'GSP already loses money');
  assert.ok(r.selfShip.soldExpectedProfit < 0, 'self-shipping, after claims, also loses money');
  assert.ok(
    Number.isFinite(r.breakEvenSelfShipSellThroughPct) && r.breakEvenSelfShipSellThroughPct > 0,
    `self-ship ST floor should be reachable and nonzero, got ${r.breakEvenSelfShipSellThroughPct}`,
  );
  near(
    (r.breakEvenSelfShipSellThroughPct / 100) * r.selfShip.soldExpectedProfit,
    r.gsp.expectedProfit,
    'self-shipping at its reported sell-through ties GSP',
  );
});

// The wait/offer prices share every cost and fee, so profit is strictly
// increasing in price -- an incoming offer below list can never be a
// *smaller* loss than waiting for list once list itself is a loss. The
// true crossing is therefore never inside (0, 100) here; it is either the
// trivial edge (identical prices) or unreachable. The old code still
// hard-coded 0% ("the offer already ties waiting for free"), which is
// wrong in the ordinary way this bug class is wrong: 0% claims the two
// tie before any chance of a sale at all, when in fact waiting stays
// strictly better than the offer at every chance from 0% to 100%.
test('compareBestOffer.waitChanceCeiling reports unreachable, not zero, when the offer is a bigger loss than a losing list price', () => {
  const input = {
    price: 40, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 42, shippingCost: 2,
  };
  const r = compareBestOffer(input, 30, 50);
  assert.ok(r.listing.profit < 0, 'list price already loses money');
  assert.ok(r.offer.profit < 0, 'the incoming offer loses even more');
  assert.equal(r.waitChanceCeiling, Infinity);
  for (let pct = 0; pct <= 100; pct += 10) {
    const expectedWaitProfit = r.listing.profit * (pct / 100);
    assert.ok(
      r.offer.profit < expectedWaitProfit,
      `waiting should still beat the offer at ${pct}% chance, got offer ${r.offer.profit} vs wait ${expectedWaitProfit}`,
    );
  }
});

test('compareFreeShipping.breakEvenFreeShipSellThroughPct solves when both buyer-pays and free-shipping already lose money', () => {
  const input = {
    price: 20, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3, costOfGoods: 22, shippingCost: 2,
    buyerPaysSellThroughPct: 40, freeShipSellThroughPct: 55,
  };
  const r = compareFreeShipping(input);
  assert.ok(r.buyerPays.expectedProfit < 0, 'buyer-pays shipping already loses money');
  assert.ok(r.freeShip.soldExpectedProfit < 0, 'free shipping, if sold, also loses money');
  assert.ok(
    Number.isFinite(r.breakEvenFreeShipSellThroughPct) && r.breakEvenFreeShipSellThroughPct > 0,
    `free-ship ST floor should be reachable and nonzero, got ${r.breakEvenFreeShipSellThroughPct}`,
  );
  assert.notEqual(r.breakEvenFreeShipSellThroughPct, 0);
  near(
    (r.breakEvenFreeShipSellThroughPct / 100) * r.freeShip.soldExpectedProfit,
    r.buyerPays.expectedProfit,
    'free shipping at its reported sell-through ties buyer-pays',
  );
});
