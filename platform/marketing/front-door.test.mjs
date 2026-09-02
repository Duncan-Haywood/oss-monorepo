import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import path from 'node:path';

import { ABOUT_PATH, ALL_CATEGORIES, FEED_FILE, SOCIAL_CARD_FILE, categoryPagePath } from '../pages/build.mjs';
import { FEED_MAX_ENTRIES } from '../pages/launched.mjs';
import { SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH, renderSocialCard } from '../pages/offline.mjs';
import {
  EMPTY_FEED_UPDATED,
  FAVICON_FILE,
  FAVICON_OUTPUT_FILE,
  FAVICON_SVG,
  FEED_OUTPUT_FILE,
  FRONT_DOOR_URL,
  LLMS_FILE,
  LLMS_OUTPUT_FILE,
  OUTPUT_FILE,
  PROMISE,
  ROBOTS_FILE,
  ROBOTS_OUTPUT_FILE,
  ROBOTS_TXT,
  SITE_NAME,
  SITEMAP_FILE,
  SITEMAP_OUTPUT_FILE,
  SOCIAL_CARD_ALT,
  SOCIAL_CARD_OUTPUT_FILE,
  TOOLS_URL,
  buildFrontDoor,
  categoryAnchor,
  categoryCounts,
  mirroredByCategory,
  orderedCategories,
  feedEntryId,
  publishedSlugs,
  renderFrontDoor,
  renderFrontDoorFeed,
  renderFrontDoorLlms,
  renderSitemap,
  subtitleFor,
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
  const { html: fresh } = await buildFrontDoor();
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
  const { html } = await buildFrontDoor();
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

test('the committed robots.txt and sitemap match what this generator produces', async () => {
  // Same contract as the page and the card above: Argo CD delivers the files
  // in git, so a stale commit ships stale bytes and nothing else catches it.
  assert.equal(
    await fs.readFile(ROBOTS_OUTPUT_FILE, 'utf8'),
    ROBOTS_TXT,
    'gitops/prod/front-door/robots.txt is stale — run: node platform/marketing/front-door.mjs --write',
  );
  assert.equal(
    await fs.readFile(SITEMAP_OUTPUT_FILE, 'utf8'),
    renderSitemap(),
    'gitops/prod/front-door/sitemap.xml is stale — run: node platform/marketing/front-door.mjs --write',
  );
});

test('robots.txt points at a sitemap this host actually serves', async () => {
  // The `Sitemap:` line is an absolute URL by protocol requirement — a
  // relative path there is ignored — so it names a host, and naming the dark
  // tools host would send every crawler to a sitemap that does not resolve.
  assert.match(ROBOTS_TXT, new RegExp(`^Sitemap: ${FRONT_DOOR_URL}${SITEMAP_FILE}$`, 'm'));
  assert.ok(!ROBOTS_TXT.includes(`${TOOLS_URL}${SITEMAP_FILE}`));
  assert.equal(path.basename(SITEMAP_OUTPUT_FILE), SITEMAP_FILE);
  assert.equal(path.basename(ROBOTS_OUTPUT_FILE), ROBOTS_FILE);
});

test('robots.txt allows the crawl the mirror depends on being allowed', async () => {
  // The load-bearing assertion in this file. `front-door-tools.mjs` keeps the
  // mirror out of search with a noindex meta and an X-Robots-Tag header, and
  // both are only obeyed by a crawler that is permitted to fetch the page and
  // read them. A `Disallow: /tools/` here would block the fetch, leave the
  // noindex unread, and let the URLs be indexed bare — the opposite of what
  // the Disallow would have been added to achieve.
  assert.match(ROBOTS_TXT, /^Allow: \/$/m);
  assert.ok(
    !/^Disallow:\s*\S/m.test(ROBOTS_TXT),
    'a Disallow here blocks the fetch that makes the mirror noindex effective',
  );
  // The header the paragraph above depends on, asserted where the claim is
  // made rather than trusted from the module that sets it.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  assert.match(conf, /location ~ "\^\/tools\/[^"]*"\s*\{[\s\S]*?X-Robots-Tag "noindex"/);
});

test('robots.txt is plain ASCII, so no crawler has to guess an encoding', () => {
  // The generator interpolates prose that elsewhere in this file carries em
  // dashes. robots.txt is parsed by a long tail of clients with no agreed
  // encoding behaviour, and the file has no charset declaration of its own.
  assert.ok(
    // eslint-disable-next-line no-control-regex
    !/[^\x00-\x7F]/.test(ROBOTS_TXT),
    'keep robots.txt ASCII — replace any em dash or smart quote with plain punctuation',
  );
});

test('the sitemap lists the one indexable URL and no noindex page', () => {
  const xml = renderSitemap();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [FRONT_DOOR_URL]);
  // A sitemap entry for a `noindex` page asks a crawler to index what the page
  // then forbids; consoles report the pair as an error rather than picking a
  // winner. Every /tools/ page is noindex, so none of them belongs here.
  assert.ok(!xml.includes('/tools/'));
  // No `<lastmod>`: the only value available at build time is the build's own
  // clock, which would move on every regeneration and make the staleness test
  // above unpassable while training crawlers to distrust the field.
  assert.ok(!xml.includes('<lastmod>'));
});

