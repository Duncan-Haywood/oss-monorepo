import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSale, feeFor, feeLadder, priceForTargetPayout, sellingFeeOn,
  SELLING_FEE_MAX, SELLING_FEE_MIN, DEFAULT_PROCESSING_RATE, DEFAULT_PROCESSING_FIXED,
} from './calc.mjs';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ''} ${actual} vs ${expected}`);

test('9% on the item plus buyer-paid shipping, not the item alone', () => {
  const { sellingFee } = feeFor({ itemPrice: 20, buyerShipping: 6 });
  near(sellingFee, 2.34); // 9% of $26, not 9% of $20
});

test('processing is a percent of the order plus a flat amount, and is separate from the selling fee', () => {
  const { sellingFee, processingFee, discogsFee } = feeFor({ itemPrice: 50, buyerShipping: 0 });
  near(sellingFee, 4.5);
  near(processingFee, 50 * 0.029 + 0.30);
  near(discogsFee, sellingFee + processingFee);
});

test('selling fee has a $0.10 floor and a $150 cap', () => {
  near(sellingFeeOn(0.5), SELLING_FEE_MIN);
  near(sellingFeeOn(1000), 90);
  near(sellingFeeOn(1666), 149.94, 'just under the cap');
  assert.equal(sellingFeeOn(1667), SELLING_FEE_MAX);
  assert.equal(sellingFeeOn(10000), SELLING_FEE_MAX);
  assert.equal(sellingFeeOn(0), 0);
});

test('a worked sale: payout and profit after postage, cost and packaging', () => {
  const result = calculateSale({ itemPrice: 30, buyerShipping: 5, labelCost: 4.5, itemCost: 8, otherCost: 1 });
  assert.ok(result.ok);
  near(result.sellingFee, 3.15);
  near(result.processingFee, 35 * 0.029 + 0.30);
  near(result.payout, 35 - 3.15 - (35 * 0.029 + 0.30) - 4.5);
  near(result.profit, result.payout - 9);
  near(result.effectiveRate, ((3.15 + 35 * 0.029 + 0.30) / 35) * 100);
});

test('blank processing fields fall back to the defaults; explicit zeros do not', () => {
  const blank = calculateSale({ itemPrice: 50, processingRate: '', processingFixed: '' });
  assert.equal(blank.processingRate, DEFAULT_PROCESSING_RATE);
  assert.equal(blank.processingFixed, DEFAULT_PROCESSING_FIXED);
  const zero = calculateSale({ itemPrice: 50, processingRate: '0', processingFixed: '0' });
  near(zero.processingFee, 0);
});

test('shipping and price are interchangeable: the fee depends on the total', () => {
  const a = calculateSale({ itemPrice: 30, buyerShipping: 0 });
  const b = calculateSale({ itemPrice: 22, buyerShipping: 8 });
  near(a.discogsFee, b.discogsFee);
  near(a.payout, b.payout);
});

test('priceForTarget round-trips: pricing at the answer yields the target profit', () => {
  for (const input of [
    { itemPrice: 1, buyerShipping: 5, labelCost: 4, itemCost: 10, otherCost: 1, targetProfit: 15 },
    { itemPrice: 1, buyerShipping: 0, labelCost: 0, itemCost: 400, otherCost: 0, targetProfit: 200 },
    { itemPrice: 1, buyerShipping: 12, labelCost: 12, itemCost: 3000, otherCost: 0, targetProfit: 500 },
  ]) {
    const first = calculateSale(input);
    assert.ok(first.priceForTarget !== null);
    const back = calculateSale({ ...input, itemPrice: first.priceForTarget });
    near(back.profit, input.targetProfit);
  }
});

test('priceForTarget is correct on both sides of the $150 cap', () => {
  const below = priceForTargetPayout(100, {});
  const above = priceForTargetPayout(3000, {});
  near(below + 0 - feeFor({ itemPrice: below }).discogsFee, 100);
  near(above - feeFor({ itemPrice: above }).discogsFee, 3000);
  assert.ok(above * 0.09 > 150, 'the high case is in the capped regime');
});

test('validation: a missing item price and a bad number are reported by field', () => {
  const missing = calculateSale({});
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.errors.map((e) => e.id), ['itemPrice']);
  const bad = calculateSale({ itemPrice: '20', labelCost: 'abc', processingRate: '95' });
  assert.deepEqual(bad.errors.map((e) => e.id).sort(), ['labelCost', 'processingRate']);
  assert.equal(calculateSale({ itemPrice: '-3' }).ok, false);
});

test('notes: shipping in the fee base, the cap, tiny orders and losses are each said once', () => {
  const ship = calculateSale({ itemPrice: 20, buyerShipping: 6 });
  assert.ok(ship.notes.some((n) => /inside the fee base/.test(n)));
  assert.ok(!calculateSale({ itemPrice: 20 }).notes.some((n) => /inside the fee base/.test(n)));
  const capped = calculateSale({ itemPrice: 2000 });
  assert.ok(capped.notes.some((n) => /maximum/.test(n)));
  const tiny = calculateSale({ itemPrice: 3 });
  assert.ok(tiny.notes.some((n) => /flat \$0\.30/.test(n)));
  const loss = calculateSale({ itemPrice: 10, itemCost: 20 });
  assert.ok(loss.notes.some((n) => /loses money/.test(n)));
});

test('fee ladder: effective rate falls toward the headline and the cap flattens it', () => {
  const ladder = feeLadder({ itemPrice: 20, labelCost: 0 });
  assert.ok(ladder.ok);
  const rates = ladder.rows.map((r) => r.effectiveRate);
  for (let i = 1; i < rates.length; i += 1) assert.ok(rates[i] <= rates[i - 1] + 1e-9, 'never rises with price');
  const top = ladder.rows.at(-1);
  near(top.discogsFee, 150 + 2500 * 0.029 + 0.30);
  assert.equal(feeLadder({}).ok, false);
});
