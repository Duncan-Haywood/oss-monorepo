// Decodes every link through where-to-sell-calculator's own decoder, so a
// renamed field or payload shape there fails here instead of arriving as a
// silently wrong number.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { whereToSellUrl, whereToSellPayload } from './to-where-to-sell.mjs';
import { decodeComparison } from '../where-to-sell-calculator/share.mjs';
import { SCHEDULES } from './calc.mjs';

const INPUTS = {
  itemPrice: '40',
  quantity: '1',
  buyerShipping: '1.31',
  shippingCost: '0.78',
  itemCost: '15',
  otherCost: '0.2',
  targetProfit: '20',
  schedule: 'standard',
};

const decode = (url) => decodeComparison(new URLSearchParams(url.split('#')[1]).get('c'));

test('links to where-to-sell-calculator with the sale in the fragment', () => {
  assert.match(whereToSellUrl(INPUTS), /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with the sale carried over', () => {
  const decoded = decode(whereToSellUrl(INPUTS));
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 40);
  assert.equal(decoded.shared.shippingCharged, 1.31);
  assert.equal(decoded.shared.shippingCost, 0.78);
  assert.equal(decoded.shared.itemCost, 15);
  assert.equal(decoded.shared.otherCost, 0.2);
});

test('the Other row arrives on with this page\'s rates', () => {
  const other = decode(whereToSellUrl(INPUTS)).channels.find((c) => c.id === 'other');
  assert.ok(other);
  assert.equal(other.enabled, true);
  assert.equal(other.commissionRate, 10.75);
  assert.equal(other.paymentRate, 2.5);
  assert.equal(other.paymentFixed, 0.3);
});

test('the Pro schedule sends its combined commission', () => {
  const other = decode(whereToSellUrl({ ...INPUTS, schedule: 'pro' })).channels[0];
  const expected = SCHEDULES.pro.lines.reduce((s, l) => s + l.rate, 0);
  assert.equal(other.commissionRate, expected);
});

test('an unknown schedule falls back to the standard one', () => {
  const other = decode(whereToSellUrl({ ...INPUTS, schedule: 'nope' })).channels[0];
  assert.equal(other.commissionRate, 10.75);
});

test('multi-quantity orders send rates only, not per-order amounts', () => {
  const decoded = decode(whereToSellUrl({ ...INPUTS, quantity: '4' }));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels[0].commissionRate, 10.75);
});

test('TCGplayer-only fields do not leak into the shared payload', () => {
  const { shared } = whereToSellPayload(INPUTS);
  assert.equal('targetProfit' in shared, false);
  assert.equal('schedule' in shared, false);
  assert.equal('quantity' in shared, false);
});

test('a blank, negative or non-numeric field is left out, not sent as zero', () => {
  const { shared } = whereToSellPayload({ ...INPUTS, itemCost: '', otherCost: '-5', itemPrice: 'x' });
  assert.deepEqual(Object.keys(shared).sort(), ['shippingCharged', 'shippingCost']);
});

test('empty input still enables the Other row', () => {
  const decoded = decode(whereToSellUrl({}));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels[0].enabled, true);
});