test('nginx answers the crawler paths with the files rather than the page', async () => {
  // The catch-all `location /` returns `index.html` for every path. Before
  // these blocks existed, `/robots.txt` was 200 + text/html + 16 KB of markup
  // on the portfolio's only indexable surface.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  for (const [file, type] of [
    [ROBOTS_FILE, 'text/plain'],
    [SITEMAP_FILE, 'application/xml'],
  ]) {
    const block = conf.match(
      new RegExp(`location = /${escapeForRegExp(file)} \\{[\\s\\S]*?\\n {2}\\}`),
    );
    assert.ok(block, `front-door/default.conf must serve /${file} explicitly`);
    assert.match(block[0], new RegExp(`default_type ${escapeForRegExp(type)};`));
    assert.match(block[0], new RegExp(`try_files /${escapeForRegExp(file)} =404;`));
    // Never noindex: these are the apex's own files describing its own
    // indexable page, and a noindex on the sitemap defeats pointing at it.
    assert.ok(!/X-Robots-Tag/.test(block[0]), `/${file} must stay crawlable`);
    assert.ok(
      conf.indexOf(`location = /${file}`) < conf.indexOf('location / {'),
      `keep the /${file} block above the catch-all`,
    );
  }
  // A broad `.xml` regex location would retype every sitemap on the tools
  // host; `test_manifests.py` asserts the same thing about that config, and
  // the exact-match form above is what keeps this one clear of it.
  assert.ok(!/location ~ \\?\.xml\$/.test(conf));
});

/** Launch dates for the `MIRROR` fixture, newest last so ordering is worth asserting. */
const MIRROR_DATES = {
  'roofing-bid-calculator': '2026-08-10',
  'deck-bid-calculator': '2026-08-22',
  '3pl-quote-normalizer': '2026-08-25',
};

test('the feed lists the mirrored tools newest first, at links this host serves', () => {
  const xml = renderFrontDoorFeed({ mirrored: MIRROR, launched: MIRROR_DATES });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
  const links = [...xml.matchAll(/<link rel="alternate" type="text\/html" href="([^"]+)"\/>/g)].map(
    (m) => m[1],
  );
  // The first is the feed's own alternate (the page); the rest are entries.
  assert.deepEqual(links, [
    FRONT_DOOR_URL,
    `${FRONT_DOOR_URL}tools/3pl-quote-normalizer/`,
    `${FRONT_DOOR_URL}tools/deck-bid-calculator/`,
    `${FRONT_DOOR_URL}tools/roofing-bid-calculator/`,
  ]);
  // The defect this whole feature exists to fix: not one entry may point at
  // the host that serves nothing until `portfolio-site-repo` is sealed.
  assert.ok(
    !xml.includes(`${TOOLS_URL}3pl`),
    'entry links must be paths this host actually serves, not the dark catalogue host',
  );
});

