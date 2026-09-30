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

import {
  HANDOFFS,
  EXCLUDED_HANDOFFS,
  NO_ITEM_HANDOFF,
  handoffFor,
  handoffUrl,
  handoffValues,
  handoffsForRows,
  excludedHandoffUrl,
  toolRoot,
  MOVED_TO_OSS,
  OSS_ROOT,
} from './handoff.mjs';
import { CHANNELS, EXCLUDED_CHANNELS, loadItem, compareChannels } from './calc.mjs';

// The six ranked channels' deep tools, Reverb's and Faire's calculators and
// the where-to-sell-calculator comparison page now live in the separate
// oss-monorepo repo, so their field lists can no longer be imported here; the
// cross-repo agreement checks live with them there.

// The excluded channel whose target is still in this repo. Imported from the
// target so a rename there fails here rather than silently dropping a field.
import { INPUT_IDS as WHATNOT_FIELDS } from '../whatnot-seller-payout/calc.mjs';

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

// 'every field we send is one the target calculator reads' moved with the six
// ranked deep tools to the separate oss-monorepo repo.

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

// The agreement check against where-to-sell-calculator's HANDOFFS moved with
// that page to the separate oss-monorepo repo.

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
  assert.ok(url.startsWith('https://duncan-haywood.github.io/oss-monorepo/shopify-fee-calculator/'), `unexpected href: ${url}`);
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
    assert.ok(link.href.startsWith(toolRoot(handoffFor(link.channel).slug)), `unexpected href: ${link.href}`);
    assert.ok(link.href.startsWith(OSS_ROOT), `moved deep tool is not linked absolutely: ${link.href}`);
    assert.ok(link.label.length > 0);
    assert.ok(link.channelLabel.length > 0);
  }
});

test('handoffsForRows on an empty comparison returns nothing', () => {
  assert.deepEqual(handoffsForRows([], ITEM), []);
});

// ---------------------------------------------------------------------------
// The channels this page points at instead of ranking
// ---------------------------------------------------------------------------

// reverb-fee-calculator now lives in the separate oss-monorepo repo, so only
// the in-repo Whatnot target's field list is checked here.
const EXCLUDED_TARGET_FIELDS = {
  'whatnot-seller-payout': WHATNOT_FIELDS,
};

test('every field we send an excluded channel is one its calculator reads', () => {
  for (const entry of EXCLUDED_HANDOFFS) {
    const accepted = EXCLUDED_TARGET_FIELDS[entry.slug];
    if (MOVED_TO_OSS.has(entry.slug)) continue;
    assert.ok(accepted, `no field list imported for ${entry.slug}`);
    for (const field of Object.values(entry.fields)) {
      assert.ok(
        accepted.includes(field),
        `${entry.slug} does not accept "${field}" — the link would arrive without it`,
      );
    }
  }
});

test('every excluded channel is either carried or documented as bare', () => {
  // The invariant that makes the omission of Faire readable as a decision. An
  // entry missing because nobody wrote it would otherwise look the same as one
  // left out on purpose, which is the failure `drops` already guards against
  // one level down.
  const carried = new Set(EXCLUDED_HANDOFFS.map((entry) => entry.slug));
  const bare = new Set(NO_ITEM_HANDOFF.map((entry) => entry.slug));

  for (const channel of EXCLUDED_CHANNELS) {
    const inCarried = carried.has(channel.deepTool);
    const inBare = bare.has(channel.deepTool);
    assert.ok(
      inCarried || inBare,
      `${channel.label} (${channel.deepTool}) is in neither table — decide whether its item travels`,
    );
    assert.ok(!(inCarried && inBare), `${channel.deepTool} is both carried and documented as bare`);
  }

  // And nothing in either table names a channel this page does not point at.
  const known = new Set(EXCLUDED_CHANNELS.map((channel) => channel.deepTool));
  for (const slug of [...carried, ...bare]) {
    assert.ok(known.has(slug), `${slug} is not a tool EXCLUDED_CHANNELS points at`);
  }
});

test('every bare excluded pointer states a reason', () => {
  for (const entry of NO_ITEM_HANDOFF) {
    assert.ok(
      typeof entry.why === 'string' && entry.why.length > 0,
      `${entry.slug} is left bare without a stated reason`,
    );
  }
});

