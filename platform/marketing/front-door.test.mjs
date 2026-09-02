import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { ABOUT_PATH, ALL_CATEGORIES, FEED_FILE, SOCIAL_CARD_FILE, categoryPagePath } from '../pages/build.mjs';
import {
  FRONT_DOOR_URL,
  OUTPUT_FILE,
  PROMISE,
  SITE_NAME,
  TOOLS_URL,
  buildFrontDoor,
  categoryAnchor,
  categoryCounts,
  mirroredByCategory,
  orderedCategories,
  publishedSlugs,
  renderFrontDoor,
} from './front-door.mjs';

// Real slugs, so `categoryFor` classifies them the way it classifies the live
// catalogue rather than falling to `more` for a made-up name.
const SAMPLE = [
  'roofing-bid-calculator',
  'siding-bid-calculator',
  'deck-bid-calculator',
  'ebay-fee-calculator',
  'amazon-fba-calculator',
  '3pl-quote-normalizer',
];

test('counts every published slug into exactly one category', () => {
  const counts = categoryCounts(SAMPLE);
  assert.equal(counts.get('trades'), 3);
  assert.equal(counts.get('marketplace'), 2);
  assert.equal(counts.get('logistics'), 1);
  assert.equal(
    [...counts.values()].reduce((a, b) => a + b, 0),
    SAMPLE.length,
    'a slug counted twice, or dropped, would put a wrong number on the page',
  );
});

test('orders categories by size and drops the empty ones', () => {
  const ordered = orderedCategories(categoryCounts(SAMPLE));
  assert.deepEqual(
    ordered.map((c) => c.id),
    ['trades', 'marketplace', 'logistics'],
  );
  // An empty category still has a `/c/<id>/` path in this repo's URL scheme,
  // but `build.mjs` publishes no page there, so linking one would be a 404
  // shipped from the front door.
  assert.ok(!ordered.some((c) => c.count === 0));
});

test('renders one card per non-empty category, linking to its built page', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  for (const id of ['trades', 'marketplace', 'logistics']) {
    assert.match(html, new RegExp(`href="${TOOLS_URL}${categoryPagePath(id)}"`));
  }
  for (const id of ['services', 'evidence', 'backoffice', 'more']) {
    assert.ok(
      !html.includes(`${TOOLS_URL}${categoryPagePath(id)}`),
      `${id} has no tools in this sample and must not be linked`,
    );
  }
});

test('states the total, and states it consistently', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  // Headline, call to action, footer link and meta description all quote the
  // same number; a page that says 6 in one place and 169 in another is the
  // failure this generator exists to prevent.
  const totals = html.match(/\b6\b(?= (?:free )?(?:tools|calculators))/g) ?? [];
  assert.ok(totals.length >= 3, `expected the total in several places, saw ${totals.length}`);
  assert.ok(!html.includes('169'), 'no hard-coded catalogue size');
});

test('escapes category copy rather than trusting it as markup', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  assert.ok(html.includes('Trade &amp; contractor bids'));
  // Outside the JSON-LD block, where an ampersand is JSON data rather than
  // markup and escaping it would corrupt what a crawler parses.
  const markup = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  assert.ok(!markup.includes('Trade & contractor bids'));
});

test('carries both clauses PRODUCT_PLAYBOOK.md section 5b requires', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  // This page is not built by `platform/pages/build.mjs`, so the no-SLA
  // injection that covers every tool page does not reach it. Both paragraphs
  // have to be in the source.
  assert.match(html, /No warranty\./);
  assert.match(html, /without warranty of any kind/);
  assert.match(html, /Best-effort hosting, no SLA\./);
  assert.match(html, /do not promise uptime/);
  // The no-SLA body must appear once, not doubled by the heading strip.
  assert.equal(html.match(/These tools are free, experimental/g).length, 1);
});