test('a feed entry id is the same one the tools host mints for that tool', async () => {
  // The property that makes a second feed safe. `build.mjs`'s `renderFeed`
  // keys entries on a slug-based RFC 4151 tag URI with a *fixed* authority,
  // precisely so two hostnames serving one catalogue do not double a
  // subscriber's feed. If these two ever drift, every reader subscribed here
  // is re-notified about all 53 tools on the day the seal lands.
  const { renderFeed } = await import('../pages/build.mjs');
  const surfaces = MIRROR.map((tool) => ({ ...tool, description: 'x', fullDescription: 'x' }));
  const theirs = renderFeed(surfaces, TOOLS_URL, MIRROR_DATES);
  const ours = renderFrontDoorFeed({ mirrored: MIRROR, launched: MIRROR_DATES });
  const ids = (xml) => [...xml.matchAll(/<id>(tag:[^<]*tool\/[^<]*)<\/id>/g)].map((m) => m[1]);
  assert.deepEqual(ids(ours), ids(theirs));
  assert.deepEqual(ids(ours).sort(), MIRROR.map((t) => feedEntryId(t.slug)).sort());
});

test('the feed states the number of tools served, not the number it lists', () => {
  // `FEED_MAX_ENTRIES` caps the feed below the size of the mirror, so a
  // subtitle written from the entry count claims this host serves 40 tools
  // when it serves 53 — a false claim about the product, produced by an
  // implementation detail of the feed. The first draft of `renderFrontDoorFeed`
  // did exactly that.
  assert.match(subtitleFor(53, 40), /The 53 free, browser-only tools served directly/);
  assert.match(subtitleFor(53, 40), /the newest 40 of them listed here/);
  // With the cap not biting there is no slice to describe, so the sentence
  // does not invent one.
  assert.match(subtitleFor(12, 12), /The 12 free, browser-only tools served directly/);
  assert.ok(!subtitleFor(12, 12).includes('newest 12 of them listed'));
});

test('the feed is capped and undated tools are left out rather than dated wrongly', () => {
  const many = Array.from({ length: FEED_MAX_ENTRIES + 5 }, (_, i) => ({
    slug: `tool-${String(i).padStart(2, '0')}`,
    title: `Tool ${i}`,
    url: `/tools/tool-${String(i).padStart(2, '0')}/`,
    description: 'A tool.',
  }));
  const launched = Object.fromEntries(many.map((t, i) => [t.slug, `2026-08-${String((i % 28) + 1).padStart(2, '0')}`]));
  assert.equal(
    (renderFrontDoorFeed({ mirrored: many, launched }).match(/<entry>/g) ?? []).length,
    FEED_MAX_ENTRIES,
  );
  // An undated tool is dropped from the feed rather than published with a
  // guessed date: `check.mjs` is what refuses to publish it at all, and a
  // fabricated `<published>` would put it at the top of every subscriber's
  // reader. `deck-bid-calculator` is the one left dated here.
  const xml = renderFrontDoorFeed({
    mirrored: MIRROR,
    launched: { 'deck-bid-calculator': '2026-08-22' },
  });
  assert.equal((xml.match(/<entry>/g) ?? []).length, 1);
  assert.match(xml, /<updated>2026-08-22T00:00:00Z<\/updated>/);
});

test('the feed carries no timestamp that moves when nothing changed', () => {
  // `<updated>` is the newest entry's launch date, never the build clock. A
  // clock here would tell every aggregator something changed on each pod
  // restart, and would dirty the tree on a no-op `--write`, which is what the
  // staleness test below depends on not happening.
  const first = renderFrontDoorFeed({ mirrored: MIRROR, launched: MIRROR_DATES });
  const second = renderFrontDoorFeed({ mirrored: MIRROR, launched: MIRROR_DATES });
  assert.equal(first, second);
  assert.match(first, /<updated>2026-08-25T00:00:00Z<\/updated>/);
  // The empty case still has to be valid Atom — `<updated>` is required — and
  // still must not read the clock.
  assert.match(renderFrontDoorFeed({}), new RegExp(`<updated>${EMPTY_FEED_UPDATED}</updated>`));
});

test('the committed feed matches what this generator produces', async () => {
  // Same contract as the page, the card and robots.txt: Argo CD delivers the
  // file from git, so a stale commit ships stale bytes to real subscribers.
  const { feed } = await buildFrontDoor();
  assert.equal(
    await fs.readFile(FEED_OUTPUT_FILE, 'utf8'),
    feed,
    'gitops/prod/front-door/feed.xml is stale — run: node platform/marketing/front-door.mjs --write',
  );
});