test('every input is carried or documented as dropped for excluded channels', () => {
  const vocabulary = Object.keys(loadItem(ITEM)).filter((key) => key !== 'categoryId');

  for (const entry of EXCLUDED_HANDOFFS) {
    for (const key of vocabulary) {
      const carried = Object.hasOwn(entry.fields, key);
      const dropped = Object.hasOwn(entry.drops, key);
      assert.ok(
        carried || dropped,
        `${entry.slug}: "${key}" is neither mapped nor listed in drops — decide which`,
      );
      assert.ok(!(carried && dropped), `${entry.slug}: "${key}" is both mapped and dropped`);
    }
    for (const key of Object.keys(entry.drops)) {
      assert.ok(vocabulary.includes(key), `${entry.slug}: drops "${key}", not an input this page has`);
      assert.ok(
        typeof entry.drops[key] === 'string' && entry.drops[key].length > 0,
        `${entry.slug}: the drop of "${key}" needs a stated reason`,
      );
    }
  }
});

test('the category never travels to an excluded channel either', () => {
  for (const entry of EXCLUDED_HANDOFFS) {
    const url = excludedHandoffUrl(entry.slug, ITEM);
    assert.ok(!paramsOf(url).has('categoryId'), `${entry.slug} received a categoryId`);
    assert.ok(!Object.values(entry.fields).includes('categoryId'));
  }
});

// The excluded-channel agreement check against where-to-sell-calculator moved
// with that page to the separate oss-monorepo repo.

test('the item arrives on Whatnot under Whatnot names', () => {
  const params = paramsOf(excludedHandoffUrl('whatnot-seller-payout', ITEM));
  assert.equal(params.get('salePrice'), '40', 'price should arrive as salePrice');
  assert.equal(params.get('itemCost'), '12');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('shippingCost'), '5.2');
  assert.equal(params.get('otherCost'), '1.1');
  assert.ok(!params.has('price'), 'Whatnot has no "price" input; it would be dropped');
  assert.ok(!params.has('monthlyOrders'), 'Whatnot has no monthly plan to amortise');
});

test('the item arrives on Reverb under Reverb names', () => {
  const params = paramsOf(excludedHandoffUrl('reverb-fee-calculator', ITEM));
  assert.equal(params.get('price'), '40');
  assert.equal(params.get('itemCost'), '12');
  assert.equal(params.get('shippingCharged'), '6');
  assert.equal(params.get('shippingCost'), '5.2');
  assert.equal(params.get('otherCost'), '1.1');
  assert.ok(!params.has('monthlyOrders'), 'Reverb has no monthly plan fee');
});

test('Faire keeps a bare pointer, carrying no numbers', () => {
  // The whole point of NO_ITEM_HANDOFF: the link still works, it just does not
  // claim to know the wholesale price.
  const url = excludedHandoffUrl('faire-wholesale-calculator', ITEM);
  assert.equal(url, 'https://duncan-haywood.github.io/oss-monorepo/faire-wholesale-calculator/');
  assert.ok(!url.includes('#'), 'a wholesale sheet must not receive a retail price');
});

test('an unknown or unsafe slug never becomes a link', () => {
  assert.equal(excludedHandoffUrl('../../etc/passwd', ITEM), null);
  assert.equal(excludedHandoffUrl('Not A Slug', ITEM), null);
  // An unrecognised but well-formed slug falls back to the bare pointer rather
  // than to null, so a channel added to EXCLUDED_CHANNELS still renders a link
  // while its mapping is being written.
  assert.equal(excludedHandoffUrl('some-new-tool', ITEM), '../some-new-tool/');
});

test('a blank item produces a bare link rather than one full of zeroes', () => {
  // Same rule the ranked handoff follows: an explicit 0 reads as a real answer
  // on arrival, so an untouched form must not override the target's defaults.
  const url = excludedHandoffUrl('reverb-fee-calculator', {});
  assert.equal(url, 'https://duncan-haywood.github.io/oss-monorepo/reverb-fee-calculator/');
});

test('toolRoot links moved calculators absolutely and in-repo siblings relatively', () => {
  assert.equal(toolRoot('ebay-fee-calculator'), `${OSS_ROOT}ebay-fee-calculator/`);
  assert.equal(toolRoot('whatnot-seller-payout'), '../whatnot-seller-payout/');
  assert.ok(excludedHandoffUrl('whatnot-seller-payout', ITEM).startsWith('../whatnot-seller-payout/#'));
});
