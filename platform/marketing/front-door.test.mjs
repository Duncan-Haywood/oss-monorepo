import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import path from 'node:path';

import {
  ABOUT_PATH,
  ALL_CATEGORIES,
  COMPARE_PATH,
  COMPARISON_FILE_PATTERN,
  FEED_FILE,
  SOCIAL_CARD_FILE,
  categoryPagePath,
  comparisonSubject,
  comparisonSubjectKey,
  groupComparisons,
} from '../pages/build.mjs';
import { FEED_MAX_ENTRIES } from '../pages/launched.mjs';
import { SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH, renderSocialCard } from '../pages/offline.mjs';
import {
  EMPTY_FEED_UPDATED,
  FAVICON_FILE,
  FAVICON_OUTPUT_FILE,
  FAVICON_SVG,
  FEED_OUTPUT_FILE,
  FRONT_DOOR_URL,
  CATALOG_FILE,
  CATALOG_OUTPUT_FILE,
  EMBED_HOST_OUTPUT_FILE,
  EMBED_MODULE_OUTPUT_FILE,
  EMBED_STYLE_OUTPUT_FILE,
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
  ABOUT_KEY,
  PRIVACY_LOG_FIELDS,
  SPONSORS_URL,
  aboutOutputFile,
  apexAboutUrl,
  buildFrontDoor,
  categoryAnchor,
  apexCategoryUrl,
  categoryCounts,
  categoryOutputFile,
  categoryPageKey,
  extraTokens,
  mirroredByCategory,
  orderedCategories,
  feedEntryId,
  publishedSlugs,
  renderFrontDoor,
  renderFrontDoorAbout,
  renderFrontDoorCatalog,
  renderFrontDoorFeed,
  renderFrontDoorComparisons,
  renderFrontDoorLlms,
  renderSitemap,
  subtitleFor,
  COMPARE_KEY,
  apexCompareUrl,
  compareOutputFile,
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
    // The heading leads to this host's own category page. It was a fragment
    // into the section further down this page until `renderCategoryPage`
    // existed, which was the best available destination at the time; now that
    // `/c/<id>/` is served here it is the better one, because it carries
    // `categoryPageCopy`'s own copy, sub-groups the tools, and is a URL a
    // search result can land on. The fragment section it replaced is still
    // rendered and still reachable from the hero call-to-action.
    assert.match(html, new RegExp(`<h3><a href="${FRONT_DOOR_URL}${categoryPagePath(id)}">`));
    assert.match(html, new RegExp(`id="${categoryAnchor(id)}"`));
  }
  // No category link into the dark host remains anywhere in the document —
  // not in the cards, and no longer in the JSON-LD either.
  //
  // This assertion used to be scoped to `href="…"` on purpose, with the
  // reasoning that `hasPart` should keep naming the hub because "structured
  // data describes where the collection's parts canonically live, which is the
  // hub, and a crawler reading it is not a visitor spending a click".
  //
  // That reasoning does not survive `TOOLS_HOST_SERVES === false`. The mirror
  // already declares *this* host canonical for every tool page it serves, so a
  // `hasPart` naming the catalogue host contradicted the canonical policy one
  // level down, and described seven CollectionPages at URLs that answer
  // nothing. "A crawler is not spending a click" is true and beside the point:
  // being found by crawlers is the entire purpose of this portfolio's
  // structured data, and pointing them at 404s is a worse failure than a dead
  // link a person can at least see and route around.
  assert.ok(
    !html.includes(`${TOOLS_URL}c/`),
    'no category URL on the dark host should remain, in a link or in structured data',
  );
});

