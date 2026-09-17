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
  salePrice: '42',
  itemCost: '12',
  otherCost: '2',
  // Poshmark-only fields that must not leak into the where-to-sell payload.
  targetProfit: '15',
  listedPrice: '48',
  offerPrice: '38',
};

function paramsOf(url) {
  const [, fragment] = url.split('#');
  return new URLSearchParams(fragment);
}

test('links to where-to-sell-calculator with the item in the fragment', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with Poshmark switched on', () => {
  const url = whereToSellUrl(INPUTS);
  const encoded = paramsOf(url).get('c');
  const decoded = decodeComparison(encoded);
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 42); // salePrice, renamed
  assert.equal(decoded.shared.itemCost, 12);
  assert.equal(decoded.shared.otherCost, 2);

  const poshmark = decoded.channels.find((channel) => channel.id === 'poshmark');
  assert.ok(poshmark, 'Poshmark must be one of the carried channels');
  assert.equal(poshmark.enabled, true);
});

// Not an oversight: the buyer buys a prepaid label from Poshmark, so postage
// is neither seller revenue nor a seller cost and this page has no input for
// it. Sending a zero would read on arrival as "I checked, and it is nothing",
// which for a channel whose preset already starts both at zero is the same
// answer arrived at less honestly.
test('no shipping field is invented on the way out', () => {
  const payload = whereToSellPayload(INPUTS);
  assert.equal('shippingCharged' in payload.shared, false);
  assert.equal('shippingCost' in payload.shared, false);
});

test('Poshmark-only fields do not leak into the shared payload', () => {
  const payload = whereToSellPayload(INPUTS);
  assert.equal('targetProfit' in payload.shared, false);
  assert.equal('listedPrice' in payload.shared, false);
  assert.equal('offerPrice' in payload.shared, false);
});

test('the two-tier schedule is not restated in the payload', () => {
  const payload = whereToSellPayload(INPUTS);
  // The receiving side imports these from this venture's own constants; a
  // second copy travelling in a link is how a stale rule ships.
  assert.deepEqual(payload.channels[0].values, {});
  assert.equal('commissionRate' in payload.shared, false);
  assert.equal('commissionThreshold' in payload.shared, false);
  assert.equal('commissionFlatBelow' in payload.shared, false);
});

test('a blank or negative field is left out, not sent as zero', () => {
  const payload = whereToSellPayload({ ...INPUTS, itemCost: '', otherCost: '-5' });
  assert.equal('itemCost' in payload.shared, false);
  assert.equal('otherCost' in payload.shared, false);
});

test('a crafted non-numeric value is dropped rather than reaching the target', () => {
  const url = whereToSellUrl({ ...INPUTS, salePrice: 'not-a-number' });
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.equal('price' in decoded.shared, false);
});

test('empty input still enables Poshmark with an otherwise-empty comparison', () => {
  const url = whereToSellUrl({});
  const decoded = decodeComparison(paramsOf(url).get('c'));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels.find((channel) => channel.id === 'poshmark')?.enabled, true);
});

test('two calls with the same input produce the same link', () => {
  assert.equal(whereToSellUrl(INPUTS), whereToSellUrl({ ...INPUTS }));
});
