import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import path from 'node:path';

import { ABOUT_PATH, ALL_CATEGORIES, FEED_FILE, SOCIAL_CARD_FILE, categoryPagePath } from '../pages/build.mjs';
import { SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH, renderSocialCard } from '../pages/offline.mjs';
import {
  FAVICON_FILE,
  FAVICON_OUTPUT_FILE,
  FAVICON_SVG,
  FRONT_DOOR_URL,
  OUTPUT_FILE,
  PROMISE,
  SITE_NAME,
  SOCIAL_CARD_ALT,
  SOCIAL_CARD_OUTPUT_FILE,
  TOOLS_URL,
  buildFrontDoor,
  categoryAnchor,
  categoryCounts,
  mirroredByCategory,
  orderedCategories,
  publishedSlugs,
  renderFrontDoor,
} from './front-door.mjs';

/** The nginx config that serves the page and the card, beside them both. */
const NGINX_CONF_FILE = path.join(path.dirname(OUTPUT_FILE), 'default.conf');

/** Alt text carries an em dash and a full stop; neither is regex-safe. */
const escapeForRegExp = (value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

test('points og:image at a file this host serves, not at the dark tools host', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  const image = `${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`;
  assert.match(html, new RegExp(`<meta property="og:image" content="${image}">`));
  assert.match(html, new RegExp(`<meta name="twitter:image" content="${image}">`));
  // The regression this exists to stop, stated as the thing it must never be
  // again: `build.mjs` emits a `social-card.png` on the tools host too, and
  // naming *that* one costs nothing on the page itself and breaks every link
  // preview, because `portfolio-site.yaml` fails closed until the clone token
  // is sealed. Assert the absence, not just the presence — a future edit that
  // adds a second og:image would pass the two checks above.
  assert.ok(
    !html.includes(`${TOOLS_URL}${SOCIAL_CARD_FILE}`),
    'og:image must not name the tools host, which serves nothing until portfolio-site-repo is sealed',
  );
});

test('declares the share card dimensions and describes what it shows', () => {
  const html = renderFrontDoor({ slugs: SAMPLE });
  // Slack and LinkedIn lay out the unfurl before the image finishes loading;
  // without these two the large-image card reflows or falls back to a thumbnail.
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, new RegExp(`<meta property="og:image:alt" content="${escapeForRegExp(SOCIAL_CARD_ALT)}">`));
  assert.match(html, new RegExp(`<meta name="twitter:image:alt" content="${escapeForRegExp(SOCIAL_CARD_ALT)}">`));
});

