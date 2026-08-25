import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, calculatePriceScenarios, calculateRepricingTable, compareBestOffer, bestOfferRows, bestOfferSummary } from './calc.mjs';

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

const workedOffer = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1, targetMargin: 20,
};

test('compares a typical Best Offer against list, midpoint, and waiting', () => {
  // $34 offer on the $40 worked example: $40 revenue, 13.25% of that is $5.30,
  // plus $0.30 fixed, $18 cash → $16.40 profit. List still leaves $21.605, so
  // the seller gives up $5.205 to take the cash now. At a 50% chance of later
  // selling at list, waiting is only worth $10.8025 — so the offer wins.
  const comparison = compareBestOffer(workedOffer, 34, 50);
  near(comparison.listing.profit, 21.605, 'list profit');
  near(comparison.offer.price, 34, 'offer price');
  near(comparison.offer.profit, 16.4, 'offer profit');
  near(comparison.offer.margin, 41, 'offer margin');
  near(comparison.cashLeftOnTable, 5.205, 'cash left on the table');
  near(comparison.midpoint.price, 37, 'midpoint counter');
  near(comparison.expectedWaitProfit, 10.8025, '50% of list profit');
  assert.equal(comparison.aboveBreakEven, true);
  assert.equal(comparison.meetsTargetMargin, true);
  assert.equal(comparison.acceptBeatsWait, true);
  const rows = bestOfferRows(comparison);
  assert.deepEqual(rows.map(row => row.kind), ['listing', 'offer', 'midpoint', 'target']);
  assert.match(bestOfferSummary(comparison), /still leaves \$16\.40/);
  assert.match(bestOfferSummary(comparison), /Accepting beats waiting/);
});

test('flags an offer that still pays but misses the target margin', () => {
  const comparison = compareBestOffer(workedOffer, 16, 50);
  near(comparison.offer.profit, 0.785, 'thin offer profit');
  assert.equal(comparison.aboveBreakEven, true);
  assert.equal(comparison.meetsTargetMargin, false);
  assert.equal(comparison.acceptBeatsWait, false);
  assert.match(bestOfferSummary(comparison), /misses your target margin/);
  assert.match(bestOfferSummary(comparison), /Counter \$21\.42/);
});

test('flags a Best Offer that loses money after fees', () => {
  const comparison = compareBestOffer(workedOffer, 15, 50);
  near(comparison.offer.profit, -0.0825, 'below break-even');
  assert.equal(comparison.aboveBreakEven, false);
  assert.equal(comparison.acceptBeatsWait, false);
  assert.match(bestOfferSummary(comparison), /loses \$0\.08/);
  assert.match(bestOfferSummary(comparison), /Counter at least \$15\.10/);
});

test('waiting wins when the seller is sure the item still sells at list', () => {
  const comparison = compareBestOffer(workedOffer, 34, 100);
  near(comparison.expectedWaitProfit, 21.605, 'certain list sale');
  assert.equal(comparison.acceptBeatsWait, false);
  assert.match(bestOfferSummary(comparison), /Waiting still has the higher expected profit/);
});

test('reads offer and close-rate from the shared input fields', () => {
  const comparison = compareBestOffer({ ...workedOffer, bestOffer: 34, listChance: 50 });
  near(comparison.offer.profit, 16.4, 'offer from input');
  near(comparison.chanceOfFullPricePct, 50, 'chance from input');
});

test('rejects an impossible Best Offer or close-rate', () => {
  assert.throws(() => compareBestOffer(workedOffer, -1, 50), /Best offer/);
  assert.throws(() => compareBestOffer(workedOffer, 34, 101), /at most 100/);
  assert.throws(() => compareBestOffer(workedOffer, 34, -5), /Chance of selling at list/);
  assert.throws(() => compareBestOffer({ price: -1 }, 34, 50), /Item price/);
});
