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
  itemPrice: '50',
  shippingCharged: '5',
  fulfillmentCost: '4',
  cogs: '15',
  otherPerOrder: '2',
  // TikTok Shop-only fields that must not leak into the where-to-sell payload.
  referralRate: '6',
  facilitationRate: '1.5',
  affiliateRate: '10',
};

function paramsOf(url) {
  const [, fragment] = url.split('#');
  return new URLSearchParams(fragment);
}

test('links to where-to-sell-calculator with the item in the fragment', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with TikTok Shop switched on', () => {
  const url = whereToSellUrl(INPUTS);
  const encoded = paramsOf(url).get('c');
  const decoded = decodeComparison(encoded);
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 50);
  assert.equal(decoded.shared.shippingCharged, 5);
  assert.equal(decoded.shared.shippingCost, 4); // fulfillmentCost, renamed
  assert.equal(decoded.shared.itemCost, 15); // cogs, renamed
  assert.equal(decoded.shared.otherCost, 2); // otherPerOrder, renamed

  const tiktok = decoded.channels.find((channel) => channel.id === 'tiktok');
  assert.ok(tiktok, 'TikTok Shop must be one of the carried channels');
  assert.equal(tiktok.enabled, true);
});

test('TikTok Shop-only fields do not leak into the shared payload', () => {
  const payload = whereToSellPayload(INPUTS);
  assert.equal('referralRate' in payload.shared, false);
  assert.equal('facilitationRate' in payload.shared, false);
  assert.equal('affiliateRate' in payload.shared, false);
});

test('a blank or negative field is left out, not sent as zero', () => {
  const payload = whereToSellPayload({ ...INPUTS, cogs: '', fulfillmentCost: '-4' });
  assert.equal('itemCost' in payload.shared, false);
  assert.equal('shippingCost' in payload.shared, false);
});

test('a crafted non-numeric value is dropped rather than reaching the target', () => {
  const url = whereToSellUrl({ ...INPUTS, itemPrice: 'not-a-number' });
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.equal('price' in decoded.shared, false);
});

test('empty input still enables TikTok Shop with an otherwise-empty comparison', () => {
  const url = whereToSellUrl({});
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels.find((channel) => channel.id === 'tiktok')?.enabled, true);
});

test('two calls with the same input produce the same link', () => {
  assert.equal(whereToSellUrl(INPUTS), whereToSellUrl({ ...INPUTS }));
});