test('the committed share card matches what the encoder produces, at the declared size', async () => {
  const committed = await fs.readFile(SOCIAL_CARD_OUTPUT_FILE);
  assert.deepEqual(
    committed,
    renderSocialCard(),
    'gitops/prod/front-door/social-card.png is stale — run: node platform/marketing/front-door.mjs --write',
  );
  // A PNG signature, then the IHDR width/height as big-endian uint32s. Read
  // from the bytes rather than trusted from the constants, because the
  // og:image:width/height above are a promise to the scraper about *this file*
  // and nothing else in the build would catch them drifting apart.
  assert.deepEqual([...committed.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(committed.readUInt32BE(16), SOCIAL_CARD_WIDTH);
  assert.equal(committed.readUInt32BE(20), SOCIAL_CARD_HEIGHT);
  // Well inside the ConfigMap ceiling even after base64 adds a third.
  assert.ok(committed.length < 64 * 1024, `share card is ${committed.length} bytes`);
});

test('the alt text stays true of the card the write path actually draws', () => {
  // `SOCIAL_CARD_ALT` says the card carries no text. That is a property of
  // `renderSocialCard()`'s no-headline branch, and the branch is chosen by the
  // absence of an argument — so a later change that starts passing a headline
  // would leave the alt text describing a card that no longer exists. Compare
  // the committed bytes against both branches: it must be the wordless one.
  const wordless = renderSocialCard();
  const headlined = renderSocialCard({ headline: SITE_NAME });
  assert.ok(!wordless.equals(headlined), 'the two card layouts should differ, or this check proves nothing');
  assert.match(SOCIAL_CARD_ALT, /carries no text/);
});

test('nginx answers the og:image path with the card rather than the page', async () => {
  // The front door's catch-all `location /` returns `index.html` for every
  // path, which is right for a mistyped URL and wrong for this one: before the
  // exact-match block below existed, a scraper fetching `/social-card.png` got
  // 200 + `text/html` + 16 KB of markup. That is worse than a 404, which at
  // least tells the scraper to fall back to a text card.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  const block = conf.match(/location = \/social-card\.png \{[\s\S]*?\n {2}\}/);
  assert.ok(block, 'front-door/default.conf must serve /social-card.png explicitly');
  assert.match(block[0], /default_type image\/png;/);
  assert.match(block[0], /try_files \/social-card\.png =404;/);
  // Never noindex: this card is the apex's own, referenced from an indexable
  // page. The tool mirror sets the header because those pages are copies.
  assert.ok(!/X-Robots-Tag/.test(block[0]), 'the apex share card must stay indexable');
  // An exact-match location outranks every prefix and regex location in nginx
  // regardless of order, but keeping it above the catch-all keeps the file
  // readable in the order requests resolve.
  assert.ok(
    conf.indexOf('location = /social-card.png') < conf.indexOf('location / {'),
    'keep the card block above the catch-all',
  );
});

test('declares a tab mark, so the browser stops asking for /favicon.ico', async () => {
  // Every browser requests `/favicon.ico` unprompted on the first view of an
  // origin. The apex answered that with a 404 on every visit and showed a
  // blank default tab, because it declared no icon at all. Declaring one is
  // what fixes both: a `rel="icon"` link is also what stops the unprompted
  // `/favicon.ico` request being made.
  const html = await buildFrontDoor();
  assert.match(html, new RegExp(`<link rel="icon" href="/${FAVICON_FILE}" type="image/svg\\+xml">`));
  // Declared as a root-absolute path, not a relative one: the catch-all in
  // default.conf answers a mistyped `/anything` with this same HTML, and a
  // relative href would then resolve against that path and 404.
  assert.ok(html.includes(`href="/${FAVICON_FILE}"`), 'the icon href must be root-absolute');
});

test('the committed tab mark matches what the generator holds', async () => {
  const onDisk = await fs.readFile(FAVICON_OUTPUT_FILE, 'utf8');
  assert.equal(
    onDisk,
    FAVICON_SVG,
    'gitops/prod/front-door/favicon.svg is stale — run: node platform/marketing/front-door.mjs --write',
  );
});

test('the tab mark carries no script, since nginx serves it from this origin', () => {
  // An SVG is a document. This one is generated from a constant and has no
  // script in it; the test is here so that stays true if the mark is redrawn,
  // because an SVG served from the apex shares its origin.
  assert.ok(!/<script/i.test(FAVICON_SVG), 'the icon must not carry script');
  assert.ok(!/\son\w+=/i.test(FAVICON_SVG), 'the icon must not carry event handlers');
  assert.match(FAVICON_SVG, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test('nginx answers the icon path with the icon rather than the page', async () => {
  // Same failure the share card block exists to prevent: without an exact
  // match the catch-all hands a browser 16 KB of HTML with a 200 where an
  // image was promised, and the tab silently stays blank.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  const block = conf.match(/location = \/favicon\.svg \{[\s\S]*?\n {2}\}/);
  assert.ok(block, 'front-door/default.conf must serve /favicon.svg explicitly');
  // Load-bearing here in a way it is not for the card: `.svg` is not in
  // nginx's stock type map on every build, and an icon sent as
  // application/octet-stream is ignored.
  assert.match(block[0], /default_type image\/svg\+xml;/);
  assert.match(block[0], /try_files \/favicon\.svg =404;/);
  assert.ok(!/X-Robots-Tag/.test(block[0]), 'the apex tab mark must stay indexable');
  assert.ok(
    conf.indexOf('location = /favicon.svg') < conf.indexOf('location / {'),
    'keep the icon block above the catch-all',
  );
  // The rule this file keeps is that every content location repeats the
  // headers rather than relying on inheritance, because nginx's `add_header`
  // does not inherit across levels: a block that sets one header and expects
  // the rest from above silently sends none of them.
  for (const header of [
    'X-Content-Type-Options nosniff',
    'X-Frame-Options DENY',
    'Referrer-Policy strict-origin-when-cross-origin',
    'Cache-Control',
  ]) {
    assert.ok(block[0].includes(header), `the icon block must repeat ${header}`);
  }
  // An SVG served from this origin is a document, not an inert image like the
  // PNG card, so this one block carries a CSP the card does not need.
  assert.match(block[0], /Content-Security-Policy "default-src 'none'/);
});

test('the icon is delivered in the same ConfigMap as the page that names it', async () => {
  // Two ConfigMaps cannot mount at one mountPath, and the icon has to sit at
  // the document root beside index.html for `/favicon.svg` to resolve.
  const kustomization = await fs.readFile(
    path.join(path.dirname(path.dirname(OUTPUT_FILE)), 'kustomization.yaml'),
    'utf8',
  );
  assert.match(kustomization, /- favicon\.svg=front-door\/favicon\.svg/);
});

test('the published slug list is the one check.mjs already pins', async () => {
  const slugs = await publishedSlugs();
  assert.ok(slugs.length > 100, 'launched.json should hold the whole published catalogue');
  assert.ok(slugs.includes('roofing-bid-calculator'));
});
