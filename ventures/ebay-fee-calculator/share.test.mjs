import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeInputs, encodeInputs } from './share.mjs';

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
