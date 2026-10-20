// Decodes every link through where-to-sell-calculator's own decoder, so a
// change to its payload shape fails here instead of landing as a silently
// wrong number there.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { whereToSellUrl, whereToSellPayload } from './to-where-to-sell.mjs';
import { decodeComparison } from '../where-to-sell-calculator/share.mjs';
import { SCHEDULES } from './calc.mjs';

const INPUTS = { itemPrice: '150', buyerShipping: '0', labelCost: '9', itemCost: '60', otherCost: '2', targetProfit: '60', schedule: 'us' };

const decode = (url) => decodeComparison(new URLSearchParams(url.split('#')[1]).get('c'));
const grailedOf = (decoded) => decoded.channels.find((channel) => channel.id === 'grailed');

test('links into where-to-sell-calculator with the item renamed to its fields', () => {
  const url = whereToSellUrl(INPUTS);
  assert.match(url, /^\.\.\/where-to-sell-calculator\/#c=/);
  const decoded = decode(url);
  assert.deepEqual(decoded.shared, { price: 150, shippingCharged: 0, shippingCost: 9, itemCost: 60, otherCost: 2 });
  assert.equal(grailedOf(decoded).enabled, true);
});

test('a domestic seller sends no rates: the receiving preset is already the current schedule', () => {
  assert.deepEqual(whereToSellPayload(INPUTS).channels[0].values, {});
});

test('an international-buyer view sends its processing rate from SCHEDULES', () => {
  const intl = grailedOf(decode(whereToSellUrl({ ...INPUTS, schedule: 'intl' })));
  assert.equal(intl.paymentRate, SCHEDULES.intl.processingRate);
  assert.equal(intl.paymentFixed, SCHEDULES.intl.processingFixed);
});

test('the old flat schedule hands over as the current one rather than a wrong override', () => {
  assert.deepEqual(whereToSellPayload({ ...INPUTS, schedule: 'legacy' }).channels[0].values, {});
});

test('an unknown schedule falls back to the current one rather than throwing', () => {
  assert.deepEqual(whereToSellPayload({ ...INPUTS, schedule: 'mars' }).channels[0].values, {});
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

test('empty input still enables Grailed with an empty comparison', () => {
  const decoded = decode(whereToSellUrl({}));
  assert.deepEqual(decoded.shared, {});
  assert.equal(grailedOf(decoded).enabled, true);
});
