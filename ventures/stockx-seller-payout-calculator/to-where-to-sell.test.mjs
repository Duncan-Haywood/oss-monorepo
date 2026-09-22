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
import { DEFAULTS, calculate } from './calc.mjs';
import { decodeComparison } from '../where-to-sell-calculator/share.mjs';
import { CHANNEL_PRESETS, calculateChannel } from '../where-to-sell-calculator/calc.mjs';

const INPUTS = {
  salePrice: '180',
  itemCostBasis: '100',
  shippingCost: '6',
  otherCost: '2',
  // StockX-only fields that must not leak into the where-to-sell payload.
  sellerFeePct: '9',
  fastShippingDiscountPct: '1',
  paymentProcessingFeePct: '3',
  targetMonthlyProfit: '1000',
};

function paramsOf(url) {
  const [, fragment] = url.split('#');
  return new URLSearchParams(fragment);
}

test('links to where-to-sell-calculator with the item in the fragment', () => {
  assert.match(whereToSellUrl(INPUTS), /^\.\.\/where-to-sell-calculator\/#c=/);
});

test('decodes through the real target decoder with StockX switched on', () => {
  const decoded = decodeComparison(paramsOf(whereToSellUrl(INPUTS)).get('c'));
  assert.ok(decoded, 'the target must accept the payload this module builds');
  assert.equal(decoded.shared.price, 180); // salePrice, renamed
  assert.equal(decoded.shared.itemCost, 100); // itemCostBasis, renamed
  assert.equal(decoded.shared.shippingCost, 6);
  assert.equal(decoded.shared.otherCost, 2);

  const stockx = decoded.channels.find((channel) => channel.id === 'stockx');
  assert.ok(stockx, 'StockX must be one of the carried channels');
  assert.equal(stockx.enabled, true);
});

test('the channel this module enables is one the target actually compares', () => {
  // Guard against the silent case: `decodeComparison` passes an unknown id
  // through untouched, so a typo here would arrive as a channel that simply
  // never appears in the ranking, with nothing going red on either side.
  const known = new Set(CHANNEL_PRESETS.map((preset) => preset.id));
  assert.ok(known.has(whereToSellPayload(INPUTS).channels[0].id));
});

// Not an oversight: StockX is a bid/ask marketplace where the buyer pays
// StockX for delivery, so postage a buyer pays is never seller revenue and
// this page has no input for it. Sending a zero would read on arrival as "I
// checked, and it is nothing", which for a channel whose preset already pins
// it to zero is the same answer arrived at less honestly.
test('no shipping-charged field is invented on the way out', () => {
  assert.equal('shippingCharged' in whereToSellPayload(INPUTS).shared, false);
});

test('StockX-only fields do not leak into the shared payload', () => {
  const { shared } = whereToSellPayload(INPUTS);
  for (const field of ['sellerFeePct', 'fastShippingDiscountPct', 'paymentProcessingFeePct', 'targetMonthlyProfit']) {
    assert.equal(field in shared, false, `${field} must not travel as a shared item fact`);
  }
});

test('the fee schedule is not restated in the payload', () => {
  // The receiving side builds its StockX preset by importing this venture's
  // own DEFAULTS; a second copy travelling in a link is how a stale rule
  // ships.
  const payload = whereToSellPayload(INPUTS);
  assert.deepEqual(payload.channels[0].values, {});
  assert.equal('commissionRate' in payload.shared, false);
  assert.equal('paymentRate' in payload.shared, false);
});

test('a blank or negative field is left out, not sent as zero', () => {
  const { shared } = whereToSellPayload({ ...INPUTS, itemCostBasis: '', otherCost: '-5' });
  assert.equal('itemCost' in shared, false);
  assert.equal('otherCost' in shared, false);
});

test('a crafted non-numeric value is dropped rather than reaching the target', () => {
  const decoded = decodeComparison(paramsOf(whereToSellUrl({ ...INPUTS, salePrice: 'not-a-number' })).get('c'));
  assert.equal('price' in decoded.shared, false);
});

test('empty input still enables StockX with an otherwise-empty comparison', () => {
  const decoded = decodeComparison(paramsOf(whereToSellUrl({})).get('c'));
  assert.deepEqual(decoded.shared, {});
  assert.equal(decoded.channels.find((channel) => channel.id === 'stockx')?.enabled, true);
});

test('two calls with the same input produce the same link', () => {
  assert.equal(whereToSellUrl(INPUTS), whereToSellUrl({ ...INPUTS }));
});

test('the profit a seller reads here is the profit the comparison shows for StockX', () => {
  // The whole point of the round trip. This is the assertion that would have
  // caught the defect the `otherCost` field was added to close: before it
  // existed, packaging and other per-sale cash had nowhere to land on this
  // page, and the two ends of the link disagreed about net profit on the same
  // item with nothing going red.
  const input = { ...DEFAULTS, salePrice: 180, itemCostBasis: 100, shippingCost: 6, otherCost: 2, fastShippingDiscountPct: 0 };
  const here = calculate(input);
  const decoded = decodeComparison(paramsOf(whereToSellUrl(input)).get('c'));
  const preset = CHANNEL_PRESETS.find((channel) => channel.id === 'stockx');
  const there = calculateChannel({ ...preset, enabled: true }, { ...decoded.shared, monthlyOrders: 1 });
  assert.equal(there.profit, here.netProfit, 'net profit must not jump across the handoff');
});
