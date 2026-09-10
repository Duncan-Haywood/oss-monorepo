// The failure this suite exists to prevent is silent.
//
// A field name the receiving calculator does not recognise is dropped by its
// decoder without error, and the reader lands on a page showing that tool's
// default numbers as if they were their own. They then make a pricing decision
// about an item they never entered. Nothing goes red; the answer is just wrong.
//
// That is not hypothetical in this portfolio. `share.mjs` shipped exactly this
// bug once, with its own field allowlist that quietly omitted `quantity` and
// `targetMargin`, so a shared link computed a different profit than the sender
// saw — and CLAUDE.md records two further cases of a rule copied instead of
// imported going stale and costing live product.
//
// So every assertion below checks the mapping against the *other side's own*
// field list, imported from the target venture. If Walmart renames
// `sellerShippingCost`, this suite fails here rather than the link going
// quietly wrong there.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFFS, handoffFor, handoffUrl, handoffValues, handoffsForRows } from './handoff.mjs';
import { CHANNELS, loadItem, compareChannels } from './calc.mjs';

import { INPUT_FIELDS as EBAY_FIELDS } from '../ebay-fee-calculator/calc.mjs';
import { FIELD_IDS as ETSY_FIELDS } from '../etsy-profit-calculator/share.mjs';
import { INPUT_FIELDS as AMAZON_FIELDS } from '../amazon-fba-calculator/calc.mjs';
import { INPUT_FIELDS as WALMART_FIELDS } from '../walmart-marketplace-calculator/calc.mjs';
import { FIELD_IDS as TIKTOK_FIELDS } from '../tiktok-shop-fee-calculator/calc.mjs';
import { FIELD_IDS as SHOPIFY_FIELDS } from '../shopify-fee-calculator/share.mjs';

// The other comparison page in this portfolio, imported so the two tables can
// be checked against each other rather than kept in sync by hand.
import { HANDOFFS as WHERE_TO_SELL_HANDOFFS } from '../where-to-sell-calculator/handoff.mjs';

const TARGET_FIELDS = {
  'ebay-fee-calculator': EBAY_FIELDS,
  'etsy-profit-calculator': ETSY_FIELDS,
  'amazon-fba-calculator': AMAZON_FIELDS,
  'walmart-marketplace-calculator': WALMART_FIELDS,
  'tiktok-shop-fee-calculator': TIKTOK_FIELDS,
  'shopify-fee-calculator': SHOPIFY_FIELDS,
};

const ITEM = {
  price: 40,
  shippingCharged: 6,
  itemCost: 12,
  shippingCost: 5.2,
  otherCost: 1.1,
  monthlyOrders: 50,
  categoryId: 'everything_else',
};

const paramsOf = (url) => new URLSearchParams(url.slice(url.indexOf('#') + 1));

// ---------------------------------------------------------------------------
// The mapping matches what the other side actually accepts
// ---------------------------------------------------------------------------

test('every field we send is one the target calculator reads', () => {
  for (const entry of HANDOFFS) {
    const accepted = TARGET_FIELDS[entry.slug];
    assert.ok(accepted, `no field list imported for ${entry.slug}`);
    for (const field of Object.values(entry.fields)) {
      assert.ok(
        accepted.includes(field),
        `${entry.slug} does not accept "${field}" — the link would arrive without it`,
      );
    }
  }
});

test('every channel we hand off to is a channel this page ranks', () => {
  const known = new Set(CHANNELS.map((channel) => channel.id));
  for (const entry of HANDOFFS) {
    assert.ok(known.has(entry.channel), `${entry.channel} is not a channel on this page`);
  }
});

test('every channel this page ranks has a handoff', () => {
  // The point of this page is that all six rows are comparable, so all six
  // deserve the same way out. A channel added to `CHANNELS` without an entry
  // here would keep only the bare link it has always had, and the omission
  // would be invisible — nothing renders differently except a missing row in a
  // list nobody counts.
  for (const channel of CHANNELS) {
    assert.ok(handoffFor(channel.id), `channel "${channel.id}" has no handoff entry`);
  }
});

