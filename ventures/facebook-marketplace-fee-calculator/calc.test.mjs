import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale, feeFor, priceForTargetPayout, FEE_RATE, MIN_FEE, DISPUTE_PENALTY } from './calc.mjs';

test('shipped: 10% of item + shipping + tax, above the minimum', () => {
  const { sellingFee, marketplaceFee } = feeFor({ itemPrice: 50, buyerShipping: 8, taxCollected: 2, channel: 'shipped' });
  assert.ok(Math.abs(sellingFee - 60 * 0.10) < 1e-9);
  assert.ok(Math.abs(marketplaceFee - sellingFee) < 1e-9);
});

test('shipped: the $0.80 minimum applies below an $8 base', () => {
  const { sellingFee } = feeFor({ itemPrice: 5, buyerShipping: 0, channel: 'shipped' });
  assert.equal(sellingFee, MIN_FEE);
});

test('shipped: exactly at the $8 base, the rate and the minimum agree', () => {
  const { sellingFee } = feeFor({ itemPrice: 8, buyerShipping: 0, channel: 'shipped' });
  assert.ok(Math.abs(sellingFee - MIN_FEE) < 1e-9);
});

test('local pickup: no selling fee regardless of price', () => {
  const { sellingFee, marketplaceFee } = feeFor({ itemPrice: 500, buyerShipping: 0, channel: 'local' });
  assert.equal(sellingFee, 0);
  assert.equal(marketplaceFee, 0);
});

test('a zero-price shipped sale charges no fee', () => {
  const { sellingFee } = feeFor({ itemPrice: 0, buyerShipping: 0, channel: 'shipped' });
  assert.equal(sellingFee, 0);
});

test('a disputed shipped sale adds the flat chargeback penalty', () => {
  const plain = feeFor({ itemPrice: 50, channel: 'shipped', disputed: false });
  const disputed = feeFor({ itemPrice: 50, channel: 'shipped', disputed: true });
  assert.equal(disputed.disputePenalty, DISPUTE_PENALTY);
  assert.ok(Math.abs(disputed.marketplaceFee - plain.marketplaceFee - DISPUTE_PENALTY) < 1e-9);
});

test('a dispute on a local-pickup sale charges no penalty (no Facebook checkout involved)', () => {
  const { disputePenalty } = feeFor({ itemPrice: 50, channel: 'local', disputed: true });
  assert.equal(disputePenalty, 0);
});

test('calculateSale rejects a missing item price', () => {
  const result = calculateSale({ itemPrice: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'itemPrice');
});

test('calculateSale rejects a non-numeric field', () => {
  const result = calculateSale({ itemPrice: 'abc' });
  assert.equal(result.ok, false);
});

test('calculateSale: a plain shipped sale nets item + shipping minus the fee minus the label', () => {
  const result = calculateSale({ itemPrice: '60', buyerShipping: '8', labelCost: '5', channel: 'shipped' });
  assert.equal(result.ok, true);
  const expectedFee = 68 * (FEE_RATE / 100);
  assert.ok(Math.abs(result.payout - (68 - expectedFee - 5)) < 1e-9);
});

test('calculateSale: local pickup pays out the full item price minus costs', () => {
  const result = calculateSale({ itemPrice: '60', itemCost: '20', channel: 'local' });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.payout - 60) < 1e-9);
  assert.ok(Math.abs(result.profit - 40) < 1e-9);
});

test('calculateSale reports profit relative to item and prep cost', () => {
  const result = calculateSale({ itemPrice: '60', itemCost: '20', otherCost: '2', channel: 'shipped' });
  assert.ok(Math.abs(result.profit - (result.payout - 22)) < 1e-9);
});

test('calculateSale flags a loss with a note', () => {
  const result = calculateSale({ itemPrice: '5', itemCost: '20', channel: 'shipped' });
  assert.ok(result.profit < 0);
  assert.ok(result.notes.some(n => n.includes('loses money')));
});

test('calculateSale notes the minimum fee when it is the binding constraint', () => {
  const result = calculateSale({ itemPrice: '3', channel: 'shipped' });
  assert.ok(result.notes.some(n => n.includes('minimum applies')));
});

test('calculateSale notes a modelled dispute penalty', () => {
  const result = calculateSale({ itemPrice: '30', channel: 'shipped', disputed: true });
  assert.ok(result.notes.some(n => n.includes('chargeback penalty')));
});

test('an unrecognised channel falls back to shipped', () => {
  const known = calculateSale({ itemPrice: '40', channel: 'shipped' });
  const fallback = calculateSale({ itemPrice: '40', channel: 'not-a-channel' });
  assert.equal(fallback.channel, 'shipped');
  assert.ok(Math.abs(fallback.payout - known.payout) < 1e-9);
});

test('priceForTargetPayout solves back to the same payout, above the minimum-fee floor', () => {
  const target = 41.03;
  const price = priceForTargetPayout(target, { buyerShipping: 4, labelCost: 3, channel: 'shipped' });
  const check = calculateSale({ itemPrice: String(price), buyerShipping: '4', labelCost: '3', channel: 'shipped' });
  assert.ok(Math.abs(check.payout - target) < 1e-6);
});

test('priceForTargetPayout solves back to the same payout, inside the minimum-fee floor', () => {
  const target = 2;
  const price = priceForTargetPayout(target, { buyerShipping: 0, labelCost: 0, channel: 'shipped' });
  const check = calculateSale({ itemPrice: String(price), channel: 'shipped' });
  assert.ok(Math.abs(check.payout - target) < 1e-6);
});

test('priceForTargetPayout solves back to the same payout, local pickup', () => {
  const target = 25;
  const price = priceForTargetPayout(target, { labelCost: 1, channel: 'local' });
  const check = calculateSale({ itemPrice: String(price), labelCost: '1', channel: 'local' });
  assert.ok(Math.abs(check.payout - target) < 1e-6);
});

test('priceForTargetPayout solves back to the same payout with a modelled dispute', () => {
  const target = 20;
  const price = priceForTargetPayout(target, { channel: 'shipped', disputed: true });
  const check = calculateSale({ itemPrice: String(price), channel: 'shipped', disputed: true });
  assert.ok(Math.abs(check.payout - target) < 1e-6);
});

test('priceForTargetPayout returns null for a non-finite target', () => {
  assert.equal(priceForTargetPayout(NaN, { channel: 'shipped' }), null);
});
