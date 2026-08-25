import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrder,
  calculatePriceScenarios,
  calculateRepricingTable,
  compareStoreTiers,
  storeBreakEvenOrders,
} from './calc.mjs';

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

const storeExample = {
  price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
  costOfGoods: 12, shippingCost: 5, packagingCost: 1, monthlyOrders: 40,
};

test('store break-even is monthly fee divided by final-value savings per order', () => {
  // $46 revenue × 0.30% lower FVF = $0.138 saved per order. $7.95 / $0.138
  // is the volume where a $7.95 Starter example starts to pay.
  const orders = storeBreakEvenOrders({
    revenue: 46, currentFinalValueRate: 13.25, storeFinalValueRate: 12.95, monthlyFee: 7.95,
  });
  near(orders, 7.95 / 0.138, 'starter break-even orders');
});

test('a store that does not cut the final-value rate never breaks even', () => {
  assert.equal(storeBreakEvenOrders({
    revenue: 46, currentFinalValueRate: 13.25, storeFinalValueRate: 13.25, monthlyFee: 7.95,
  }), null);
  assert.equal(storeBreakEvenOrders({
    revenue: 46, currentFinalValueRate: 12.55, storeFinalValueRate: 13.25, monthlyFee: 0,
  }), null);
});

test('example store tiers lose money at 40 default-order sales a month', () => {
  // Worked example locked to the calculator defaults: $40 + $6 shipping,
  // 13.25% FVF, $0.30, $18 cash in, 40 orders, no current store fee.
  // Starter saves $0.138/order and costs $7.95 → −$2.43 / month.
  const rows = compareStoreTiers(storeExample);
  assert.deepEqual(rows.map((row) => row.id), ['current', 'starter', 'basic', 'premium']);
  assert.equal(rows[0].isCurrent, true);
  assert.equal(rows[0].isWinner, true);
  near(rows[0].monthlyProfit, 21.605 * 40, 'current monthly profit');
  near(rows[1].monthlyDelta, 40 * 0.138 - 7.95, 'starter monthly delta');
  near(rows[2].monthlyDelta, 40 * 0.322 - 27.95, 'basic monthly delta');
  near(rows[3].monthlyDelta, 40 * 0.644 - 74.95, 'premium monthly delta');
  assert.equal(rows[1].pays, false);
  assert.equal(rows[2].pays, false);
  assert.equal(rows[3].pays, false);
});

test('Basic example wins once volume covers its fee and still beats Starter', () => {
  const rows = compareStoreTiers({ ...storeExample, monthlyOrders: 120 });
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  near(byId.starter.monthlyDelta, 120 * 0.138 - 7.95, 'starter at 120');
  near(byId.basic.monthlyDelta, 120 * 0.322 - 27.95, 'basic at 120');
  near(byId.premium.monthlyDelta, 120 * 0.644 - 74.95, 'premium at 120');
  assert.equal(byId.basic.isWinner, true);
  assert.equal(byId.basic.pays, true);
  assert.ok(byId.basic.monthlyDelta > byId.starter.monthlyDelta);
  near(byId.basic.breakEvenOrders, 27.95 / 0.322, 'basic break-even');
});

test('current monthly store fee is deducted from the stay-put row', () => {
  const rows = compareStoreTiers({ ...storeExample, monthlyStoreFee: 27.95, finalValueRate: 12.55 });
  const current = rows.find((row) => row.isCurrent);
  const starter = rows.find((row) => row.id === 'starter');
  const order = calculateOrder({ ...storeExample, finalValueRate: 12.55 });
  near(current.monthlyProfit, order.profit * 40 - 27.95, 'current includes the store already paid');
  // Starter is a cheaper subscription at a higher FVF — the table has to
  // show the net of both, not treat the current $27.95 as sunk.
  assert.ok(starter, 'starter row still compared');
  assert.ok(starter.monthlyProfit !== current.monthlyProfit);
});

test('skips a preset that is identical to the seller\'s current setup', () => {
  const rows = compareStoreTiers({
    ...storeExample, finalValueRate: 12.95, monthlyStoreFee: 7.95,
  });
  assert.deepEqual(rows.map((row) => row.id), ['current', 'basic', 'premium']);
});

test('carries batch quantity into every store-tier order', () => {
  const input = { ...storeExample, quantity: 3 };
  const rows = compareStoreTiers(input, [{ id: 'starter', label: 'Starter (example)', monthlyFee: 7.95, finalValueRate: 12.95 }]);
  const direct = calculateOrder({ ...input, finalValueRate: 12.95 });
  near(rows[1].profit, direct.profit, 'batch order profit');
  near(rows[1].revenue, 46 * 3, 'batch revenue');
});

test('rejects invalid store comparison inputs', () => {
  assert.throws(() => compareStoreTiers(storeExample, []), /At least one store tier/);
  assert.throws(() => compareStoreTiers({ ...storeExample, monthlyOrders: 0 }), /Monthly orders/);
  assert.throws(() => compareStoreTiers({ ...storeExample, monthlyOrders: 1.5 }), /Monthly orders/);
  assert.throws(() => compareStoreTiers({ ...storeExample, monthlyStoreFee: -1 }), /Current monthly store fee/);
  assert.throws(() => compareStoreTiers({ price: -4, monthlyOrders: 10 }), /Item price/);
});
