// The worked example on reverb-vs-ebay-for-gear.html must be what the
// calculator actually computes.
//
// WHY THIS EXISTS
//
// A guide page with numbers in it is a claim, and this one makes a specific,
// checkable claim: put *this* item through *this* tool and you get *these*
// figures. The page is static HTML, so nothing recomputes it. The moment
// someone edits a channel preset — a fee rate, a return rate, the illustrative
// days to sell — the page keeps asserting the old arithmetic under a headline
// that says "the calculator's own arithmetic on the inputs named".
//
// That is worse than an out-of-date page. A reader who follows the call to
// action, enters the same item, and gets a different answer has caught the
// portfolio being wrong about its own tool, on the page written to earn their
// trust. The fleet has already paid for the general version of this: a rule
// restated instead of imported goes stale silently (CLAUDE.md, "168 became
// 169").
//
// So the figures are not re-typed here either. This runs the scenario through
// `compareChannels` and asserts the page contains what came back. If a preset
// changes, this fails naming the figure to update — before the page can ship
// a number the tool disagrees with.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CHANNEL_PRESETS, compareChannels } from './calc.mjs';

const PAGE = 'reverb-vs-ebay-for-gear.html';
const html = readFileSync(new URL(PAGE, import.meta.url), 'utf8');

// The exact item the page describes in "The item". Changing a number here
// means changing that paragraph too — which is the point: the two cannot
// drift apart without this failing.
const ITEM = {
  price: 800,
  shippingCharged: 75,
  shippingCost: 65,
  itemCost: 450,
  packagingCost: 20,
  otherCost: 0,
  monthlyOrders: 1,
};

const compared = compareChannels(
  CHANNEL_PRESETS
    .filter((preset) => preset.id === 'ebay' || preset.id === 'reverb')
    .map((preset) => ({ ...preset, enabled: true })),
  ITEM,
);

const row = (id) => compared.results.find((result) => result.id === id);
const reverb = row('reverb');
const ebay = row('ebay');

/** As the page writes money: two decimals, no thousands separator. */
const money = (value) => `$${(Math.round(value * 100) / 100).toFixed(2)}`;

test('the page describes the item the test priced', () => {
  // Guard the guard. Every assertion below is meaningless if the prose is
  // about a different guitar than ITEM.
  assert.match(html, /\$800 guitar with \$75 shipping/);
  assert.match(html, /\$450 to\s+acquire, \$65 to ship, and \$20 to pack/);
});

test('the fee table matches what the calculator charges', () => {
  for (const [channel, result] of [['Reverb', reverb], ['eBay', ebay]]) {
    assert.ok(
      html.includes(money(result.fees.commission)),
      `${channel}: selling fee ${money(result.fees.commission)} is not on the page`,
    );
    assert.ok(
      html.includes(money(result.feeTotal)),
      `${channel}: total fees ${money(result.feeTotal)} is not on the page`,
    );
    assert.ok(
      html.includes(money(result.profit)),
      `${channel}: profit ${money(result.profit)} is not on the page`,
    );
  }
  // Reverb's processing is billed separately and is the number that explains
  // why "5% vs 13.25%" is the wrong comparison, so it is load-bearing prose.
  assert.ok(html.includes(money(reverb.fees.payment)));
});

test('the headline gap is the gap the calculator computes', () => {
  // Stated in whole dollars ("about $47") rather than to the cent, and that is
  // deliberate. The exact gap is $46.8125, which rounds to $46.81 — but the
  // two profits printed in the table above it round to $270.58 and $223.76,
  // and a reader who subtracts those gets $46.82. Printing either figure hands
  // a careful reader a page that appears to contradict its own table by a
  // cent, on a page whose whole job is to be checkable. Whole dollars is the
  // honest precision for a difference of two rounded numbers.
  const perSale = Math.round(reverb.profit - ebay.profit);
  assert.ok(
    html.includes(`about $${perSale}`),
    `the per-sale gap "about $${perSale}" is not on the page`,
  );
  const afterReturns = reverb.expectedProfit - ebay.expectedProfit;
  assert.ok(
    html.includes(money(afterReturns)),
    `the after-returns gap ${money(afterReturns)} is not on the page`,
  );
  assert.ok(html.includes(money(reverb.expectedProfit)));
  assert.ok(html.includes(money(ebay.expectedProfit)));
});

test('the velocity table matches, including which channel wins it', () => {
  assert.ok(html.includes(money(reverb.profitPerDay)));
  assert.ok(html.includes(money(ebay.profitPerDay)));
  assert.ok(html.includes(money(reverb.velocity.valuePer30Days)));
  assert.ok(html.includes(money(ebay.velocity.valuePer30Days)));

  // The whole argument of the page is that these two rankings disagree. If a
  // preset edit ever makes one channel win both, the page's central claim is
  // false and its structure has to change, not just its numbers.
  assert.ok(
    reverb.profit > ebay.profit,
    'the page says Reverb pays more per sale',
  );
  assert.ok(
    ebay.profitPerDay > reverb.profitPerDay,
    'the page says eBay pays more per day',
  );
  assert.ok(
    ebay.velocity.valuePer30Days > reverb.velocity.valuePer30Days,
    'the page says eBay is worth more per month of shelf',
  );
});

test('the price eBay would need is the one the calculator solves for', () => {
  // Rounded to whole dollars in the prose ("about $863"), because a price to
  // list at is not a two-decimal quantity.
  const needed = Math.round(ebay.priceToMatchBest);
  assert.ok(
    html.includes(`$${needed}`),
    `the match price $${needed} is not on the page`,
  );
});

test('the page carries the disclaimers every surface here carries', () => {
  assert.match(html, /No warranty\./);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /Best-effort hosting, no SLA\./);
  assert.match(html, /sponsors\/Duncan-Haywood/);
});

test('the page is honest that the rates are inputs, not published schedules', () => {
  // The one claim that would be a real liability if it drifted: these are
  // illustrative figures, and the page must not read as a fee schedule.
  assert.match(html, /[Ii]llustrative rates, not published schedules/);
  assert.match(html, /not a published fee schedule/);
});

test('the page routes to both calculators', () => {
  // It is a marketing surface for the handoff shipped in #3578; a guide page
  // that does not reach the tool is a blog post.
  assert.match(html, /href="\."/, 'links back to the comparison');
  assert.match(html, /href="\.\.\/reverb-fee-calculator\/"/, 'links to the deep tool');
});
