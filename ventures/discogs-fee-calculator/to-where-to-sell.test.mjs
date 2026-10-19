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
  itemPrice: '40',
  buyerShipping: '6',
  labelCost: '5',
  itemCost: '15',
  otherCost: '2',
  // Discogs-only fields that must not leak into the where-to-sell payload.
  targetProfit: '20',
  processingRate: 3.5,
};

function paramsOf(url) {
  const [, fragment] = url.split('#');
  return new URLSearchParams(fragment);
}

test('links to where-to-sell-calculator with the item in the fragment', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with Discogs switched on', () => {
  const url = whereToSellUrl(INPUTS);
  const encoded = paramsOf(url).get('c');
  const decoded = decodeComparison(encoded);
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 40); // itemPrice, renamed
  assert.equal(decoded.shared.shippingCharged, 6); // buyerShipping, renamed
  assert.equal(decoded.shared.shippingCost, 5); // labelCost, renamed
  assert.equal(decoded.shared.itemCost, 15);
  assert.equal(decoded.shared.otherCost, 2);

  const discogs = decoded.channels.find((channel) => channel.id === 'discogs');
  assert.ok(discogs, 'Discogs must be one of the carried channels');
  assert.equal(discogs.enabled, true);
});

test('Discogs-only fields do not leak into the shared payload', () => {
  const payload = whereToSellPayload(INPUTS);
  assert.equal('targetProfit' in payload.shared, false);
  assert.equal('processingRate' in payload.shared, false);
});

test('the fee schedule is not restated in the payload', () => {
  const payload = whereToSellPayload(INPUTS);
  // The receiving side imports the current rate from this venture's own
  // constant; a second copy travelling in a link is how a stale rule ships.
  assert.deepEqual(payload.channels[0].values, {});
  assert.equal('commissionRate' in payload.shared, false);
});

test('a blank or negative field is left out, not sent as zero', () => {
  const payload = whereToSellPayload({ ...INPUTS, itemCost: '', otherCost: '-5' });
  assert.equal('itemCost' in payload.shared, false);
  assert.equal('otherCost' in payload.shared, false);
});

test('a crafted non-numeric value is dropped rather than reaching the target', () => {
  const url = whereToSellUrl({ ...INPUTS, itemPrice: 'not-a-number' });
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.equal('price' in decoded.shared, false);
});

test('empty input still enables Discogs with an otherwise-empty comparison', () => {
  const url = whereToSellUrl({});
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels.find((channel) => channel.id === 'discogs')?.enabled, true);
});

test('two calls with the same input produce the same link', () => {
  assert.equal(whereToSellUrl(INPUTS), whereToSellUrl({ ...INPUTS }));
});