test('each handoff points at the deep tool the channel itself names', () => {
  // `CHANNELS[].deepTool` already drove the bare link and the "not included
  // here" copy. Deriving nothing from it and writing the slug out again would
  // let the two disagree, which reads on the page as a caveat about one
  // calculator above a link into a different one.
  for (const entry of HANDOFFS) {
    const channel = CHANNELS.find((candidate) => candidate.id === entry.channel);
    assert.equal(
      entry.slug,
      channel.deepTool,
      `handoff for ${entry.channel} targets ${entry.slug} but the channel names ${channel.deepTool}`,
    );
  }
});

test('a channel is never mapped twice', () => {
  const channels = HANDOFFS.map((entry) => entry.channel);
  assert.equal(new Set(channels).size, channels.length);
});

// ---------------------------------------------------------------------------
// Nothing is dropped by accident
// ---------------------------------------------------------------------------

test('every input this page holds is either carried or documented as dropped', () => {
  // The whole vocabulary, taken from `loadItem` rather than restated, so a new
  // input added to the item cannot slip past every handoff unnoticed.
  const vocabulary = Object.keys(loadItem(ITEM)).filter((key) => key !== 'categoryId');

  for (const entry of HANDOFFS) {
    for (const key of vocabulary) {
      const carried = Object.hasOwn(entry.fields, key);
      const dropped = Object.hasOwn(entry.drops, key);
      assert.ok(
        carried || dropped,
        `${entry.slug}: "${key}" is neither mapped nor listed in drops — decide which`,
      );
      assert.ok(
        !(carried && dropped),
        `${entry.slug}: "${key}" is both mapped and listed as dropped`,
      );
    }
    for (const key of Object.keys(entry.drops)) {
      assert.ok(
        vocabulary.includes(key),
        `${entry.slug}: drops "${key}", which is not an input this page has`,
      );
      assert.ok(
        typeof entry.drops[key] === 'string' && entry.drops[key].length > 0,
        `${entry.slug}: the drop of "${key}" needs a stated reason`,
      );
    }
  }
});

test('the category never travels', () => {
  // Each deep calculator carries its own category taxonomy — Amazon's referral
  // tiers, Walmart's, TikTok's rate schedule — and they do not share ids with
  // this page's. Sending `everything_else` into one of them would either be
  // rejected or, worse, silently match a category that means something else.
  for (const entry of HANDOFFS) {
    const url = handoffUrl(entry.channel, ITEM);
    assert.ok(!paramsOf(url).has('categoryId'), `${entry.slug} received a categoryId`);
    assert.ok(
      !Object.values(entry.fields).includes('categoryId'),
      `${entry.slug} maps something onto categoryId`,
    );
  }
});

// ---------------------------------------------------------------------------
// This page and its sibling comparison tool agree
// ---------------------------------------------------------------------------

test('shared targets get the same field names from both comparison pages', () => {
  // `where-to-sell-calculator` links into four of the same calculators. If the
  // two pages map `itemCost` onto different inputs of the same tool, one of
  // them is wrong, and the wrong one produces a plausible number rather than an
  // error. Asserted rather than kept in sync by hand: this repository has paid
  // twice for a copied rule going stale (CLAUDE.md, "168 became 169").
  const bySlug = new Map(WHERE_TO_SELL_HANDOFFS.map((entry) => [entry.slug, entry]));
  let compared = 0;

  for (const entry of HANDOFFS) {
    const sibling = bySlug.get(entry.slug);
    if (!sibling) continue;
    for (const [source, target] of Object.entries(entry.fields)) {
      if (!Object.hasOwn(sibling.fields, source)) continue;
      assert.equal(
        target,
        sibling.fields[source],
        `${entry.slug}: this page sends ${source} as "${target}", where-to-sell sends it as "${sibling.fields[source]}"`,
      );
      compared += 1;
    }
  }

  // Guard the guard: if either table is renamed so nothing lines up, the loop
  // above would pass vacuously.
  assert.ok(compared >= 12, `only ${compared} field pairs compared — the tables stopped lining up`);
});

