// Decodes every link through where-to-sell-calculator's own decoder, so a
// change to its payload shape fails here instead of landing as a silently
// wrong number there.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { whereToSellUrl, whereToSellPayload } from './to-where-to-sell.mjs';
import { decodeComparison } from '../where-to-sell-calculator/share.mjs';
import { REGIONS, BOOST_RATE } from './calc.mjs';

const INPUTS = { itemPrice: '35', buyerShipping: '5', labelCost: '4', itemCost: '10', otherCost: '0.5', targetProfit: '15', region: 'us' };

const decode = (url) => decodeComparison(new URLSearchParams(url.split('#')[1]).get('c'));
const depopOf = (decoded) => decoded.channels.find((channel) => channel.id === 'depop');

test('links into where-to-sell-calculator with the item renamed to its fields', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
  const decoded = decode(url);
  assert.deepEqual(decoded.shared, { price: 35, shippingCharged: 5, shippingCost: 4, itemCost: 10, otherCost: 0.5 });
  assert.equal(depopOf(decoded).enabled, true);
});

test('a US seller sends no rates: the receiving preset is already US', () => {
  assert.deepEqual(whereToSellPayload(INPUTS).channels[0].values, {});
});

test('UK and rest-of-world sellers send their own schedule from REGIONS', () => {
  const uk = depopOf(decode(whereToSellUrl({ ...INPUTS, region: 'uk' })));
  assert.equal(uk.commissionRate, REGIONS.uk.sellingRate);
  assert.equal(uk.paymentRate, REGIONS.uk.processingRate);
  assert.equal(uk.paymentFixed, REGIONS.uk.processingFixed);
  const row = depopOf(decode(whereToSellUrl({ ...INPUTS, region: 'row' })));
  assert.equal(row.commissionRate, REGIONS.row.sellingRate);
  assert.equal(row.paymentRate, 0);
});

test('a boosted sale adds the boost rate to the commission', () => {
  const boosted = depopOf(decode(whereToSellUrl({ ...INPUTS, boosted: true })));
  assert.equal(boosted.commissionRate, REGIONS.us.sellingRate + BOOST_RATE);
  assert.equal(boosted.paymentRate, REGIONS.us.processingRate);
});

test('an unknown region falls back to US rather than throwing', () => {
  assert.deepEqual(whereToSellPayload({ ...INPUTS, region: 'mars' }).channels[0].values, {});
});

test('page-only fields do not leak, and blank or negative fields are left out', () => {
  const payload = whereToSellPayload({ ...INPUTS, itemCost: '', otherCost: '-5' });
  assert.equal('targetProfit' in payload.shared, false);
  assert.equal('itemCost' in payload.shared, false);
  assert.equal('otherCost' in payload.shared, false);
});

test('a crafted non-numeric value is dropped', () => {
  assert.equal('price' in decode(whereToSellUrl({ ...INPUTS, itemPrice: 'nope' })).shared, false);
});

test('empty input still enables Depop with an empty comparison', () => {
  const decoded = decode(whereToSellUrl({}));
  assert.deepEqual(decoded.shared, {});
  assert.equal(depopOf(decoded).enabled, true);
});
