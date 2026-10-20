// Decodes every link through where-to-sell-calculator's own decoder, so a
// change to its payload shape fails here instead of landing as a silently
// wrong number there.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { whereToSellUrl, whereToSellPayload } from './to-where-to-sell.mjs';
import { decodeComparison } from '../where-to-sell-calculator/share.mjs';
import { FEE_RATE } from './calc.mjs';

const INPUTS = { itemPrice: '60', buyerShipping: '8', labelCost: '7', itemCost: '20', otherCost: '1', taxCollected: '4', targetProfit: '25', channel: 'shipped', disputed: true };

const decode = (url) => decodeComparison(new URLSearchParams(url.split('#')[1]).get('c'));
const fbOf = (decoded) => decoded.channels.find((channel) => channel.id === 'facebook-marketplace');

test('links into where-to-sell-calculator with the item renamed to its fields', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
  const decoded = decode(url);
  assert.deepEqual(decoded.shared, { price: 60, shippingCharged: 8, shippingCost: 7, itemCost: 20, otherCost: 1 });
  assert.equal(fbOf(decoded).enabled, true);
});

test('shipped checkout sends this page\'s FEE_RATE', () => {
  assert.equal(fbOf(decode(whereToSellUrl(INPUTS))).commissionRate, FEE_RATE);
});

test('local pickup sends a zero commission, not the shipped 10%', () => {
  assert.equal(fbOf(decode(whereToSellUrl({ ...INPUTS, channel: 'local' }))).commissionRate, 0);
});

test('page-only fields (tax, target, dispute) do not leak', () => {
  const { shared } = whereToSellPayload(INPUTS);
  for (const key of ['taxCollected', 'targetProfit', 'disputed']) assert.equal(key in shared, false);
});

test('blank or negative fields are left out, a crafted value is dropped', () => {
  const payload = whereToSellPayload({ ...INPUTS, itemCost: '', otherCost: '-1', itemPrice: 'nope' });
  for (const key of ['itemCost', 'otherCost', 'price']) assert.equal(key in payload.shared, false);
});

test('empty input still enables Marketplace with an empty comparison', () => {
  const decoded = decode(whereToSellUrl({}));
  assert.deepEqual(decoded.shared, {});
  assert.equal(fbOf(decoded).enabled, true);
});
