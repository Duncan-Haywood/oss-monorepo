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

const TARGET_FIELDS = {
  'ebay-fee-calculator': EBAY_FIELDS,
  'etsy-profit-calculator': ETSY_FIELDS,
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
  for (const channel of ['amazon', 'own-store', 'local', 'other']) {
    assert.equal(handoffFor(channel), null, channel);
    assert.equal(handoffUrl(channel, SHARED), null, channel);
  }
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
  assert.deepEqual(offered.map((o) => o.channel), ['etsy', 'ebay']);
  assert.equal(offered[0].isBest, true);
  assert.equal(offered[1].isBest, false);
});

test('channels without a handoff are skipped, not rendered empty', () => {
  const offered = handoffsForResults(
    [{ id: 'own-store', label: 'Own store', rank: 1, isBest: true }],
    SHARED,
  );
  assert.deepEqual(offered, []);
});

test('each offered handoff carries a usable href and both labels', () => {
  const offered = handoffsForResults([{ id: 'ebay', label: 'eBay', rank: 1, isBest: true }], SHARED);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].channelLabel, 'eBay');
  assert.match(offered[0].label, /calculator/i);
  assert.match(offered[0].href, /^\.\.\/ebay-fee-calculator\/#/);
});