test('each served category gets a page on this host, and it is what the page points at', async () => {
  const { html, categoryPages, sitemap } = await buildFrontDoor();
  assert.ok(categoryPages.length > 0, 'the mirror serves tools, so it must serve category pages');

  for (const page of categoryPages) {
    const url = `${FRONT_DOOR_URL}${categoryPagePath(page.id)}`;

    // The card, the JSON-LD and the sitemap must all name the same URL. These
    // three drifted apart before: the cards were fixed to stop pointing at the
    // dark host while `hasPart` went on doing it, so the page disagreed with
    // itself about where its own collections lived.
    assert.ok(html.includes(url), `the front page must link ${page.id} at ${url}`);
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${page.id} must be in the sitemap`);

    // The page has to declare itself canonical at the URL nginx serves it
    // from, or the whole set is indexed under the front page's canonical and
    // the seven pages compete with it instead of ranking for their own intent.
    assert.match(page.html, new RegExp(`<link rel="canonical" href="${url}">`));

    // Every user-facing surface in this portfolio carries the no-warranty
    // clause (PRODUCT_PLAYBOOK §5b). A generated page is not exempt because it
    // is generated.
    assert.match(page.html, /<strong>No warranty\.<\/strong>/);
    assert.match(page.html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);

    // Nothing on these pages may point at the host that serves nothing.
    assert.ok(!page.html.includes(TOOLS_URL), `${page.id} must not link the dark host`);
  }
});

test('a category page lists exactly the tools this host serves in that category', async () => {
  const { categoryPages } = await buildFrontDoor();
  const { buildMirror } = await import('./front-door-tools.mjs');
  const { tools } = await buildMirror();
  const grouped = mirroredByCategory(tools);

  for (const page of categoryPages) {
    const expected = grouped.get(page.id) ?? [];
    // Every tool in the category appears, and the count in the fine print is
    // the real one. A browse page that silently drops a tool is worse than no
    // browse page: the tool is live, reachable, and now invisible to anyone
    // browsing rather than searching — the same "public nowhere" failure the
    // ENTRY_OVERRIDES bug caused, one layer up.
    for (const tool of expected) {
      assert.ok(
        page.html.includes(`href="${tool.url}"`),
        `${page.id} must list ${tool.slug}, which this host serves`,
      );
    }
    const links = page.html.match(/href="\/tools\/[^"]*"/g) ?? [];
    assert.equal(
      links.length,
      expected.length,
      `${page.id} must list only the tools this host serves in that category`,
    );
  }
});

test('the nginx rewrite and the ConfigMap key agree about where a category page is stored', async () => {
  // These two are the halves of one mapping, written in two languages in two
  // files: `categoryPageKey` names the file, and the `^/c/(?<cat>…)/?$` block
  // in `default.conf` rewrites the URL to that name. If they disagree the
  // pages are dark while every other check in this file still passes — the
  // generator writes them, the kustomization mounts them, the sitemap asks
  // crawlers to fetch them, and nginx answers 404.
  const conf = await fs.readFile(
    path.join(path.dirname(OUTPUT_FILE), 'default.conf'),
    'utf8',
  );
  assert.match(conf, /location ~ "\^\/c\/\(\?<cat>\[a-z0-9\]\[a-z0-9-\]\*\)\/\?\$" \{/);
  assert.match(conf, /try_files \/c__\$\{cat\}\.html =404;/);

  const { categoryPages } = await buildFrontDoor();
  for (const page of categoryPages) {
    // The URL path the sitemap advertises, run through the rewrite by hand,
    // must be the key the generator writes.
    const served = categoryPagePath(page.id).replace(/^c\/([a-z0-9-]+)\/$/, 'c__$1.html');
    assert.equal(served, categoryPageKey(page.id));
  }
});

test('the committed embed runtime and stylesheet match what embed.mjs renders', async () => {
  // The same staleness guard every other generated file here gets, and it
  // matters more for these two than for a document: they are *imported* from
  // `platform/pages/embed.mjs` rather than written here, so an edit to the
  // widget on the tools host would otherwise leave the apex serving last
  // week's runtime with no test anywhere noticing. `CLAUDE.md` records two
  // occasions where a copied-instead-of-imported rule cost live product; this
  // is the check that keeps the import honest at the file level too.
  const { renderEmbedModule, renderEmbedStyle, renderEmbedHostModule } =
    await import('../pages/embed.mjs');

  const committedModule = await fs.readFile(EMBED_MODULE_OUTPUT_FILE, 'utf8');
  assert.equal(
    committedModule,
    renderEmbedModule(),
    'gitops/prod/front-door/pf-embed.js is stale — run `node platform/marketing/regen.mjs`',
  );

  const committedStyle = await fs.readFile(EMBED_STYLE_OUTPUT_FILE, 'utf8');
  assert.equal(
    committedStyle,
    renderEmbedStyle(),
    'gitops/prod/front-door/pf-embed.css is stale — run `node platform/marketing/regen.mjs`',
  );

  // The resizer matters more here than either file above, not less: nothing on
  // this host loads it, so a stale or missing copy is invisible from every
  // page we can look at and broken on every site that pasted the snippet.
  const committedHost = await fs.readFile(EMBED_HOST_OUTPUT_FILE, 'utf8');
  assert.equal(
    committedHost,
    renderEmbedHostModule(),
    'gitops/prod/front-door/pf-embed-host.js is stale — run `node platform/marketing/regen.mjs`',
  );
});

test('nginx serves the embed runtime and stylesheet as their own types', async () => {
  // The catch-all `location /` answers every path with the front page's HTML,
  // and a browser *refuses* a stylesheet and an ES module served as
  // `text/html` rather than merely mistyping them — the offer box would render
  // unstyled and the copy button would do nothing, with a 200 in the log. So
  // an exact-match block per file, each setting its own type.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  for (const [file, type] of [
    ['pf-embed.js', 'text/javascript'],
    ['pf-embed.css', 'text/css'],
    // The resizer, whose failure mode is worse than a wrong type: served as
    // `text/html` by the catch-all it is refused outright, and the only person
    // who ever sees that is the embedder whose page silently stopped sizing.
    ['pf-embed-host.js', 'text/javascript'],
  ]) {
    assert.ok(
      conf.includes(`location = /${file} {`),
      `default.conf must answer /${file} with its own block, not the catch-all`,
    );
    // Sliced to the block's own closing brace at the location's indent level,
    // not to the first `}` — these blocks open with `types { }`, whose brace
    // would end the slice before `default_type` was ever in it.
    const from = conf.indexOf(`location = /${file} {`);
    const block = conf.slice(from, conf.indexOf('\n  }', from));
    assert.ok(
      block.includes(`default_type ${type};`),
      `/${file} must be served as ${type}`,
    );
  }
});

test('the AI-discovery surfaces describe the embed with the real parameter', async () => {
  // These two files are read by something that will *act* on them — an
  // assistant answering "is there a free calculator for X I could put on my
  // site" is the most likely way anyone now discovers these tools are
  // embeddable at all. So a stale parameter name here does not read as a typo;
  // it publishes a working-looking instruction that produces an iframe every
  // browser refuses. Pinned to `embed.mjs`'s own constants rather than to
  // literals, so a rename over there fails here instead of shipping.
  const { EMBED_QUERY_PARAM, DEFAULT_EMBED_HEIGHT } = await import('../pages/embed.mjs');
  const { llms, catalog } = await buildFrontDoor();

  assert.match(
    llms,
    new RegExp(`\\?${EMBED_QUERY_PARAM}=1`),
    'llms.txt does not tell a model how to embed a tool',
  );
  assert.ok(
    llms.includes(`${DEFAULT_EMBED_HEIGHT}px`),
    'llms.txt names a starting height that is not the one the snippet uses',
  );

  const parsed = JSON.parse(catalog);
  assert.equal(parsed.embed.supported, true);
  assert.equal(parsed.embed.suggested_min_height_px, DEFAULT_EMBED_HEIGHT);
  assert.equal(
    parsed.embed.url_pattern,
    `${FRONT_DOOR_URL.replace(/\/$/, '')}/tools/{slug}/?${EMBED_QUERY_PARAM}=1`,
  );

  // The pattern has to be the shape nginx actually frames, not merely a string
  // containing the parameter. Substituting a real slug must reproduce a tool
  // URL this host serves — the same one `injectMirrorEmbed` puts in the
  // snippet and `test_the_entry_page_is_framable_only_with_the_embed_parameter`
  // exercises against real nginx.
  const sample = parsed.tools[0];
  assert.equal(
    parsed.embed.url_pattern.replace('{slug}', sample.slug),
    `${sample.url}?${EMBED_QUERY_PARAM}=1`,
    'the advertised embed URL does not match the tool URLs in the same file',
  );
});

test('the kustomization mounts the embed runtime and stylesheet', async () => {
  // Generated into `front-door/` and linked absolutely from every mirrored
  // entry page, so they have to reach the document-root volume. Without these
  // two lines the mirror ships 169 pages referencing paths the catch-all
  // answers with the front page.
  const kustomization = await fs.readFile(
    path.join(path.dirname(path.dirname(OUTPUT_FILE)), 'kustomization.yaml'),
    'utf8',
  );
  for (const key of ['pf-embed.js', 'pf-embed.css', 'pf-embed-host.js']) {
    assert.ok(
      kustomization.includes(`- ${key}=front-door/${key}`),
      `gitops/prod/kustomization.yaml must mount ${key}; without it the embed offer is inert`,
    );
  }
});

test('every rendered category page is mounted by the kustomization', async () => {
  // The set is generated but the file list in `gitops/prod/kustomization.yaml`
  // is hand-kept, which is the seam a new category falls through: it would be
  // rendered, linked, and in the sitemap, but never delivered — the ConfigMap
  // would not carry it and nginx would 404 the URL the page advertises.
  const { categoryPages } = await buildFrontDoor();
  const kustomization = await fs.readFile(
    path.join(path.dirname(path.dirname(OUTPUT_FILE)), 'kustomization.yaml'),
    'utf8',
  );
  for (const page of categoryPages) {
    const key = categoryPageKey(page.id);
    assert.ok(
      kustomization.includes(`- ${key}=front-door/${key}`),
      `gitops/prod/kustomization.yaml must mount ${key}; add it or the page is dark`,
    );
  }
  // And nothing stale: a line for a category that is no longer rendered makes
  // `kustomize build` fail on a missing file, which takes the whole prod
  // Application down rather than just that page.
  const mounted = [...kustomization.matchAll(/- (c__[a-z0-9-]+\.html)=front-door\//g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    mounted.sort(),
    categoryPages.map((page) => categoryPageKey(page.id)).sort(),
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

test('ships the tool filter hidden, so a reader without script never meets a dead box', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // `hidden` in the markup and cleared by the script is the whole of the
  // progressive-enhancement claim: a search box that silently does nothing is
  // worse than no search box on a page whose promise is that it just works.
  assert.match(html, /<div class="filter" id="tool-filter" hidden>/);
  assert.match(html, /<p class="filter-empty" id="tool-filter-empty" hidden>/);
  assert.match(html, /box\.hidden = false;/);
  // A `display` declaration beats the UA default for `[hidden]`, and `.filter`
  // sets one — without this rule the box is visible to a no-JS reader despite
  // the attribute.
  // Every element the filter hides needs its own rule: the UA sheet's
  // `[hidden] { display: none }` loses to any author `display` declaration,
  // and `.filter` and `.grid` both set `display: grid`. Measured in a browser
  // before this rule existed: filtering to one trade left the six emptied
  // category lists still rendering — invisible, because a grid with no visible
  // items has no height, and read out by a screen reader as six empty lists.
  assert.match(html, /\.filter\[hidden\], \.filter-empty\[hidden\], \.grid\[hidden\] \{ display: none; \}/);
});

test('the search field has a border a reader can actually see', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // WCAG 2.1 SC 1.4.11 wants 3:1 for the boundary of a UI component. `--rule`,
  // which every card on this page borders with, measures 1.36:1 against
  // `--paper` in light and 1.54:1 in dark — invisible. That is fine for a card,
  // whose shape a reader gets from its fill and its content, and wrong for the
  // one control on the page, where the boundary is what says "you can type
  // here". Measured in a headless browser at 3.59:1 and 3.96:1 with
  // `--field-edge`; this pins the field to that token rather than to `--rule`.
  assert.match(html, /border: 1px solid var\(--field-edge\);/);
  assert.match(html, /--field-edge: #8a8379;/);
  assert.match(html, /--field-edge: #6f7780;/);
  assert.ok(
    !/\.filter input \{[^}]*var\(--rule\)/.test(html),
    'the search field must not border with the card rule, which fails 1.4.11',
  );
});

test('the filter box is labelled and announces its result count', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  assert.match(html, /<label for="tool-search">/);
  assert.match(html, /<input id="tool-search"[^>]*aria-describedby="tool-filter-status"/);
  // `role="status"` is what puts the count in front of a screen reader rather
  // than only a sighted one; the script writes it only when it changes, so
  // holding a key down does not queue one announcement per keystroke.
  assert.match(html, /<p class="filter-status" id="tool-filter-status" role="status">/);
  assert.match(html, /if \(message !== announced\)/);
});

test('marks the cards and the group pairs with different attributes', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // `data-group` marks the heading/list pair that hides together; `data-cat`
  // marks which pair a card belongs to. Spelling both `data-group` would make
  // the script's `querySelectorAll('[data-group]')` select every card too, and
  // every card would then be hidden as an empty group.
  assert.match(html, /<h3 class="group" id="open-trades" data-group="trades">/);
  assert.match(html, /<ul class="grid" data-group="trades">/);
  assert.match(html, /<li class="card" data-cat="trades"/);
  assert.ok(!/<li class="card"[^>]*data-group=/.test(html), 'a card must not carry data-group');
  // Every mirrored card is reachable by the script's own selector.
  assert.equal((html.match(/<li class="card" data-cat="/g) ?? []).length, MIRROR.length);
});

test('writes search tokens only where the slug says something the title does not', () => {
  // The haystack is built in the browser from what the page already displays —
  // the card's own text and its category heading — so neither is repeated into
  // an attribute. Only the leftover slug words are written out, which is what
  // keeps this feature under 2 KB gzipped across 159 cards.
  assert.equal(extraTokens({ slug: 'roofing-bid-calculator', title: 'Roofing Bid Calculator' }), '');
  assert.equal(extraTokens({ slug: '3pl-quote-normalizer', title: 'Normalise a 3PL Quote' }), 'normalizer');
  assert.equal(
    extraTokens({ slug: 'where-to-sell-calculator', title: 'Where Should I Sell This?' }),
    'to calculator',
  );

  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // MIRROR's titles are their slugs in title case, so no card needs one.
  assert.ok(!html.includes('data-alt='), 'data-alt should be omitted when it would add nothing');
  const withExtra = renderFrontDoor({
    slugs: SAMPLE,
    mirrored: [{ slug: '3pl-quote-normalizer', title: 'Normalise a 3PL Quote', url: '/tools/3pl-quote-normalizer/' }],
  });
  assert.match(withExtra, / data-alt="normalizer"/);
});

test('matches a term as a word prefix rather than as a bare substring', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  // Each haystack is built with a leading space and every term is sought as
  // `' ' + term`, so "roof" still finds "roofing" — a prefix is where people
  // stop typing — while "roofing" no longer drags in "waterproofing", which a
  // plain `indexOf` did: measured in a browser against the committed page,
  // searching "roofing" returned the basement waterproofing calculator.
  assert.match(html, /haystack\.indexOf\(' ' \+ terms\[t\]\)/);
  assert.match(html, /hay\.push\(\s*' ' \+/);
});

test('the inline filter script cannot close its own element early', () => {
  const html = renderFrontDoor({ slugs: SAMPLE, mirrored: MIRROR });
  const script = html.slice(html.indexOf('<script>') + '<script>'.length);
  const body = script.slice(0, script.indexOf('</script>'));
  assert.ok(body.includes('tool-filter'), 'expected the filter script inline in the page');
  // `</` anywhere inside would end the element at that point and dump the rest
  // of the script into the document as text.
  assert.ok(!body.includes('</'), 'the inline script must contain no `</` sequence');
});

test('with no mirror there is no filter and no script to run it', () => {
  // Same reasoning as the test below: the mirror is deleted when
  // portfolio-site-repo is sealed, and everything gated on it has to go with
  // it rather than leaving a search box over a list that is no longer there.
  const html = renderFrontDoor({ slugs: SAMPLE });
  assert.ok(!html.includes('tool-filter'));
  assert.ok(!html.includes('tool-search'));
  assert.ok(!html.includes('data-cat='));
  assert.ok(!html.includes('<script>'), 'the only script on a mirror-less page is the JSON-LD block');
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
    'gitops/prod/front-door/index.html is stale — run: node platform/marketing/regen.mjs',
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
    'gitops/prod/front-door/social-card.png is stale — run: node platform/marketing/regen.mjs',
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
    'gitops/prod/front-door/favicon.svg is stale — run: node platform/marketing/regen.mjs',
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
    'gitops/prod/front-door/robots.txt is stale — run: node platform/marketing/regen.mjs',
  );
  // Through `buildFrontDoor` rather than a bare `renderSitemap()`, because the
  // sitemap's contents now depend on the mirror build — the same source that
  // decides each page's robots directive, which is what keeps the two from
  // ever contradicting each other.
  const { sitemap } = await buildFrontDoor();
  assert.equal(
    await fs.readFile(SITEMAP_OUTPUT_FILE, 'utf8'),
    sitemap,
    'gitops/prod/front-door/sitemap.xml is stale — run: node platform/marketing/regen.mjs',
  );
});

test('the committed category pages match what this generator produces', async () => {
  // Same contract as every other generated file here: Argo CD delivers what is
  // in git, so a stale commit ships stale bytes.
  //
  // These have a wider blast radius than the rest of the set, because their
  // content comes from `build.mjs` — `categoryPageCopy` and the
  // `SUBCATEGORY_RULES` behind `groupBySubcategory`. Editing a category's copy
  // there is an edit to seven published pages that names none of them, and the
  // only thing standing between that and a stale deploy is this assertion.
  // `hetzner-gitops-ci.yml` already triggers on `platform/pages/build.mjs`, so
  // such an edit runs this test.
  const { categoryPages } = await buildFrontDoor();
  for (const page of categoryPages) {
    assert.equal(
      await fs.readFile(categoryOutputFile(page.id), 'utf8'),
      page.html,
      `gitops/prod/front-door/${categoryPageKey(page.id)} is stale — run: node platform/marketing/regen.mjs`,
    );
  }

  // And no orphans on disk. A category that loses its last mirrored tool stops
  // being rendered and stops being mounted, but its file would stay in git and
  // stay in the tree — the kustomization test above would then fail on a key
  // it cannot find a line for, which is a confusing way to learn this. The
  // `--write` path sweeps them; this is what proves it did.
  const dir = path.dirname(OUTPUT_FILE);
  const onDisk = (await fs.readdir(dir)).filter(
    (name) => name.startsWith('c__') && name.endsWith('.html'),
  );
  assert.deepEqual(
    onDisk.sort(),
    categoryPages.map((page) => categoryPageKey(page.id)).sort(),
    'a category page on disk is no longer rendered — run: node platform/marketing/regen.mjs',
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

test('the sitemap lists every indexable page and never a noindex one', async () => {
  const { sitemap: xml } = await buildFrontDoor();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.includes(FRONT_DOOR_URL), 'the apex is missing from its own sitemap');
  assert.deepEqual(locs, [...locs].sort(), 'the sitemap is not in a stable order');
  assert.equal(new Set(locs).size, locs.length, 'the sitemap lists a URL twice');
  for (const loc of locs) assert.ok(loc.startsWith(FRONT_DOOR_URL), `${loc} is not on this host`);

  // The invariant that outlives the switch: a sitemap entry for a `noindex`
  // page asks a crawler to index what the page then forbids, and consoles
  // report the pair as an error rather than picking a winner. So the tool
  // pages belong here exactly when they are indexable, and the premise is read
  // from the mirror rather than restated.
  const { TOOLS_HOST_SERVES } = await import('./front-door-tools.mjs');
  const toolLocs = locs.filter((l) => l.includes('/tools/'));
  if (TOOLS_HOST_SERVES) {
    assert.equal(toolLocs.length, 0, 'the mirror is noindex again but still listed for indexing');
  } else {
    assert.ok(toolLocs.length > 100, `expected the mirrored catalogue, got ${toolLocs.length}`);
  }
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
    'gitops/prod/front-door/feed.xml is stale — run: node platform/marketing/regen.mjs',
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

test('nginx compresses the feed it serves', async () => {
  // `front-door-tools.test.mjs`'s `the front door compresses every non-HTML
  // type the mirror actually serves` derives `gzip_types` coverage from
  // `STARTER_SET`, which is the venture *mirror* — a different generator from
  // this one, so it cannot see `/feed.xml`. Without its own assertion here,
  // the feed can go back to shipping uncompressed (as it did until this test
  // was added) with nothing failing anywhere: it is 26 KB the day this test
  // is written, more than 25x `gzip_min_length`, so every byte of that was
  // going out uncompressed to every reader polling it.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  const gzipLine = conf.match(/^\s*gzip_types\s+([^;]+);/m);
  assert.ok(gzipLine, 'default.conf has no gzip_types directive');
  const gzipped = new Set(gzipLine[1].trim().split(/\s+/));
  assert.ok(
    gzipped.has('application/atom+xml'),
    '/feed.xml is served as application/atom+xml but that type is missing from gzip_types',
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
  // `catalog.json` is a third such path as of this change. This line used to
  // assert its absence, with the reason "lives on the tools host and is not
  // served here" — true until `renderFrontDoorCatalog` gave the apex its own.
  // The rule did not change, only which host satisfies it: what must never
  // appear is a link at the *dark* host, which the two assertions above check
  // by hostname rather than by filename.
  assert.match(txt, new RegExp(`\\]\\(${escapeForRegExp(FRONT_DOOR_URL + CATALOG_FILE)}\\)`));
  assert.ok(
    !txt.includes(`${TOOLS_URL}${CATALOG_FILE}`),
    'the catalogue host\'s own catalog.json is still not something to link',
  );
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
  assert.equal(bullets.length, 4, 'one tool bullet plus the three Optional entries');
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

test('llms.txt claims a wider collection only while one actually exists', () => {
  // The regression this pins: the coverage paragraph was unconditional, so
  // once the two 2026-09-03 mirror fixes brought `mirrored` up to `total` it
  // told every crawler the 169 tools it had just linked were a subset, and
  // that their real home was a hostname serving nothing. `llms.txt` is read
  // by a model that paraphrases it, so a false "there are more, elsewhere"
  // becomes a confident recommendation of a dead end.
  const partial = renderFrontDoorLlms({ mirrored: MIRROR, total: MIRROR.length + 1 });
  assert.match(partial, /The wider\s+collection runs to/, 'a real subset still says so');

  const complete = renderFrontDoorLlms({ mirrored: MIRROR, total: MIRROR.length });
  assert.ok(
    !/wider\s+collection/.test(complete),
    'a complete mirror must not claim tools it is not showing',
  );
  assert.ok(
    !/will be published at/.test(complete),
    'the tools are published here — saying they are yet to be sends readers away',
  );
  assert.match(complete, new RegExp(`all ${MIRROR.length} of them`));

  // The invariant that holds either way, and the reason this test asserts on
  // both branches rather than swapping the paragraph out: the catalogue host
  // is named so a model meeting it elsewhere knows not to send anyone there,
  // and is never linked. A future flip of `TOOLS_HOST_SERVES` is what retires
  // this pair, not a count change.
  for (const txt of [partial, complete]) {
    assert.ok(txt.includes('tools.marisstella.dev'), 'the catalogue host is still named');
    assert.ok(!txt.includes('](https://tools.'), 'and still never linked');
    assert.match(txt, /not serving yet/);
  }
});

test('the committed llms.txt matches what this generator produces', async () => {
  const { llms } = await buildFrontDoor();
  assert.equal(
    await fs.readFile(LLMS_OUTPUT_FILE, 'utf8'),
    llms,
    'gitops/prod/front-door/llms.txt is stale — run: node platform/marketing/regen.mjs',
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
  const served = new Set([
    `${FRONT_DOOR_URL}${FEED_FILE}`,
    `${FRONT_DOOR_URL}${SITEMAP_FILE}`,
    `${FRONT_DOOR_URL}${CATALOG_FILE}`,
    // The comparison index. Listed here rather than pattern-matched below for
    // the same reason the three above are: it is a page this host renders
    // itself, not a mirrored tool, so there is no `<slug>__index.html` key to
    // check it against. That it is actually served is checked by the
    // `^/compare/?$` nginx block test and the ConfigMap-key test.
    `${FRONT_DOOR_URL}${COMPARE_PATH}`,
  ]);
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

// ---------------------------------------------------------------------------
// catalog.json — the structured counterpart to llms.txt.
//
// `llms.txt` is markdown a model reads; this is JSON a client parses. The
// failure modes differ accordingly, and these tests are written against the
// parsing one: a model handed the wrong bytes reports nothing useful, but a
// client handed the wrong bytes throws at `JSON.parse` and silently drops the
// whole collection. So every assertion below is about what a parser sees.
// ---------------------------------------------------------------------------

test('catalog.json is valid JSON with the envelope build.mjs uses', () => {
  const catalog = JSON.parse(renderFrontDoorCatalog({ mirrored: MIRROR, total: 169 }));
  // The same key names `platform/pages/build.mjs`'s `renderCatalog` emits, so
  // a client that learns to read one reads the other — and so the two hosts do
  // not disagree about what a tool is on the day the seal lands.
  for (const key of ['name', 'url', 'license', 'price', 'privacy', 'tools']) {
    assert.ok(key in catalog, `catalog.json must carry ${key}, as the tools host's does`);
  }
  assert.equal(catalog.url, FRONT_DOOR_URL);
  assert.equal(catalog.license, 'MIT');
  assert.deepEqual(catalog.price, { amount: '0', currency: 'USD' });
  assert.equal(catalog.privacy, 'client-side-only');
  assert.equal(
    catalog.generated_by,
    'platform/marketing/front-door.mjs',
    'must name the generator that actually wrote this file, not the tools host one',
  );
});

test('catalog.json states the subset honestly and links nothing dark', () => {
  const catalog = JSON.parse(renderFrontDoorCatalog({ mirrored: MIRROR, total: 169 }));
  assert.equal(catalog.served_here, MIRROR.length);
  assert.equal(catalog.collection_total, 169);
  // The whole reason this file lists only the mirrored tools: every entry
  // carries a URL a client will follow without a human reading it, so a link
  // to the unsealed host would be a machine-checkable dead end republished by
  // aggregators. The wider figure is a number instead.
  const json = renderFrontDoorCatalog({ mirrored: MIRROR, total: 169 });
  assert.ok(
    !json.includes(TOOLS_URL.replace(/\/$/, '')),
    'catalog.json must never link the catalogue host while it serves nothing',
  );
});

test('catalog.json describes every mirrored tool at a URL on this host', () => {
  const catalog = JSON.parse(renderFrontDoorCatalog({ mirrored: MIRROR, total: 169 }));
  assert.equal(catalog.tools.length, MIRROR.length);
  for (const tool of catalog.tools) {
    for (const key of ['slug', 'name', 'url', 'category']) {
      assert.ok(tool[key], `every tool needs ${key}`);
    }
    assert.match(
      tool.url,
      new RegExp(`^${escapeForRegExp(FRONT_DOOR_URL.replace(/\/$/, ''))}/tools/[a-z0-9-]+/$`),
      `${tool.url} is not a path this host serves`,
    );
  }
});

test('catalog.json category links land on category pages this host serves', async () => {
  // This asserted the front page's `#open-<id>` fragment until the apex grew
  // real category pages, on the reasoning that a `/c/<id>/` URL "would be the
  // tools host's collection page, which serves nothing". That premise is gone:
  // the apex renders and serves those seven pages itself, `renderFrontDoor`'s
  // JSON-LD `hasPart` already names them, and this file is the one a consumer
  // is told to parse instead of `llms.txt` — so it should hand back the page
  // that lists a category, not a fragment it would have to scrape a 55 KB home
  // page for.
  const catalog = JSON.parse(renderFrontDoorCatalog({ mirrored: MIRROR, total: 169 }));
  assert.ok(catalog.categories.length > 0);
  for (const category of catalog.categories) {
    assert.equal(category.url, apexCategoryUrl(category.id));
    assert.ok(!category.url.includes('#'), `${category.url} should be a page, not an anchor`);
    assert.ok(
      category.url.startsWith(FRONT_DOOR_URL),
      'a category URL on the dark host is the failure this file must never publish',
    );
  }

  // The pair that makes those URLs true rather than merely well-formed, run
  // against the real tree rather than the fixture: every category the built
  // catalogue names was rendered as a page in the same build and is in the
  // same build's sitemap. A group with no page behind it is the one way a URL
  // here could go dead, and it would go dead silently.
  const built = await buildFrontDoor();
  const rendered = new Set(built.categoryPages.map((page) => page.id));
  const builtCatalog = JSON.parse(built.catalog);
  assert.ok(builtCatalog.categories.length > 0);
  for (const category of builtCatalog.categories) {
    assert.equal(category.url, apexCategoryUrl(category.id));
    assert.ok(rendered.has(category.id), `no page was rendered for /c/${category.id}/`);
    assert.ok(built.sitemap.includes(category.url), `${category.url} is missing from the sitemap`);
  }
  assert.equal(
    catalog.categories.reduce((sum, c) => sum + c.tool_count, 0),
    MIRROR.length,
    'a tool counted twice, or dropped, would misstate the collection',
  );
});

test('catalog.json flattens descriptions that would break a reader', () => {
  // Not a JSON-escaping worry — `JSON.stringify` handles a newline. This is
  // the same normalisation `renderFrontDoorLlms` does, kept so the two files
  // quote a venture's description identically rather than one wrapping and one
  // not.
  const catalog = JSON.parse(
    renderFrontDoorCatalog({
      mirrored: [{ ...MIRROR[0], description: 'One line\n  and its wrapped   second half.' }],
      total: 169,
    }),
  );
  assert.equal(catalog.tools[0].description, 'One line and its wrapped second half.');
});

test('catalog.json omits the page count rather than guessing it', () => {
  // `null` or `0` would both read as a fact to a client filtering on it. The
  // key is absent when unknown, so a consumer that reads it at all can trust
  // it — `renderCatalog`'s rule for `launched`, applied to the same problem.
  const withCounts = JSON.parse(
    renderFrontDoorCatalog({
      mirrored: MIRROR,
      total: 169,
      pageCounts: new Map([[MIRROR[0].slug, 4]]),
    }),
  );
  assert.equal(withCounts.tools[0].pages, 4);
  assert.ok(!('pages' in withCounts.tools[1]), 'an unknown page count must be absent, not 0');
});

test('catalog.json carries no funding key', () => {
  // Same reason `renderCatalog` refuses one: `funding-sponsors-live` is an
  // open owner decision and a machine-readable file must not pre-answer it.
  const catalog = JSON.parse(renderFrontDoorCatalog({ mirrored: MIRROR, total: 169 }));
  assert.ok(!('sponsor' in catalog), 'catalog.json must not carry a funding field');
  assert.ok(!('funding' in catalog));
});

test('the committed catalog.json matches what this generator produces', async () => {
  const { catalog } = await buildFrontDoor();
  assert.equal(
    await fs.readFile(CATALOG_OUTPUT_FILE, 'utf8'),
    catalog,
    'gitops/prod/front-door/catalog.json is stale — run: node platform/marketing/regen.mjs',
  );
});

test('every tool in the committed catalog.json is backed by a mirrored page', async () => {
  // The same check `llms.txt` gets, and it binds harder here: a client parses
  // this file and follows a URL with nobody watching, so a stale entry is a
  // 404 served to a machine that will republish it.
  const { buildMirror } = await import('./front-door-tools.mjs');
  const { files } = await buildMirror();
  const keys = new Set(files.map((f) => f.key));
  const catalog = JSON.parse(await fs.readFile(CATALOG_OUTPUT_FILE, 'utf8'));
  assert.ok(catalog.tools.length > 10, 'the committed catalog should carry the mirrored tools');
  for (const tool of catalog.tools) {
    assert.ok(
      keys.has(`${tool.slug}__index.html`),
      `catalog.json lists ${tool.slug}, which the mirror lacks`,
    );
  }
  assert.equal(
    catalog.served_here,
    catalog.tools.length,
    'served_here must be the length of the list it describes',
  );
});

test('the committed catalog.json parses and agrees with llms.txt', async () => {
  // Three documents describing one host is three chances to disagree. The feed
  // is capped and the sitemap counts pages, so the tool *set* is only
  // comparable between these two — and a client that read both and got
  // different collections would have no way to tell which was right.
  const catalog = JSON.parse(await fs.readFile(CATALOG_OUTPUT_FILE, 'utf8'));
  const txt = await fs.readFile(LLMS_OUTPUT_FILE, 'utf8');
  const linked = new Set(
    [...txt.matchAll(/\]\((https:\/\/marisstella\.dev\/tools\/([a-z0-9-]+)\/)\)/g)].map((m) => m[2]),
  );
  assert.deepEqual(
    catalog.tools.map((t) => t.slug).sort(),
    [...linked].sort(),
    'catalog.json and llms.txt must describe the same tools',
  );
});

test('llms.txt offers the catalogue now that this host serves one', async () => {
  // The premise this change retired: `## Optional` used to say catalog.json
  // "lives on the tools host and is not served here". It is served here now,
  // and the rule that produced the old exclusion — every entry is a path this
  // host answers — is what makes listing it correct rather than a regression.
  const txt = await fs.readFile(LLMS_OUTPUT_FILE, 'utf8');
  assert.ok(
    txt.includes(`${FRONT_DOOR_URL}${CATALOG_FILE}`),
    'llms.txt should point a model at the structured catalogue',
  );
  const optional = txt.slice(txt.indexOf('## Optional'));
  assert.ok(optional.includes(CATALOG_FILE), 'it belongs under ## Optional, beside the feed');
});

test('nginx answers /catalog.json as JSON, above the catch-all', async () => {
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  const block = conf.match(
    new RegExp(`location = /${escapeForRegExp(CATALOG_FILE)} \\{[\\s\\S]*?\\n {2}\\}`),
  );
  assert.ok(block, `front-door/default.conf must serve /${CATALOG_FILE} explicitly`);
  assert.match(block[0], /default_type application\/json;/);
  assert.match(block[0], new RegExp(`try_files /${escapeForRegExp(CATALOG_FILE)} =404;`));
  assert.match(block[0], /charset utf-8;/);
  assert.ok(!/X-Robots-Tag/.test(block[0]), '/catalog.json exists to be fetched by clients');
  // The highest-stakes ordering assertion in this file. Below the catch-all,
  // `/catalog.json` returns 49 KB of HTML under a 200 and every client fails
  // at JSON.parse with nothing to report.
  assert.ok(
    conf.indexOf(`location = /${CATALOG_FILE}`) < conf.indexOf('location / {'),
    'keep the /catalog.json block above the catch-all',
  );
});

test('catalog.json rides in the ConfigMap that mounts at the document root', async () => {
  const kustomization = await fs.readFile(
    path.join(path.dirname(OUTPUT_FILE), '..', 'kustomization.yaml'),
    'utf8',
  );
  assert.match(
    kustomization,
    new RegExp(`- ${escapeForRegExp(CATALOG_FILE)}=front-door/${escapeForRegExp(CATALOG_FILE)}`),
  );
});

test('the generated front-door set stays under the ConfigMap object ceiling', async () => {
  // Every file below rides in one ConfigMap because they all have to sit at
  // the document root, and there are two ceilings on that object, not one:
  //
  //   262144 bytes — the API server's cap on an object's annotations, which a
  //     client-side apply has to fit a whole copy of the object into. Adding
  //     catalog.json took this generator from ~226 KB to ~314 KB and past it.
  //     That is handled in `gitops/prod/kustomization.yaml` by asking Argo for
  //     `ServerSideApply=true`, which writes no such annotation, and it is
  //     `test_a_configmap_too_large_for_client_side_apply_asks_for_server_side`
  //     in `gitops/tests/test_manifests.py` that enforces the pairing.
  //   1 MiB — etcd's ceiling on the object itself, which nothing can opt out
  //     of. That is the one this test guards, and with the cap above lifted it
  //     is now the only thing standing between a growing mirror and a front
  //     door that cannot be applied at all.
  //
  // The file list is read out of `gitops/prod/kustomization.yaml` rather than
  // written here, because the object this bounds is the one kustomize builds
  // and a hand-kept copy of its contents undercounts silently. It did: this
  // test named seven files while the `portfolio-front-html` generator carried
  // sixteen, so the seven category pages (~136 KB) and the About page were
  // outside the ceiling it claimed to enforce, and the comment in the
  // kustomization saying "the ceiling test covers the whole generated set" was
  // not true of it. Derived, adding a key to that ConfigMap is now measured by
  // this test on the run that adds it.
  const kustomization = await fs.readFile(
    path.join(path.dirname(path.dirname(OUTPUT_FILE)), 'kustomization.yaml'),
    'utf8',
  );
  const block = kustomization.match(
    /\n {2}- name: portfolio-front-html\n([\s\S]*?)(?=\n {2}- name: |\n[a-zA-Z])/,
  );
  assert.ok(block, 'could not find the portfolio-front-html ConfigMap in the kustomization');
  const names = [...block[1].matchAll(/^ {6}- [^=\n]+=front-door\/(\S+)$/gm)].map((m) => m[1]);
  assert.ok(names.length >= 16, `only ${names.length} keys parsed out of the ConfigMap block`);

  // Binary keys are counted base64'd, which is how kustomize stores them; text
  // keys ride as-is under `data`.
  const BINARY = /\.(png|ico|woff2?)$/;
  let total = 0;
  for (const name of names) {
    const bytes = (await fs.readFile(path.join(path.dirname(OUTPUT_FILE), name))).byteLength;
    total += BINARY.test(name) ? Math.ceil(bytes / 3) * 4 : bytes;
  }
  assert.ok(
    total < 1024 * 1024,
    `the front-door ConfigMap would be ${total} bytes, over the 1 MiB ceiling`,
  );
});

test('the About page is mounted by the kustomization and served by nginx', async () => {
  // The same seam the category-page test guards, and the About page falls
  // through it identically: rendered, linked from the front page, and in the
  // sitemap, but never delivered unless the ConfigMap carries it and nginx has
  // a route to it. Both halves, because either alone is a 404 on a URL two
  // other artifacts advertise.
  const frontDoorDir = path.dirname(OUTPUT_FILE);
  const kustomization = await fs.readFile(
    path.join(path.dirname(frontDoorDir), 'kustomization.yaml'),
    'utf8',
  );
  assert.ok(
    kustomization.includes(`- ${ABOUT_KEY}=front-door/${ABOUT_KEY}`),
    `gitops/prod/kustomization.yaml must mount ${ABOUT_KEY}; without it /about/ is a 404`,
  );
  const conf = await fs.readFile(path.join(frontDoorDir, 'default.conf'), 'utf8');
  assert.match(
    conf,
    /location ~ "\^\/about\/\?\$"/,
    'front-door/default.conf must route /about/, or the catch-all answers it with the front page',
  );
  assert.ok(
    conf.includes(`try_files /${ABOUT_KEY} =404`),
    `the /about/ block must rewrite to ${ABOUT_KEY}, the key the kustomization mounts`,
  );
});

test('the About page claim about the access log matches the log_format that ships', async () => {
  // The page's strongest claim is that this host records no IP address, no
  // user agent and no referrer — stated as a property of the configuration
  // rather than a promise. A later change that widens `log_format privacy`
  // would make that claim false with nothing else failing, so it fails here
  // instead, in a test that names the page.
  const conf = await fs.readFile(
    path.join(path.dirname(OUTPUT_FILE), 'default.conf'),
    'utf8',
  );
  const logFormats = [...conf.matchAll(/^log_format\s+\w+\s+(.*);$/gm)].map((m) => m[1]);
  assert.ok(logFormats.length, 'no log_format found — the About page describes one that must exist');
  for (const field of PRIVACY_LOG_FIELDS) {
    for (const format of logFormats) {
      assert.ok(
        !format.includes(field),
        `${field} is now logged, so /about/'s "no addresses, no user agent, no referrer" claim ` +
          `is false. Either drop the field or rewrite renderFrontDoorAbout — do not delete this test.`,
      );
    }
  }
});

test('the About page states no claim this host cannot keep', async () => {
  // The two claims `build.mjs`'s About page makes that are false here, and the
  // reason this page exists separately rather than reusing it. Asserted as
  // absences because the failure mode is a future session "unifying" the two
  // renderers and silently importing copy about a counter this host does not
  // ship.
  const { about } = await buildFrontDoor();
  assert.ok(
    !/local storage|localStorage/i.test(about),
    'the apex ships no local-storage counter — see renderFrontDoorAbout on why this page is separate',
  );
  assert.ok(
    !/opt-out checkbox/i.test(about),
    'the apex front page has no opt-out checkbox, so the page must not send a reader looking for one',
  );
  // And nothing this document root does not serve. `pf-site.js` and
  // `favicon.ico` are the two build.mjs loads that would 404 here.
  assert.ok(!about.includes('pf-site.js'), 'the apex does not serve pf-site.js');
  assert.ok(!about.includes('favicon.ico'), 'the apex serves favicon.svg only');
});

test('every link on the About page is one this host serves', async () => {
  // `validateLinks` covers the mirrored pages; this page is not mirrored, so
  // nothing else checks it. A dead link on the one page whose whole job is
  // credibility is worse than a dead link anywhere else here.
  const { about, categoryPages } = await buildFrontDoor();
  const served = new Set([
    '/',
    `/${ABOUT_PATH}`,
    `/${FAVICON_FILE}`,
    `/${FEED_FILE}`,
    `/${LLMS_FILE}`,
    `/${CATALOG_FILE}`,
    `/${SITEMAP_FILE}`,
    ...categoryPages.map((page) => `/${categoryPagePath(page.id)}`),
  ]);
  const hrefs = [...about.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 5, 'the About page rendered with almost no links — something is wrong');
  for (const href of hrefs) {
    if (href.startsWith('https://')) {
      // Absolute links are either this host (the canonical and the category
      // links, both checked below in their root-relative form) or an outside
      // address a reader chooses to click.
      if (href.startsWith(FRONT_DOOR_URL)) {
        assert.ok(
          served.has(`/${href.slice(FRONT_DOOR_URL.length)}`),
          `${href} is on this host but is not a path it serves`,
        );
      }
      continue;
    }
    assert.ok(served.has(href), `${href} is not a path this host serves`);
  }
});

test('the About page carries the §5b clauses, the sponsor link, and no invented traction', async () => {
  const { about } = await buildFrontDoor();
  assert.ok(about.includes('No warranty.'), 'a hosted surface here carries the no-warranty clause');
  assert.ok(about.includes('no SLA'), 'a hosted surface here carries the no-SLA clause');
  // GitHub Sponsors is the only monetisation this portfolio has, and the page
  // has to say declining costs the reader nothing.
  assert.ok(about.includes(SPONSORS_URL));
  assert.match(about, /entirely optional/);
  // The absolute limit on this page: never claim traction that does not exist.
  // Matched as claim *shapes* rather than bare words — the page legitimately
  // uses "certified" and "guaranteed" to say these tools are neither, and a
  // word-level check would forbid the disclaimer along with the boast. That is
  // not a hypothetical: the first version of this test failed on the page's
  // own "please do not describe these as certified, audited, guaranteed".
  for (const forbidden of [
    /\btrusted by\b/i,
    /\bused by [\d,]+/i,
    /\btestimonial/i,
    /\b(is|are|been)\s+(certified|audited|guaranteed)\b/i,
    /\b[\d,]+\+?\s+(users|customers|businesses|contractors)\b/i,
  ]) {
    assert.ok(!forbidden.test(about), `the About page must not claim ${forbidden}`);
  }
  // And the caveat itself is present, which is the other half of the same
  // rule: the page tells a linker not to describe these as certified.
  assert.match(about, /do not describe these as certified/i);
});

test('the About page counts the tools and categories this host actually serves', async () => {
  // Derived, never written down: the count on this page is the same mirror the
  // front page and the catalogue read, so the three cannot disagree. The
  // failure this prevents is a press-kit paragraph a linker copies that names
  // a tool count the site has not had for weeks.
  const { about, categoryPages } = await buildFrontDoor();
  const { buildMirror } = await import('./front-door-tools.mjs');
  const { tools } = await buildMirror();
  assert.ok(
    about.includes(`${tools.length} free, private calculators`),
    'the one-line boilerplate does not carry the live tool count',
  );
  assert.ok(
    about.includes(`<strong>${tools.length} tools</strong> across ${categoryPages.length} categories`),
    'the facts list does not carry the live tool and category counts',
  );
  assert.equal(apexAboutUrl(), `${FRONT_DOOR_URL}${ABOUT_PATH}`);
  assert.ok(aboutOutputFile().endsWith(ABOUT_KEY));
});

test('the front page and the sitemap both lead to the About page', async () => {
  // It existed and was reachable from nowhere for as long as the only link to
  // it was `${toolsUrl}${ABOUT_PATH}` on a host that serves nothing.
  const { html, sitemap } = await buildFrontDoor();
  assert.ok(
    html.includes(`href="/${ABOUT_PATH}"`),
    'the front page must link /about/, or the page is published and unreachable',
  );
  assert.ok(
    sitemap.includes(`<loc>${FRONT_DOOR_URL}${ABOUT_PATH}</loc>`),
    'the sitemap must list /about/',
  );
});

test('renderFrontDoorAbout survives an empty catalogue', async () => {
  // Reachable on the day `portfolio-site-repo` is sealed: the mirror empties,
  // `categoryPages` goes to zero, and this page keeps being served because it
  // is this host's own. It must not render "0 free tools" as a broken sentence
  // or throw on the empty category list.
  const about = renderFrontDoorAbout();
  assert.ok(about.includes('<!doctype html>'));
  assert.ok(about.includes('No warranty.'));
  assert.ok(about.includes(SPONSORS_URL));
});

// ---------------------------------------------------------------------------
// The comparison index
//
// The gap it closes, measured on 2026-09-05 against the committed front door:
// 167 `vs-<product>.html` pages in the catalogue, each linked from exactly one
// place (its own tool's entry page), zero cross-venture links between them, and
// the word "alternative" nowhere in anything this host serves. These tests pin
// the three ways that would come back — the page not rendering, the page
// rendering unreachably, and the page saying something no venture author wrote.
// ---------------------------------------------------------------------------

test('the comparison index lists a page for every mirrored vs- file', async () => {
  const { comparisons } = await buildFrontDoor();
  const { buildMirror } = await import('./front-door-tools.mjs');
  const { files } = await buildMirror();
  const expected = files.filter((f) => COMPARISON_FILE_PATTERN.test(f.file));
  assert.ok(expected.length > 100, 'the mirror should carry the catalogue comparison pages');
  assert.ok(comparisons, 'the index must render while the mirror carries comparison pages');
  for (const f of expected) {
    assert.ok(
      comparisons.includes(`href="/tools/${f.slug}/${f.file}"`),
      `/compare/ omits ${f.slug}/${f.file}, so that page stays reachable from one place only`,
    );
  }
  // And nothing it does not serve: a link the catch-all answers with the front
  // page is the defect every other artifact here is guarded against.
  const linked = [...comparisons.matchAll(/href="\/tools\/([a-z0-9-]+)\/(vs-[^"]+)"/g)];
  const keys = new Set(files.map((f) => f.key));
  for (const [, slug, file] of linked) {
    assert.ok(keys.has(`${slug}__${file}`), `/compare/ links ${slug}/${file}, which the mirror lacks`);
  }
});

test('every product name on the comparison index came from a page that named it', async () => {
  // The mandate's absolute limit: a marketing surface may only restate a claim
  // a venture author already wrote and cited. This page names other companies'
  // products, so the strictest reading applies — every name it prints has to be
  // a substring of the comparison page it links to, or the index invented it.
  const { buildMirror } = await import('./front-door-tools.mjs');
  const { files } = await buildMirror();
  const comparisonFiles = files.filter((f) => COMPARISON_FILE_PATTERN.test(f.file));
  for (const f of comparisonFiles) {
    const subject = comparisonSubject(f.contents);
    assert.ok(subject, `${f.slug}/${f.file} has no "… vs. <product>" heading`);
    assert.ok(
      f.contents.includes(subject),
      `"${subject}" is not text ${f.slug}/${f.file} contains`,
    );
  }
});

test('the comparison index is reachable and disclaimed', async () => {
  const { comparisons, html, sitemap, llms } = await buildFrontDoor();
  assert.ok(
    html.includes(`href="/${COMPARE_PATH}"`),
    'the front page must link /compare/, or the index is published and unreachable',
  );
  assert.ok(
    sitemap.includes(`<loc>${FRONT_DOOR_URL}${COMPARE_PATH}</loc>`),
    'the sitemap must list /compare/',
  );
  assert.ok(llms.includes(`${FRONT_DOOR_URL}${COMPARE_PATH}`), 'llms.txt must name /compare/');
  assert.match(comparisons, /No warranty\./);
  assert.match(comparisons, /Not affiliated with, endorsed by, or reviewed by/);
  assert.equal(apexCompareUrl(), `${FRONT_DOOR_URL}${COMPARE_PATH}`);
  assert.ok(compareOutputFile().endsWith(COMPARE_KEY));
  assert.ok(
    comparisons.includes(`<link rel="canonical" href="${apexCompareUrl()}">`),
    'the index must name its own canonical URL',
  );
});

test('nginx routes /compare/ to the key the generator writes', async () => {
  // Same seam as the category pages: `COMPARE_KEY` names the file and the
  // `^/compare/?$` block rewrites the URL to it. If they disagree the page is
  // dark while the generator, the kustomization and the sitemap all still pass.
  const conf = await fs.readFile(NGINX_CONF_FILE, 'utf8');
  assert.match(conf, /location ~ "\^\/compare\/\?\$" \{/);
  assert.match(conf, new RegExp(`try_files /${escapeForRegExp(COMPARE_KEY)} =404;`));
  assert.equal(`${COMPARE_PATH.replace(/\/$/, '')}.html`, COMPARE_KEY);
});

test('the kustomization mounts the comparison index', async () => {
  const kustomization = await fs.readFile(
    path.join(path.dirname(path.dirname(OUTPUT_FILE)), 'kustomization.yaml'),
    'utf8',
  );
  assert.ok(
    kustomization.includes(`- ${COMPARE_KEY}=front-door/${COMPARE_KEY}`),
    `gitops/prod/kustomization.yaml must mount ${COMPARE_KEY}; add it or the page is dark`,
  );
});

test('the committed comparison index matches what this generator produces', async () => {
  const { comparisons } = await buildFrontDoor();
  assert.equal(
    await fs.readFile(compareOutputFile(), 'utf8'),
    comparisons,
    'gitops/prod/front-door/compare.html is stale — run: node platform/marketing/regen.mjs',
  );
});

test('renderFrontDoorComparisons survives one product and one tool', () => {
  // The shape that has no "compared by more than one tool" band at all. It must
  // render rather than emit an empty `<ul>` under a heading promising entries.
  const groups = groupComparisons([
    {
      slug: 'x-calculator',
      file: 'vs-example.html',
      subject: 'Example Software',
      subjectKey: comparisonSubjectKey('Example Software'),
      title: 'X Calculator',
      href: '/tools/x-calculator/vs-example.html',
      summary: 'Prices a thing.',
    },
  ]);
  const html = renderFrontDoorComparisons({ groups, total: 1, categories: [] });
  assert.ok(html.includes('<!doctype html>'));
  assert.ok(html.includes('Example Software'));
  assert.ok(html.includes('href="/tools/x-calculator/vs-example.html"'));
  assert.match(html, /No warranty\./);
});
