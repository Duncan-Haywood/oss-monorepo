// Decodes every link through where-to-sell-calculator's own decoder, so a
// field or payload shape the receiving page would silently drop fails here
// instead of landing a reader on default numbers shown as their own.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { whereToSellUrl, whereToSellPayload } from './to-where-to-sell.mjs';
import { decodeComparison } from '../where-to-sell-calculator/share.mjs';

const INPUTS = {
  salePrice: '24.99',
  sellerShippingCost: '4.5',
  costOfGoods: '7',
  packagingCost: '0.5',
  otherCost: '1.25',
  // Walmart-only fields that must not leak into the shared block.
  referralRate: '15',
  fulfillmentFee: '3.45',
  adsPerUnit: '2',
  monthlyUnits: '60',
};

const decode = (url) => decodeComparison(new URLSearchParams(url.split('#')[1]).get('c'));

test('links to where-to-sell-calculator with the listing in the fragment', () => {
  assert.match(whereToSellUrl(INPUTS), /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with Walmart switched on', () => {
  const decoded = decode(whereToSellUrl(INPUTS));
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 24.99);
  assert.equal(decoded.shared.shippingCost, 4.5);
  assert.equal(decoded.shared.itemCost, 7);
  const walmart = decoded.channels.find((channel) => channel.id === 'walmart');
  assert.ok(walmart, 'Walmart must be one of the carried channels');
  assert.equal(walmart.enabled, true);
});

test('prep and other per-unit cost travel as one summed bucket', () => {
  assert.equal(whereToSellPayload(INPUTS).shared.otherCost, 1.75);
  assert.equal(whereToSellPayload({ otherCost: '2' }).shared.otherCost, 2);
});

test('Walmart-only fields and buyer shipping do not reach the shared block', () => {
  const keys = Object.keys(whereToSellPayload(INPUTS).shared).sort();
  assert.deepEqual(keys, ['itemCost', 'otherCost', 'price', 'shippingCost']);
});

test('a blank or negative field is left out, not sent as zero', () => {
  const shared = whereToSellPayload({ ...INPUTS, costOfGoods: '', sellerShippingCost: '-5' }).shared;
  assert.equal('itemCost' in shared, false);
  assert.equal('shippingCost' in shared, false);
});

test('a non-numeric value is dropped rather than reaching the target', () => {
  const decoded = decode(whereToSellUrl({ ...INPUTS, salePrice: 'not-a-number' }));
  assert.equal('price' in decoded.shared, false);
});

test('empty input still enables Walmart with an otherwise-empty comparison', () => {
  const decoded = decode(whereToSellUrl({}));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels.find((channel) => channel.id === 'walmart')?.enabled, true);
});
