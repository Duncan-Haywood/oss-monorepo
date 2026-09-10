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
  price: '60',
  shippingCharged: '8',
  shippingCost: '6',
  costOfGoods: '20',
  packagingCost: '1.5',
  otherCost: '2',
  monthlyOrders: '150',
  // Shopify-only fields that must not leak into the where-to-sell payload.
  paymentsRate: '2.9',
  shopifyTxnRate: '2',
  monthlyPlan: '39',
};

function paramsOf(url) {
  const [, fragment] = url.split('#');
  return new URLSearchParams(fragment);
}

test('links to where-to-sell-calculator with the item in the fragment', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with the own-store channel switched on', () => {
  const url = whereToSellUrl(INPUTS);
  const encoded = paramsOf(url).get('c');
  const decoded = decodeComparison(encoded);
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 60);
  assert.equal(decoded.shared.shippingCharged, 8);
  assert.equal(decoded.shared.shippingCost, 6);
  assert.equal(decoded.shared.itemCost, 20);
  assert.equal(decoded.shared.packagingCost, 1.5);
  assert.equal(decoded.shared.otherCost, 2);
  assert.equal(decoded.shared.monthlyOrders, 150);

  const ownStore = decoded.channels.find((channel) => channel.id === 'own-store');
  assert.ok(ownStore, 'own-store must be one of the carried channels');
  assert.equal(ownStore.enabled, true);
});

test('Shopify-only fields do not leak into the shared payload', () => {
  const payload = whereToSellPayload(INPUTS);
  assert.equal('paymentsRate' in payload.shared, false);
  assert.equal('shopifyTxnRate' in payload.shared, false);
  assert.equal('monthlyPlan' in payload.shared, false);
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

test('empty input still enables the own-store channel with an otherwise-empty comparison', () => {
  const url = whereToSellUrl({});
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels.find((channel) => channel.id === 'own-store')?.enabled, true);
});

test('two calls with the same input produce the same link', () => {
  assert.equal(whereToSellUrl(INPUTS), whereToSellUrl({ ...INPUTS }));
});