test('makes the privacy claim the nginx access log can actually keep', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  // `gitops/prod/portfolio-site.yaml` logs time, status, uri and one embed
  // bit — no address, no user agent, no referer. "Anonymous page views" is
  // the strongest claim that log supports, and no stronger one may appear.
  assert.match(html, /anonymous page views/);
  assert.ok(!/we (?:collect|store) no data/i.test(html));
});

test('is a distinct document from the tools hub, not a second copy of it', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  // Its own canonical, pointing at the apex. If this ever pointed at the
  // tools host, the apex would be asking crawlers to index the hub twice —
  // the exact outcome portfolio-apex.yaml's 301 was written to avoid.
  assert.match(html, new RegExp(`<link rel="canonical" href="${FRONT_DOOR_URL}">`));
  // And it names no individual tool: the catalogue lives on the hub.
  for (const slug of SAMPLE) {
    assert.ok(!html.includes(`${TOOLS_URL}${slug}`), `${slug} is the hub's to list, not this page's`);
  }
});

test('links only to paths the site build actually emits', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  const linked = [...html.matchAll(/(?:href|content)="(https:\/\/tools\.marisstella\.dev\/[^"]*)"/g)].map(
    (m) => m[1].slice(TOOLS_URL.length),
  );
  const emitted = new Set([
    '',
    ABOUT_PATH,
    FEED_FILE,
    SOCIAL_CARD_FILE,
    ...ALL_CATEGORIES.map((c) => categoryPagePath(c.id)),
  ]);
  for (const target of linked) {
    assert.ok(emitted.has(target), `${target} is not a path platform/pages/build.mjs publishes`);
  }
  assert.ok(linked.length > 0);
});

// A mirror shaped like `buildMirror`'s `tools`, using real slugs so
// `categoryFor` groups them the way it groups the live set.
const MIRROR = [
  { slug: 'roofing-bid-calculator', title: 'Roofing Bid Calculator', url: '/tools/roofing-bid-calculator/' },
  { slug: 'deck-bid-calculator', title: 'Deck Bid Calculator', url: '/tools/deck-bid-calculator/' },
  { slug: '3pl-quote-normalizer', title: '3PL Quote Normalizer', url: '/tools/3pl-quote-normalizer/' },
];

test('groups mirrored tools by the category their slug already classifies into', () => {
  const groups = mirroredByCategory(MIRROR);
  assert.deepEqual([...groups.keys()].sort(), ['logistics', 'trades']);
  assert.deepEqual(
    groups.get('trades').map((t) => t.slug),
    ['roofing-bid-calculator', 'deck-bid-calculator'],
    'order within a group should follow STARTER_SET, not re-sort',
  );
});

test('a category card with tools on this host leads to them, not to the dark hub', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // This is the defect the mirror section left behind: the seven category
  // cards are the page's primary navigation and every one of them pointed at
  // tools.marisstella.dev, which serves nothing until portfolio-site-repo is
  // sealed. A card that has tools here must lead to them.
  for (const id of ['trades', 'logistics']) {
    assert.match(html, new RegExp(`<h3><a href="#${categoryAnchor(id)}">`));
    assert.match(html, new RegExp(`id="${categoryAnchor(id)}"`));
  }
  // No *clickable* category link into the dark host remains. The JSON-LD's
  // `hasPart` still names those `/c/<id>/` URLs and should: structured data
  // describes where the collection's parts canonically live, which is the hub,
  // and a crawler reading it is not a visitor spending a click.
  assert.ok(
    !html.includes(`href="${TOOLS_URL}c/`),
    'no category card should still send a click into the host that serves nothing',
  );
});

test('a category with nothing on this host is stated, not linked into the dark', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // 'marketplace' has published tools (SAMPLE has two) but none mirrored, so
  // its card must be an unlinked heading — there is nowhere honest to send
  // that click today — and must say so rather than spend the click to reveal it.
  assert.match(html, /<h3>Marketplace seller tools<\/h3>/);
  assert.match(html, /2 tools · none on this host yet/);
  assert.match(html, /3 tools · 2 you can open here now/);
});

