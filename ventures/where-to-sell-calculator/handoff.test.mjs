// The failure this suite exists to prevent is silent.
//
// A field name the receiving calculator does not recognise is dropped by its
// decoder without error, and the reader lands on a page showing that tool's
// default numbers as if they were their own. They then make a pricing decision
// on an item they never entered. Nothing goes red; the answer is just wrong.
//
// That is not hypothetical — `share.mjs` shipped exactly this bug once, with
// its own field allowlist that quietly omitted `quantity` and `targetMargin`,
// so a shared link computed a different profit than the sender saw.
//
// So the tests below check the mapping against each target's *own* field list,
// imported from the target itself. If eBay renames `costOfGoods`, this suite
// fails in this venture rather than the link going quietly wrong in that one.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFFS, handoffFor, handoffUrl, handoffValues, handoffsForResults } from './handoff.mjs';
import { CHANNEL_PRESETS } from './calc.mjs';

import { INPUT_FIELDS as EBAY_FIELDS } from '../ebay-fee-calculator/calc.mjs';
import { FIELD_IDS as ETSY_FIELDS } from '../etsy-profit-calculator/share.mjs';
import { INPUT_FIELDS as AMAZON_FIELDS } from '../amazon-fba-calculator/calc.mjs';
import { FIELD_IDS as SHOPIFY_FIELDS } from '../shopify-fee-calculator/share.mjs';
import { INPUT_FIELDS as REVERB_FIELDS } from '../reverb-fee-calculator/calc.mjs';
import { FIELD_IDS as TIKTOK_FIELDS } from '../tiktok-shop-fee-calculator/calc.mjs';
import { INPUT_IDS as WHATNOT_FIELDS } from '../whatnot-seller-payout/calc.mjs';

const TARGET_FIELDS = {
  'ebay-fee-calculator': EBAY_FIELDS,
  'etsy-profit-calculator': ETSY_FIELDS,
  'amazon-fba-calculator': AMAZON_FIELDS,
  'shopify-fee-calculator': SHOPIFY_FIELDS,
  'reverb-fee-calculator': REVERB_FIELDS,
  'tiktok-shop-fee-calculator': TIKTOK_FIELDS,
  'whatnot-seller-payout': WHATNOT_FIELDS,
};

const SHARED = {
  price: 40,
  shippingCharged: 6,
  shippingCost: 5.2,
  itemCost: 12,
  packagingCost: 1.1,
  otherCost: 0.9,
};

const paramsOf = (url) => new URLSearchParams(url.slice(url.indexOf('#') + 1));

// ---------------------------------------------------------------------------
// The mapping matches what the other side actually accepts
// ---------------------------------------------------------------------------

test('every field we send is one the target calculator reads', () => {
  for (const entry of HANDOFFS) {
    const accepted = TARGET_FIELDS[entry.slug];
    assert.ok(accepted, `no field list imported for ${entry.slug}`);
    const sent = [...Object.values(entry.fields), ...Object.keys(entry.combine ?? {})];
    for (const field of sent) {
      assert.ok(
        accepted.includes(field),
        `${entry.slug} does not accept "${field}" — the link would arrive without it`,
      );
    }
  }
});

test('every channel we hand off to is a channel this page compares', () => {
  const known = new Set(CHANNEL_PRESETS.map((preset) => preset.id));
  for (const entry of HANDOFFS) {
    assert.ok(known.has(entry.channel), `${entry.channel} is not a channel on this page`);
  }
});

test('a channel is never mapped twice', () => {
  const channels = HANDOFFS.map((entry) => entry.channel);
  assert.equal(new Set(channels).size, channels.length);
});

// ---------------------------------------------------------------------------
// The numbers survive the trip
// ---------------------------------------------------------------------------

test('the item arrives with the numbers that were on screen', () => {
  const params = paramsOf(handoffUrl('ebay', SHARED));
  assert.equal(params.get('price'), '40');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('shippingCost'), '5.2');
  assert.equal(params.get('costOfGoods'), '12'); // itemCost, renamed
  assert.equal(params.get('packagingCost'), '1.1');
  assert.equal(params.get('otherCost'), '0.9');
});