test('every committed feed entry links to a page the mirror actually holds', async () => {
  // The dead-link check `validateLinks` performs inside the mirror, applied to
  // the one document that points into it from outside. A feed entry that 404s
  // is worse than a missing entry: a reader who follows one concludes the
  // project is abandoned.
  const { buildMirror } = await import('./front-door-tools.mjs');
  const { files } = await buildMirror();
  const keys = new Set(files.map((f) => f.key));
  const xml = await fs.readFile(FEED_OUTPUT_FILE, 'utf8');
  const slugs = [...xml.matchAll(/href="https:\/\/marisstella\.dev\/tools\/([a-z0-9-]+)\/"/g)].map(
    (m) => m[1],
  );
  assert.ok(slugs.length > 0, 'the committed feed should carry entries');
  for (const slug of slugs) {
    assert.ok(keys.has(`${slug}__index.html`), `feed links /tools/${slug}/, which the mirror lacks`);
  }
});

test('the page declares the feed it serves, and its footer no longer points at the dark host', async () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // Discovery: an aggregator or AI crawler finds a feed by this tag, not by
  // guessing `/feed.xml`.
  assert.match(
    html,
    new RegExp(`<link rel="alternate" type="application/atom\\+xml" title="[^"]*" href="/${FEED_FILE}">`),
  );
  // The defect. Every footer link pointed at `tools.marisstella.dev`, which
  // serves nothing, two screens below fine print saying so — the page
  // contradicted itself and spent a visitor's click to prove it.
  const footer = html.slice(html.indexOf('<footer>'));
  const linkRow = footer.slice(0, footer.indexOf('</p>'));
  assert.ok(
    !linkRow.includes(TOOLS_URL),
    'the footer link row must not send a visitor to the host that serves nothing',
  );
  assert.match(linkRow, new RegExp(`href="/${FEED_FILE}"`));
  assert.match(linkRow, /href="#open-now"/);
  assert.match(linkRow, new RegExp(`The ${MIRROR.length} tools on this host`));
  // Without a mirror the row is unchanged — the state this page returns to
  // when the seal lands, the mirror is deleted, and all three links are live.
  const bare = renderFrontDoor({ slugs: SAMPLE });
  const bareFooter = bare.slice(bare.indexOf('<footer>'));
  assert.ok(bareFooter.includes(`${TOOLS_URL}${ABOUT_PATH}`));
  assert.ok(!bare.includes('application/atom+xml'), 'no feed is served without a mirror');
});

test('nginx answers /feed.xml with the feed, typed as Atom', async () => {
  // The catch-all `location /` returns `index.html` for every path, so without
  // an explicit block a feed reader polling `/feed.xml` gets 21 KB of HTML
  // with a 200 — unparseable, and invisible in any log.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  const block = conf.match(new RegExp(`location = /${escapeForRegExp(FEED_FILE)} \\{[\\s\\S]*?\\n {2}\\}`));
  assert.ok(block, `front-door/default.conf must serve /${FEED_FILE} explicitly`);
  // The type the page's `<link rel="alternate">` promises. Several aggregators
  // dispatch on it before parsing, and nginx's stock mime.types maps `.xml` to
  // `application/xml`, so this is load-bearing rather than belt-and-braces.
  assert.match(block[0], /default_type application\/atom\+xml;/);
  assert.match(block[0], new RegExp(`try_files /${escapeForRegExp(FEED_FILE)} =404;`));
  // Never noindex: this is the apex's own document and the thing we most want
  // an aggregator or AI crawler to read.
  assert.ok(!/X-Robots-Tag/.test(block[0]), '/feed.xml must stay crawlable');
  assert.ok(
    conf.indexOf(`location = /${FEED_FILE}`) < conf.indexOf('location / {'),
    'keep the /feed.xml block above the catch-all',
  );
});

