import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeInputs, encodeInputs } from './share.mjs';
import { INPUT_FIELDS } from './calc.mjs';

// A shared link is only useful if it carries the whole order. When the encoder
// kept its own field list it fell behind calc.mjs twice (batch quantity, then
// target margin), so a link sent for a 10-unit batch opened as a single unit
// for the recipient — same URL, different profit. Round-trip every field the
// calculator accepts rather than a copy of the list that can go stale.
test('round-trips every field the calculator accepts', () => {
  const order = Object.fromEntries(INPUT_FIELDS.map((field, index) => [field, index + 1]));
  assert.deepEqual(decodeInputs(encodeInputs(order)), order);
});

test('carries batch quantity and target margin', () => {
  const restored = decodeInputs(encodeInputs({ price: 40, quantity: 10, targetMargin: 25 }));
  assert.equal(restored.quantity, 10);
  assert.equal(restored.targetMargin, 25);
});

test('carries expected return-rate fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40, returnRatePercent: 12, returnShippingCost: 7.5, feeRefundOnReturnPercent: 80,
  }));
  assert.equal(restored.returnRatePercent, 12);
  assert.equal(restored.returnShippingCost, 7.5);
  assert.equal(restored.feeRefundOnReturnPercent, 80);
});

test('carries auction vs Buy It Now fields so a shared link does not drop them', () => {
  const restored = decodeInputs(encodeInputs({
    price: 40,
    auctionExpectedClose: 36,
    binSellThroughPct: 50,
    auctionSellThroughPct: 90,
    binDaysToSell: 21,
    auctionDays: 7,
    binInsertionFee: 0.35,
    auctionInsertionFee: 0.35,
    auctionPromotedRate: 2,
  }));
  assert.equal(restored.auctionExpectedClose, 36);
  assert.equal(restored.binSellThroughPct, 50);
  assert.equal(restored.auctionSellThroughPct, 90);
  assert.equal(restored.binDaysToSell, 21);
  assert.equal(restored.auctionDays, 7);
  assert.equal(restored.binInsertionFee, 0.35);
  assert.equal(restored.auctionInsertionFee, 0.35);
  assert.equal(restored.auctionPromotedRate, 2);
});

test('round-trips known numeric inputs in stable order', () => {
  const encoded = encodeInputs({ price: 40, shippingCharged: 6, finalValueRate: 13.25 });
  assert.equal(encoded, 'price=40&shippingCharged=6&finalValueRate=13.25');
  assert.deepEqual(decodeInputs(encoded), { price: 40, shippingCharged: 6, finalValueRate: 13.25 });
});

test('ignores unknown, negative, non-finite, and malformed values', () => {
  assert.deepEqual(decodeInputs('?price=10&costOfGoods=-2&bogus=4&shippingCost=nope'), { price: 10 });
  assert.equal(encodeInputs({ price: -1, shippingCost: Infinity, bogus: 3 }), '');
});

test('accepts hash links without arbitrary fields', () => {
  assert.deepEqual(decodeInputs('#price=22.5&otherCost=1&secret=abc'), { price: 22.5, otherCost: 1 });
});
