// The failure this suite exists to prevent is silent, the same shape
// ../where-to-sell-calculator/handoff.test.mjs guards against in the other
// direction: a field name or payload shape the receiving page does not
// recognise is dropped without error, and the reader lands on a comparison
// showing default numbers as if they were their own.
//
// So this decodes every URL through where-to-sell-calculator's own decoder,
// imported from that venture, rather than asserting against a shape copied
// by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { whereToSellUrl, whereToSellPayload } from './to-where-to-sell.mjs';
import { decodeComparison } from '../where-to-sell-calculator/share.mjs';

const INPUTS = {
  price: '800',
  shippingCharged: '15',
  shippingCost: '9',
  costOfGoods: '400',
  packagingCost: '2',
  otherCost: '3',
  // eBay-only fields that must not leak into the where-to-sell payload.
  finalValueRate: '13.6',
  promotedRate: '10',
  quantity: '4',
};

function paramsOf(url) {
  const [, fragment] = url.split('#');
  return new URLSearchParams(fragment);
}

test('links to where-to-sell-calculator with the item in the fragment', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with eBay switched on', () => {
  const url = whereToSellUrl(INPUTS);
  const encoded = paramsOf(url).get('c');
  const decoded = decodeComparison(encoded);
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 800);
  assert.equal(decoded.shared.shippingCharged, 15);
  assert.equal(decoded.shared.shippingCost, 9);
  assert.equal(decoded.shared.itemCost, 400);
  assert.equal(decoded.shared.packagingCost, 2);
  assert.equal(decoded.shared.otherCost, 3);

  const ebay = decoded.channels.find((channel) => channel.id === 'ebay');
  assert.ok(ebay, 'eBay must be one of the carried channels');
  assert.equal(ebay.enabled, true);
});

test('eBay-only fields do not leak into the shared payload', () => {
  const payload = whereToSellPayload(INPUTS);
  assert.equal('finalValueRate' in payload.shared, false);
  assert.equal('promotedRate' in payload.shared, false);
  assert.equal('quantity' in payload.shared, false);
});

test('a blank or negative field is left out, not sent as zero', () => {
  const payload = whereToSellPayload({ ...INPUTS, costOfGoods: '', shippingCost: '-5' });
  assert.equal('itemCost' in payload.shared, false);
  assert.equal('shippingCost' in payload.shared, false);
});

test('a crafted non-numeric value is dropped rather than reaching the target', () => {
  const url = whereToSellUrl({ ...INPUTS, price: 'not-a-number' });
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.equal('price' in decoded.shared, false);
});

test('empty input still enables eBay with an otherwise-empty comparison', () => {
  const url = whereToSellUrl({});
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels.find((channel) => channel.id === 'ebay')?.enabled, true);
});

test('two calls with the same input produce the same link', () => {
  assert.equal(whereToSellUrl(INPUTS), whereToSellUrl({ ...INPUTS }));
});