test('the feed rides in the ConfigMap that mounts at the document root', async () => {
  // It has to sit beside index.html for `/feed.xml` to resolve, and two
  // ConfigMaps cannot mount at one mountPath — the same constraint the card,
  // the icon, robots.txt and the sitemap are in this generator for.
  const kustomization = await fs.readFile(
    path.join(path.dirname(OUTPUT_FILE), '..', 'kustomization.yaml'),
    'utf8',
  );
  assert.match(kustomization, new RegExp(`- ${escapeForRegExp(FEED_FILE)}=front-door/${escapeForRegExp(FEED_FILE)}`));
});

test('llms.txt lists every mirrored tool at a URL this host serves', () => {
  const txt = renderFrontDoorLlms({ mirrored: MIRROR, total: 169 });
  assert.match(txt, /^# Free calculators and checks for people who run a small business$/m);
  for (const tool of MIRROR) {
    assert.match(txt, new RegExp(`\\[${escapeForRegExp(tool.title)}\\]\\(${escapeForRegExp(FRONT_DOOR_URL.replace(/\/$/, '') + tool.url)}\\)`));
  }
  // Grouped under the same category headings the page and the feed use, taken
  // from `build.mjs` rather than typed here so a renamed category cannot leave
  // this test asserting a heading the site no longer uses.
  const titles = new Map(ALL_CATEGORIES.map((c) => [c.id, c.title]));
  for (const id of ['trades', 'logistics']) {
    assert.match(txt, new RegExp(`^## ${escapeForRegExp(titles.get(id))}$`, 'm'));
  }
});

test('llms.txt names the catalogue host but never links it', () => {
  // The load-bearing assertion. A model that reads a bullet list of URLs cites
  // those URLs, and a citation is repeated to a user who then clicks it — so
  // linking the 116 tools on a host that answers nothing would turn this
  // page's one-click dead end into confident recommendations of it. The
  // hostname appears in prose for context and in no link.
  const txt = renderFrontDoorLlms({ mirrored: MIRROR, total: 169 });
  assert.ok(txt.includes('tools.marisstella.dev'), 'the catalogue deserves a mention');
  assert.ok(
    !new RegExp(`\\]\\(${escapeForRegExp(TOOLS_URL)}`).test(txt),
    'no markdown link may point at the host that serves nothing',
  );
  assert.ok(!txt.includes(`](https://tools.`), 'no link of any shape at the catalogue host');
  // And it says why, rather than leaving a model to discover it by fetching.
  assert.match(txt, /not serving yet/);
  // The Optional section offers only paths this host actually serves.
  assert.match(txt, new RegExp(`\\]\\(${escapeForRegExp(FRONT_DOOR_URL + FEED_FILE)}\\)`));
  assert.match(txt, new RegExp(`\\]\\(${escapeForRegExp(FRONT_DOOR_URL + SITEMAP_FILE)}\\)`));
  assert.ok(!txt.includes('catalog.json'), 'catalog.json lives on the tools host and is not served here');
});

test('llms.txt keeps each tool to one bullet line', () => {
  // A stray newline inside a bullet silently ends the list item, so a tool
  // whose meta description wrapped would publish its second half as body prose
  // and a model would attribute it to nothing.
  const wrapped = [
    { slug: 'roofing-bid-calculator', title: 'Roofing\nBid Calculator', url: '/tools/roofing-bid-calculator/', description: 'First half.\n\nSecond half.' },
  ];
  const lines = renderFrontDoorLlms({ mirrored: wrapped, total: 1 }).split('\n');
  const bullets = lines.filter((l) => l.startsWith('- ['));
  assert.equal(bullets.length, 3, 'one tool bullet plus the two Optional entries');
  assert.match(bullets[0], /^- \[Roofing Bid Calculator\]\(\S+\): First half\. Second half\.$/);
});

test('llms.txt states the real counts, and both come from the caller', () => {
  const txt = renderFrontDoorLlms({ mirrored: MIRROR, total: 169 });
  assert.match(txt, new RegExp(`> ${MIRROR.length} free, browser-only tools served directly`));
  assert.match(txt, /collection runs to 169 tools/);
  // No hard-coded catalogue size anywhere: the number moves every time a tool
  // ships, and a marketing document stating a stale one is the defect this
  // whole generator exists to prevent.
  assert.ok(!renderFrontDoorLlms({ mirrored: MIRROR, total: 4 }).includes('169'));
});

test('the committed llms.txt matches what this generator produces', async () => {
  const { llms } = await buildFrontDoor();
  assert.equal(
    await fs.readFile(LLMS_OUTPUT_FILE, 'utf8'),
    llms,
    'gitops/prod/front-door/llms.txt is stale — run: node platform/marketing/front-door.mjs --write',
  );
});

test('every link in the committed llms.txt resolves on this host', async () => {
  // Same check the feed gets, and it matters more here: a model repeats a URL
  // to a user rather than spending one click on it itself.
  const { buildMirror } = await import('./front-door-tools.mjs');
  const { files } = await buildMirror();
  const keys = new Set(files.map((f) => f.key));
  const txt = await fs.readFile(LLMS_OUTPUT_FILE, 'utf8');
  const links = [...txt.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length > 10, 'the committed llms.txt should carry the mirrored tools');
  const served = new Set([`${FRONT_DOOR_URL}${FEED_FILE}`, `${FRONT_DOOR_URL}${SITEMAP_FILE}`]);
  for (const link of links) {
    if (served.has(link)) continue;
    const slug = link.match(/^https:\/\/marisstella\.dev\/tools\/([a-z0-9-]+)\/$/)?.[1];
    assert.ok(slug, `${link} is not a path this host serves`);
    assert.ok(keys.has(`${slug}__index.html`), `llms.txt links /tools/${slug}/, which the mirror lacks`);
  }
});

test('nginx answers /llms.txt as markdown-ish text, with the encoding declared', async () => {
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  const block = conf.match(new RegExp(`location = /${escapeForRegExp(LLMS_FILE)} \\{[\\s\\S]*?\\n {2}\\}`));
  assert.ok(block, `front-door/default.conf must serve /${LLMS_FILE} explicitly`);
  assert.match(block[0], /default_type text\/plain;/);
  assert.match(block[0], new RegExp(`try_files /${escapeForRegExp(LLMS_FILE)} =404;`));
  // The one thing robots.txt does not need. That file is held to ASCII by a
  // test; this one carries the ventures' own titles, 31 of whose bullets
  // contain an em dash, and nginx defaults to `charset off` — so without this
  // a client assuming Latin-1 renders every one as mojibake.
  assert.match(block[0], /charset utf-8;/);
  assert.ok(!/X-Robots-Tag/.test(block[0]), '/llms.txt exists to be read by crawlers');
  assert.ok(
    conf.indexOf(`location = /${LLMS_FILE}`) < conf.indexOf('location / {'),
    'keep the /llms.txt block above the catch-all',
  );
});

test('the committed llms.txt is the file that block promises to serve', async () => {
  // The encoding claim above is only true if the bytes really are UTF-8, and
  // the em-dash count is what makes the charset load-bearing rather than
  // decorative — if a future edit made this file ASCII the directive would be
  // harmless but the comment beside it would be wrong.
  const bytes = await fs.readFile(LLMS_OUTPUT_FILE);
  assert.equal(bytes.toString('utf8'), await fs.readFile(LLMS_OUTPUT_FILE, 'utf8'));
  const nonAscii = [...bytes.toString('utf8')].filter((c) => c.codePointAt(0) > 127);
  assert.ok(nonAscii.length > 0, 'if this file is ever pure ASCII, drop the charset comment with it');
});

test('llms.txt rides in the ConfigMap that mounts at the document root', async () => {
  const kustomization = await fs.readFile(
    path.join(path.dirname(OUTPUT_FILE), '..', 'kustomization.yaml'),
    'utf8',
  );
  assert.match(kustomization, new RegExp(`- ${escapeForRegExp(LLMS_FILE)}=front-door/${escapeForRegExp(LLMS_FILE)}`));
});

test('the footer offers llms.txt only where this host serves one', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  const footer = html.slice(html.indexOf('<footer>'));
  assert.match(footer.slice(0, footer.indexOf('</p>')), new RegExp(`href="/${LLMS_FILE}"`));
  // With no mirror there is nothing to describe, and the footer returns to the
  // shape it takes after the seal.
  assert.ok(!renderFrontDoor({ slugs: SAMPLE }).includes(`href="/${LLMS_FILE}"`));
});