test('a cost the target has no field for is folded in, not dropped', () => {
  // Etsy has no packaging input; packaging is part of what it calls materials.
  // Dropping it would understate cost and overstate profit on arrival.
  const params = paramsOf(handoffUrl('etsy', SHARED));
  assert.equal(params.get('materialCost'), String(SHARED.itemCost + SHARED.packagingCost));
  assert.equal(params.get('packagingCost'), null);
});

test('Reverb receives packaging folded into its general other-cost field', () => {
  // Reverb's calculator has no packaging input — gear packing is not a flat
  // per-order cost there. Dropping it would overstate profit on arrival, which
  // is the whole failure mode this module exists to prevent.
  const params = paramsOf(handoffUrl('reverb', SHARED));
  assert.equal(params.get('otherCost'), String(SHARED.otherCost + SHARED.packagingCost));
  assert.equal(params.get('packagingCost'), null);
  // The rest of the item is named identically on both sides and rides across
  // unrenamed.
  assert.equal(params.get('price'), '40');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('shippingCost'), '5.2');
  assert.equal(params.get('itemCost'), '12');
});

test('a blank input is left out so the target keeps its own default', () => {
  // Better an honest default than a silent zero the reader reads as an answer.
  const params = paramsOf(handoffUrl('ebay', { ...SHARED, otherCost: '' }));
  assert.equal(params.get('otherCost'), null);
  assert.equal(params.get('price'), '40');
});

test('nonsense and negative inputs never travel', () => {
  for (const bad of ['abc', NaN, -5, Infinity, null, undefined]) {
    const params = paramsOf(handoffUrl('ebay', { ...SHARED, price: bad }));
    assert.equal(params.get('price'), null, `price=${String(bad)} should not be sent`);
  }
});

test('an empty comparison still produces a usable link', () => {
  const url = handoffUrl('ebay', {});
  assert.equal(url, '../ebay-fee-calculator/');
  assert.ok(!url.includes('#'), 'no fragment rather than an empty one');
});

test('the same inputs always encode identically', () => {
  // Sorted keys, so a link is stable and comparable between renders.
  assert.equal(handoffUrl('ebay', SHARED), handoffUrl('ebay', { ...SHARED }));
});

// ---------------------------------------------------------------------------
// Links behave wherever the site is served from
// ---------------------------------------------------------------------------

