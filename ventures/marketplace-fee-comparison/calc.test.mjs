import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareChannels, channelTerms } from './calc.mjs';
import { CHANNELS, SHARED_FIELDS, defaultInput } from './channels.mjs';

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected ${expected}, got ${actual}`);

const pick = (result, id) => result.ranked.find(row => row.id === id);

test('defaults produce a result for every channel', () => {
  const result = compareChannels(defaultInput());
  assert.equal(result.ranked.length, CHANNELS.length);
  assert.deepEqual(
    [...result.ranked].map(row => row.id).sort(),
    CHANNELS.map(channel => channel.id).sort(),
  );
});

test('eBay arithmetic matches a fee schedule worked by hand', () => {
  const result = compareChannels({
    ...defaultInput(),
    price: 40, shippingCharged: 6,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1, otherCost: 0,
    ebayFinalValueRate: 13.25, ebayFixedFee: 0.3, ebayPromotedRate: 0,
  });
  const ebay = pick(result, 'ebay');
  // revenue 46; fee 46 * 0.1325 + 0.30 = 6.395; cash 18; profit = 21.605
  close(result.revenue, 46, 'revenue');
  close(ebay.feeTotal, 46 * 0.1325 + 0.3, 'fee total');
  close(ebay.cashInvested, 18, 'cash invested');
  close(ebay.profit, 46 - (46 * 0.1325 + 0.3) - 18, 'profit');
  close(ebay.margin, (ebay.profit / 46) * 100, 'margin');
  close(ebay.roi, (ebay.profit / 18) * 100, 'roi');
});

test('percentage fees within a channel add up before they are applied', () => {
  const input = { ...defaultInput(), ebayPromotedRate: 5 };
  const { percentRate, fixedFee } = channelTerms(CHANNELS.find(c => c.id === 'ebay'), input);
  close(percentRate, (13.25 + 5) / 100, 'combined percent rate');
  close(fixedFee, 0.3, 'fixed fee');
});

test('a monthly platform cost is spread across the stated order count', () => {
  const base = { ...defaultInput(), shopifyPlanCost: 39, shopifyMonthlyOrders: 100 };
  const cheap = pick(compareChannels(base), 'shopify_payments');
  close(cheap.allocatedMonthlyCost, 0.39, 'allocated plan cost');

  const quiet = pick(
    compareChannels({ ...base, shopifyMonthlyOrders: 10 }),
    'shopify_payments',
  );
  close(quiet.allocatedMonthlyCost, 3.9, 'allocated plan cost at low volume');
  // The plan is invested cash, so a quiet store keeps less on the same order.
  assert.ok(quiet.profit < cheap.profit);
});

test('a monthly cost with no orders to spread it over is rejected, not divided by zero', () => {
  assert.throws(
    () => compareChannels({ ...defaultInput(), shopifyPlanCost: 39, shopifyMonthlyOrders: 0 }),
    /orders per month must be greater than zero/,
  );
});

test('a zero monthly cost needs no order count', () => {
  const result = compareChannels({ ...defaultInput(), directMonthlyCost: 0, directMonthlyOrders: 0 });
  close(pick(result, 'direct').allocatedMonthlyCost, 0, 'allocated cost');
});

test('channels are ranked by what the seller keeps, and the spread is best minus worst', () => {
  const result = compareChannels(defaultInput());
  for (let i = 1; i < result.ranked.length; i += 1) {
    assert.ok(
      result.ranked[i - 1].profit >= result.ranked[i].profit,
      'ranked list must be ordered by profit, highest first',
    );
  }
  assert.equal(result.best, result.ranked[0]);
  assert.equal(result.worst, result.ranked[result.ranked.length - 1]);
  close(result.spread, result.best.profit - result.worst.profit, 'spread');
  assert.equal(result.best.profitVsBest, 0);
  assert.ok(result.worst.profitVsBest <= 0);
});

test('selling direct beats every marketplace at the same price', () => {
  // Not a marketing claim — an arithmetic invariant with these defaults, and
  // the reason the baseline is in the comparison at all: it prices the
  // marketplace's audience.
  const result = compareChannels(defaultInput());
  assert.equal(result.best.id, 'direct');
});

test('price to match the best channel really does match its profit', () => {
  const input = defaultInput();
  const result = compareChannels(input);
  for (const row of result.ranked) {
    assert.ok(Number.isFinite(row.priceToMatchBest), `${row.label} should have a finite matching price`);
    const rerun = compareChannels({ ...input, price: row.priceToMatchBest });
    close(pick(rerun, row.id).profit, result.best.profit, `${row.label} at its matching price`);
  }
});

test('the best channel already matches itself at the current price', () => {
  const input = { ...defaultInput(), price: 40 };
  const result = compareChannels(input);
  close(result.best.priceToMatchBest, 40, 'best channel matching price');
});

test('break-even price is the point where profit reaches zero', () => {
  const input = defaultInput();
  const result = compareChannels(input);
  for (const row of result.ranked) {
    const rerun = compareChannels({ ...input, price: row.breakEvenPrice });
    close(pick(rerun, row.id).profit, 0, `${row.label} at break-even`);
  }
});

test('target-margin price reaches the requested margin', () => {
  const input = { ...defaultInput(), targetMargin: 25 };
  const result = compareChannels(input);
  for (const row of result.ranked) {
    const rerun = compareChannels({ ...input, price: row.targetMarginPrice });
    close(pick(rerun, row.id).margin, 25, `${row.label} at its target-margin price`);
  }
});

test('an unreachable target margin is reported rather than returned as a negative price', () => {
  const result = compareChannels({ ...defaultInput(), targetMargin: 99 });
  const etsy = pick(result, 'etsy');
  // Etsy's percentage fees plus a 99% target exceed the whole order.
  assert.equal(etsy.targetMarginPrice, Infinity);
});

test('fees above 100% give an unreachable break-even rather than a negative price', () => {
  const result = compareChannels({ ...defaultInput(), amazonReferralRate: 120 });
  const amazon = pick(result, 'amazon');
  assert.equal(amazon.breakEvenPrice, Infinity);
  assert.equal(amazon.priceToMatchBest, Infinity);
});

test('a free item has no ROI rather than an infinite one', () => {
  const result = compareChannels({
    ...defaultInput(),
    costOfGoods: 0, shippingCost: 0, packagingCost: 0, otherCost: 0,
    shopifyPlanCost: 0, shopifyOutsidePlanCost: 0, directMonthlyCost: 0,
  });
  assert.equal(pick(result, 'ebay').roi, null);
});

test('zero revenue reports a zero margin rather than dividing by zero', () => {
  const result = compareChannels({ ...defaultInput(), price: 0, shippingCharged: 0 });
  assert.equal(pick(result, 'ebay').margin, 0);
  assert.ok(pick(result, 'ebay').profit < 0);
});

test('negative and non-numeric inputs are rejected with the field named', () => {
  assert.throws(() => compareChannels({ ...defaultInput(), price: -1 }), /Item price/);
  assert.throws(() => compareChannels({ ...defaultInput(), costOfGoods: 'abc' }), /Cost of goods/);
  assert.throws(() => compareChannels({ ...defaultInput(), ebayFinalValueRate: -2 }), /Final value fee/);
  assert.throws(() => compareChannels({ ...defaultInput(), targetMargin: 100 }), /less than 100%/);
});

test('every declared field has a default and every rate has a known role', () => {
  const input = defaultInput();
  const roles = new Set(['percent', 'fixed', 'monthlyCost', 'monthlyOrders']);
  for (const field of SHARED_FIELDS) assert.ok(field.id in input, `${field.id} missing a default`);
  const seen = new Set();
  for (const channel of CHANNELS) {
    assert.ok(channel.note, `${channel.label} needs a note explaining its model`);
    for (const rate of channel.rates) {
      assert.ok(roles.has(rate.role), `${rate.id} has role ${rate.role}`);
      assert.ok(rate.id in input, `${rate.id} missing a default`);
      assert.ok(!seen.has(rate.id), `${rate.id} is declared twice`);
      seen.add(rate.id);
    }
  }
});