test('lists a mirrored tool whose category has no card', () => {
  // The cards count published slugs; the groups hold mirrored ones. Driving
  // the mirror section off the cards drops any group whose category has no
  // published count — a tool the ConfigMap goes on serving that nothing on
  // the page links to. `orderedGroups` reads the groups instead.
  const html = renderFrontDoor({ slugs: ['ebay-fee-calculator'], mirrored: MIRROR });
  for (const tool of MIRROR) {
    assert.ok(html.includes(`href="${tool.url}"`), `${tool.slug} is served but not listed`);
  }
  assert.match(html, new RegExp(`id="${categoryAnchor('trades')}"`));
});

test('every card fragment resolves to an id on the page', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(fragments.length > 0);
  for (const fragment of fragments) {
    assert.ok(ids.has(fragment), `#${fragment} is linked but nothing on the page carries that id`);
  }
});

test('with no mirror the page is exactly what it was before one existed', () => {
  // The mirror is temporary: once portfolio-site-repo is sealed it gets
  // deleted, `mirrored` falls back to empty, and every card has to return to
  // linking the hub. Pinning that here is what makes the deletion a one-line
  // change rather than a page nobody can navigate.
  const html = renderFrontDoor({ slugs: SAMPLE });
  for (const id of ['trades', 'marketplace', 'logistics']) {
    assert.match(html, new RegExp(`<h3><a href="${TOOLS_URL}${categoryPagePath(id)}">`));
  }
  assert.ok(!html.includes('href="#'), 'with no mirror there is nothing on this host to point a fragment at');
  assert.match(html, /Browse all 6 tools/);
});

test('the promise is one sentence a visitor can check on any tool page', () => {
  assert.match(PROMISE, /browser/);
  assert.ok(!/\b\d+\b/.test(PROMISE), 'a number here would go stale outside the generated counts');
});

test('the call to action carries its own colour pair in both schemes', () => {
  // The regression this exists for: the button first used `--link` as its
  // background with a hard-coded white foreground, which is 8.8:1 in light
  // mode and 1.93:1 in dark, because `--link` inverts and the text did not.
  // A headless contrast pass caught it; this keeps the mechanism that broke.
  const html = renderFrontDoor({ slugs: SAMPLE });
  assert.match(html, /background: var\(--cta-bg\)/);
  assert.match(html, /color: var\(--cta-fg\)/);
  const dark = html.match(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n  \}/)[0];
  for (const token of ['--cta-bg', '--cta-fg', '--ink', '--paper', '--card', '--link']) {
    assert.ok(dark.includes(token), `${token} keeps its light value in dark mode`);
  }
});

test('uses the name the built site already gives itself', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  assert.match(html, new RegExp(`<meta property="og:site_name" content="${SITE_NAME}">`));
});

test('the committed page matches what this generator produces', async () => {
  const committed = await fs.readFile(OUTPUT_FILE, 'utf8');
  const fresh = await buildFrontDoor();
  assert.equal(
    committed,
    fresh,
    'gitops/prod/front-door/index.html is stale — run: node platform/marketing/front-door.mjs --write',
  );
});

test('the committed page fits a ConfigMap with room to spare', async () => {
  const bytes = Buffer.byteLength(await fs.readFile(OUTPUT_FILE, 'utf8'));
  // etcd caps a ConfigMap at 1 MiB. This is the check that stops the front
  // door growing into the full catalogue listing, which measured 34 MB when a
  // prior session priced serving the whole site this way.
  assert.ok(bytes < 256 * 1024, `front door is ${bytes} bytes; keep it well under the 1 MiB ConfigMap ceiling`);
});

test('the published slug list is the one check.mjs already pins', async () => {
  const slugs = await publishedSlugs();
  assert.ok(slugs.length > 100, 'launched.json should hold the whole published catalogue');
  assert.ok(slugs.includes('roofing-bid-calculator'));
});