test('links are relative, so they survive a path prefix or a custom domain', () => {
  for (const entry of HANDOFFS) {
    const url = handoffUrl(entry.channel, SHARED);
    assert.ok(url.startsWith('../'), `${entry.channel}: ${url}`);
    assert.ok(!/^[a-z]+:|^\/\//i.test(url), 'no scheme and no origin');
  }
});

test('values ride in the fragment, which no server ever receives', () => {
  const url = handoffUrl('ebay', SHARED);
  assert.ok(url.includes('#'));
  assert.ok(!url.includes('?'), 'a query string would be sent to the host');
});

// ---------------------------------------------------------------------------
// Channels without a deep calculator
// ---------------------------------------------------------------------------

test('a channel with no prefillable calculator gets no link', () => {
  // A link that silently arrives showing someone else's defaults is worse
  // than no link, so these are omitted rather than pointed somewhere close.
  // `own-store` and `local` have no dedicated calculator in the portfolio that
  // accepts inputs from a link; `other` is whatever the seller typed in, so
  // there is nothing to point at.
  for (const channel of ['local', 'other']) {
    assert.equal(handoffFor(channel), null, channel);
    assert.equal(handoffUrl(channel, SHARED), null, channel);
  }
});

test('Amazon carries the item into the FBA-vs-FBM calculator', () => {
  // This page prices Amazon as one channel. The question it leaves open —
  // whether to send the unit to FBA or ship it yourself — is the first thing
  // the dedicated calculator answers, and it needs the item to answer it.
  const url = handoffUrl('amazon', SHARED);
  assert.match(url, /^\.\.\/amazon-fba-calculator\/#/);
  const params = paramsOf(url);
  assert.equal(params.get('salePrice'), '40');
  assert.equal(params.get('costOfGoods'), '12');
  assert.equal(params.get('fbmShippingCost'), '5.2');
  assert.equal(params.get('packagingCost'), '1.1');
});

test('postage charged to the buyer is dropped on the Amazon handoff, not folded in', () => {
  // Amazon's referral fee is charged on the order total, but that calculator
  // takes the sale price and derives fulfilment from the size tier rather than
  // from what the buyer paid for postage. Adding `shippingCharged` into
  // `salePrice` would inflate the referral fee and print a worse number than
  // the seller will actually see, so it is deliberately not carried.
  const params = paramsOf(handoffUrl('amazon', SHARED));
  assert.equal(params.get('salePrice'), '40', 'sale price must be the item price alone');
  assert.equal(params.has('shippingCharged'), false);
});

test('an unknown channel id is handled rather than thrown on', () => {
  assert.equal(handoffUrl('not-a-channel', SHARED), null);
  assert.deepEqual(handoffValues(null, SHARED), {});
});

// ---------------------------------------------------------------------------
// Ordering follows the ranking the reader is looking at
// ---------------------------------------------------------------------------

test('handoffs come back best-channel first, not table-order first', () => {
  const results = [
    { id: 'etsy', label: 'Etsy', rank: 1, isBest: true },
    { id: 'amazon', label: 'Amazon', rank: 2 },
    { id: 'ebay', label: 'eBay', rank: 3 },
  ];
  const offered = handoffsForResults(results, SHARED);
  assert.deepEqual(offered.map((o) => o.channel), ['etsy', 'amazon', 'ebay']);
  assert.equal(offered[0].isBest, true);
  assert.equal(offered[1].isBest, false);
});

test('channels without a handoff are skipped, not rendered empty', () => {
  const offered = handoffsForResults(
    [{ id: 'local', label: 'Local / direct', rank: 1, isBest: true }],
    SHARED,
  );
  assert.deepEqual(offered, []);
});

test('an own store carries the item into the Shopify calculator', () => {
  // This page prices an own store as "no commission, you pay the plan and card
  // processing". Which processor is the decision it leaves open, and Shopify
  // charges an extra third-party transaction fee on top of an outside one.
  const url = handoffUrl('own-store', { ...SHARED, monthlyOrders: 120 });
  assert.match(url, /^\.\.\/shopify-fee-calculator\/#/);
  const params = paramsOf(url);
  assert.equal(params.get('price'), '40');
  assert.equal(params.get('costOfGoods'), '12');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('packagingCost'), '1.1');
});

test('monthly order count travels to Shopify, because the plan is amortised over it', () => {
  // Without it the plan is spread over this page's default order count rather
  // than the seller's, and an own store can win on fees and lose on cash.
  assert.equal(paramsOf(handoffUrl('own-store', { ...SHARED, monthlyOrders: 120 })).get('monthlyOrders'), '120');
  // ...and no other target has a field for it, so it must not leak sideways.
  assert.equal(paramsOf(handoffUrl('ebay', { ...SHARED, monthlyOrders: 120 })).has('monthlyOrders'), false);
});

test('TikTok Shop carries the item into its own calculator, with packaging folded into other-per-order', () => {
  const url = handoffUrl('tiktok', SHARED);
  assert.match(url, /^\.\.\/tiktok-shop-fee-calculator\/#/);
  const params = paramsOf(url);
  assert.equal(params.get('itemPrice'), '40');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('fulfillmentCost'), '5.2'); // shippingCost, renamed
  assert.equal(params.get('otherPerOrder'), String(SHARED.otherCost + SHARED.packagingCost));
  assert.equal(params.get('packagingCost'), null);
});

test('Whatnot carries the item into its own calculator, with packaging folded into other cost', () => {
  const url = handoffUrl('whatnot', SHARED);
  assert.match(url, /^\.\.\/whatnot-seller-payout\/#/);
  const params = paramsOf(url);
  assert.equal(params.get('salePrice'), '40');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('shippingCost'), '5.2');
  assert.equal(params.get('itemCost'), '12');
  assert.equal(params.get('otherCost'), String(SHARED.otherCost + SHARED.packagingCost));
  assert.equal(params.get('packagingCost'), null);
});

test('each offered handoff carries a usable href and both labels', () => {
  const offered = handoffsForResults([{ id: 'ebay', label: 'eBay', rank: 1, isBest: true }], SHARED);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].channelLabel, 'eBay');
  assert.match(offered[0].label, /calculator/i);
  assert.match(offered[0].href, /^\.\.\/ebay-fee-calculator\/#/);
});
