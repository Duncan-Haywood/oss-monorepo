import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale, compareSchedules, feeFor, priceForTargetPayout, SCHEDULES } from './calc.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);

test('a $50 single card: 10.75% + 2.5% + $0.30 costs $6.93, the figure fee guides publish', () => {
  const r = calculateSale({ itemPrice: 50 });
  near(r.commission, 5.375);
  near(r.processingFee, 1.55);
  near(r.tcgplayerFee, 6.925); // guides round this half-cent up to $6.93
  near(r.effectiveRate, 13.85);
});

test('shipping the buyer pays is inside the commission base (help-centre worked example: $65.31 + $0.99)', () => {
  const r = calculateSale({ itemPrice: 65.31, buyerShipping: 0.99 });
  near(r.subtotal, 66.3);
  near(r.commission, 66.3 * 0.1075);
});

test('processing is charged on tax too, but commission is not', () => {
  const r = calculateSale({ itemPrice: 100, salesTaxRate: 10 });
  near(r.commission, 10.75);
  near(r.processingFee, 110 * 0.025 + 0.3);
});

test('the $0.30 is per order, so a 20-card cart pays it once', () => {
  const one = feeFor({ subtotal: 1 }).processingFee;
  const twenty = feeFor({ subtotal: 20, quantity: 20 }).processingFee;
  near(one, 0.025 + 0.3);
  near(twenty, 0.5 + 0.3);
});

test('the $75 cap binds above about $697.67 and not below it', () => {
  near(feeFor({ subtotal: 697 }).commission, 697 * 0.1075);
  near(feeFor({ subtotal: 2000 }).commission, 75);
  const r = calculateSale({ itemPrice: 2000 });
  near(r.capSaving, 2000 * 0.1075 - 75);
  assert.ok(r.notes.some(n => /cap applies/.test(n)));
});

test('the cap is per product: three $1,000 slabs cap at $225, not $75', () => {
  near(feeFor({ subtotal: 3000, quantity: 3 }).commission, 225);
});

test('pro seller pays 9.25% + 2.5%, each line capped separately', () => {
  near(feeFor({ subtotal: 100, schedule: 'pro' }).commission, 11.75);
  near(feeFor({ subtotal: 5000, schedule: 'pro' }).commission, 150);
});

test('old schedule is 10.25% capped at $50', () => {
  near(feeFor({ subtotal: 100, schedule: 'old' }).commission, 10.25);
  near(feeFor({ subtotal: 1000, schedule: 'old' }).commission, 50);
});

test('profit subtracts postage, card cost and supplies', () => {
  const r = calculateSale({ itemPrice: 50, shippingCost: 1.2, itemCost: 20, otherCost: 0.5 });
  near(r.payout, 50 - 6.925 - 1.2);
  near(r.profit, r.payout - 20.5);
});

test('priceForTarget round-trips: pricing at the answer nets the target', () => {
  for (const schedule of Object.keys(SCHEDULES)) {
    for (const input of [
      { quantity: 1, targetProfit: 25, itemCost: 10 },
      { quantity: 4, buyerShipping: 1.31, salesTaxRate: 7, targetProfit: 40, itemCost: 20, shippingCost: 0.9 },
      { quantity: 1, targetProfit: 900, itemCost: 400 },
    ]) {
      const r = calculateSale({ itemPrice: 1, schedule, ...input });
      const back = calculateSale({ ...input, schedule, itemPrice: r.priceForTarget });
      near(back.profit, input.targetProfit, `${schedule} ${JSON.stringify(input)}`);
    }
  }
});

test('priceForTarget is null when shipping alone already beats the target', () => {
  assert.equal(priceForTargetPayout(0.5, { buyerShipping: 50 }), null);
});

test('blank optional fields are zero (quantity 1); a missing price is an error', () => {
  const r = calculateSale({ itemPrice: '10', quantity: '', buyerShipping: '' });
  assert.equal(r.ok, true);
  assert.equal(r.quantity, 1);
  const bad = calculateSale({ itemPrice: '' });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].id, 'itemPrice');
  assert.equal(calculateSale({ itemPrice: 5, quantity: 0 }).ok, false);
  assert.equal(calculateSale({ itemPrice: -5 }).ok, false);
});

test('an unknown schedule falls back to the current one', () => {
  assert.equal(calculateSale({ itemPrice: 50, schedule: 'bogus' }).schedule, 'standard');
});

test('compareSchedules prices the same order three ways and names the cheapest', () => {
  const c = compareSchedules({ itemPrice: 100 });
  assert.equal(c.ok, true);
  assert.deepEqual(Object.keys(c.results).sort(), ['old', 'pro', 'standard']);
  assert.equal(c.bestSchedule, 'old');
  assert.equal(compareSchedules({ itemPrice: '' }).ok, false);
});