// ---------------------------------------------------------------------------
// The numbers survive the trip
// ---------------------------------------------------------------------------

test('the item arrives on eBay under eBay names', () => {
  const params = paramsOf(handoffUrl('ebay', ITEM));
  assert.equal(params.get('price'), '40');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('shippingCost'), '5.2');
  assert.equal(params.get('costOfGoods'), '12');
  assert.equal(params.get('otherCost'), '1.1');
});

test('the item arrives on TikTok Shop under TikTok names', () => {
  const params = paramsOf(handoffUrl('tiktok', ITEM));
  assert.equal(params.get('itemPrice'), '40');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('fulfillmentCost'), '5.2');
  assert.equal(params.get('cogs'), '12');
  assert.equal(params.get('otherPerOrder'), '1.1');
});

test('Walmart and Amazon receive the volume their subscription is spread over', () => {
  assert.equal(paramsOf(handoffUrl('walmart', ITEM)).get('monthlyUnits'), '50');
  assert.equal(paramsOf(handoffUrl('amazon', ITEM)).get('monthlyUnits'), '50');
});

test('postage is withheld from the two channels that cannot receive it', () => {
  for (const channel of ['amazon', 'walmart']) {
    const params = paramsOf(handoffUrl(channel, ITEM));
    assert.ok(!params.has('shippingCharged'), `${channel} received shippingCharged`);
    // And it is not smuggled into the price either, which is the mistake the
    // drop exists to prevent.
    assert.equal(params.get('salePrice'), '40');
  }
});

test('a blank input is left out so the target keeps its own default', () => {
  const params = paramsOf(handoffUrl('ebay', { ...ITEM, otherCost: '' }));
  assert.ok(!params.has('otherCost'));
  // An explicit zero is a real answer and must still travel.
  assert.equal(paramsOf(handoffUrl('ebay', { ...ITEM, otherCost: 0 })).get('otherCost'), '0');
});

test('a nonsense or negative input never travels', () => {
  for (const bad of ['abc', NaN, Infinity, -3, null, undefined]) {
    const params = paramsOf(handoffUrl('ebay', { ...ITEM, itemCost: bad }));
    assert.ok(!params.has('costOfGoods'), `${String(bad)} reached the target`);
  }
});

test('values ride in the fragment, not the query string', () => {
  // A fragment is not sent to any server and does not appear in a Referer
  // header, so the seller's cost of goods stays in their own browser. This is
  // the same property the page's own share link depends on.
  const url = handoffUrl('shopify', ITEM);
  assert.ok(url.includes('#'), 'no fragment');
  assert.ok(!url.slice(0, url.indexOf('#')).includes('?'), 'values leaked into a query string');
  assert.ok(url.startsWith('../shopify-fee-calculator/'), `unexpected href: ${url}`);
});

test('an unknown channel gets no link rather than a broken one', () => {
  assert.equal(handoffFor('poshmark'), null);
  assert.equal(handoffUrl('poshmark', ITEM), null);
});

test('handoffValues on no entry is empty rather than throwing', () => {
  assert.deepEqual(handoffValues(null, ITEM), {});
});

// ---------------------------------------------------------------------------
// The list the page renders
// ---------------------------------------------------------------------------

test('handoffsForRows follows the ranking, best first', () => {
  const item = loadItem(ITEM);
  const rows = compareChannels(item);
  const links = handoffsForRows(rows, item);

  assert.equal(links.length, rows.length, 'every ranked row should offer a way out');
  assert.equal(links[0].channel, rows[0].id, 'the winner is not first');
  assert.equal(links[0].isBest, true);
  assert.ok(links.slice(1).every((link) => link.isBest === false), 'more than one row marked best');
  for (const link of links) {
    assert.ok(link.href.startsWith('../'), `href is not relative: ${link.href}`);
    assert.ok(link.label.length > 0);
    assert.ok(link.channelLabel.length > 0);
  }
});

test('handoffsForRows on an empty comparison returns nothing', () => {
  assert.deepEqual(handoffsForRows([], ITEM), []);
});
