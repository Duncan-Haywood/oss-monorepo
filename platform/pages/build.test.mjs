// Tests the assembled Pages site, not just the helpers that assemble it.
//
// The failure this suite exists to prevent is silent: a tool that stops being
// reachable, a link that 404s, or a page that ships with the placeholder origin
// still in its canonical tag. None of those turn anything red on their own —
// the site builds fine and the visitor simply cannot get there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  addOfflineSupport,
  annotateNumberInputs,
  stepAllowsDecimals,
  buildSite,
  categoryFor,
  collectPageTitles,
  injectFavicon,
  discoverSurfaces,
  injectChrome,
  isPublishable,
  NO_SLA_PATTERN,
  listFiles,
  readMeta,
  relatedTools,
  upToRoot,
  renderHub,
  pageUrlPath,
  renderFavicon,
  renderFaviconSvg,
  renderRobots,
  renderSitemapIndex,
  renderVentureSitemap,
  searchTokens,
  searchVariants,
  aliasesFor,
  SEARCH_ALIASES,
  subcategoryFor,
  groupByCategory,
  groupBySubcategory,
  truncate,
  injectDiscoveryTags,
  SOCIAL_CARD_FILE,
  SITE_NAME,
  REPO_ROOT,
  SOURCE_URL_PREFIX,
} from './build.mjs';
import { renderSocialCard, SOCIAL_CARD_WIDTH, SOCIAL_CARD_HEIGHT } from './offline.mjs';

const BASE = 'https://example.test/site/';
const VENTURES = path.join(REPO_ROOT, 'ventures');

let built;
async function site() {
  if (!built) {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-build-'));
    built = await buildSite({ outDir, baseUrl: BASE });
  }
  return built;
}

const read = async (...parts) => fs.readFile(path.join((await site()).outDir, ...parts), 'utf8');

const BASE_PATH = new URL(BASE).pathname; // "/site/"

/**
 * The file a page's href points at.
 *
 * Root-absolute hrefs are resolved against the site root rather than the
 * filesystem root: on a project site the published tree lives under a path
 * prefix, so `/site/favicon.ico` is `<outDir>/favicon.ico`. Resolving those
 * relative to the containing page reports every one of them as broken.
 */
function hrefTarget(href, fromFile, outDir) {
  const resolved = href.startsWith('/')
    ? path.join(outDir, href.startsWith(BASE_PATH) ? href.slice(BASE_PATH.length) : href.slice(1))
    : path.resolve(path.dirname(fromFile), href);
  return href.endsWith('/') ? path.join(resolved, 'index.html') : resolved;
}

/**
 * Every off-origin URL the given HTML would *fetch* on load, as opposed to
 * link to. `src` covers scripts, images and frames; a <link> that fetches --
 * a stylesheet, an icon, a preload, a web manifest -- carries its URL in
 * `href`, which is indistinguishable by attribute from an ordinary anchor, so
 * the `rel` is what separates them.
 */
const FETCHING_REL = /^(icon|alternate icon|shortcut icon|mask-icon|apple-touch-icon|stylesheet|preload|prefetch|preconnect|dns-prefetch|manifest)$/i;

function offOriginResources(html) {
  return [
    ...[...html.matchAll(/src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<link\b[^>]*>/g)]
      .filter((m) => FETCHING_REL.test((m[0].match(/rel="([^"]*)"/)?.[1] ?? '').trim()))
      .map((m) => m[0].match(/href="([^"]*)"/)?.[1] ?? '')
      .filter((href) => /^https?:\/\//.test(href)),
  ];}

const exists = (target) => fs.access(target).then(() => true, () => false);

/** The path component of a base URL, without the leading slash. */
const pathOf = (baseUrl) => new URL(baseUrl).pathname.replace(/^\//, '');

/** Every `.html` file in the built site, relative to its root. */
async function allPages(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) pages.push(...(await allPages(path.join(dir, entry.name), relative)));
    else if (entry.name.endsWith('.html')) pages.push(relative);
  }
  return pages;
}

/**
 * Every `<loc>` across the whole sitemap tree — the index and each sitemap it
 * names — as site-root-relative paths. Checking only the root sitemap would
 * pass while every venture underneath it pointed somewhere that 404s.
 */
async function sitemapUrlPaths() {
  const { outDir } = await site();
  const paths = new Set();

  const collect = async (relative) => {
    const file = path.join(outDir, relative);
    if (!(await exists(file))) return;
    for (const [, loc] of (await fs.readFile(file, 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const urlPath = new URL(loc).pathname.replace(/^\//, '');
      if (urlPath.endsWith('sitemap.xml') || urlPath.endsWith('sitemap-hub.xml')) {
        await collect(urlPath.slice(pathOf(BASE).length));
      } else {
        paths.add(urlPath);
      }
    }
  };

  await collect('sitemap.xml');
  return paths;}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

test('every venture with a browser entry point is discovered', async () => {
  const surfaces = await discoverSurfaces(VENTURES);
  const slugs = surfaces.map((s) => s.slug);

  // A representative slice of each shape the discovery rules handle.
  assert.ok(slugs.includes('ebay-fee-calculator'), 'top-level index.html');
  assert.ok(slugs.includes('quote-margin-check'), 'site/index.html');
  assert.ok(slugs.includes('ai-engineering-academy'), 'explicit entry override');
  assert.ok(surfaces.length >= 25, `expected the full portfolio, got ${surfaces.length}`);
});

test('non-product ventures are excluded', async () => {
  const slugs = (await discoverSurfaces(VENTURES)).map((s) => s.slug);
  assert.ok(!slugs.includes('ubuntu-agent-server'), 'the agent box is not a public surface');
  assert.ok(!slugs.includes('retail-pilot-intel'), 'passcode-gated docs keep their own deploy');
});

test('discovery is deterministic', async () => {
  const first = (await discoverSurfaces(VENTURES)).map((s) => s.slug);
  const second = (await discoverSurfaces(VENTURES)).map((s) => s.slug);
  assert.deepEqual(first, second);
  assert.deepEqual(first, [...first].sort());
});

// ---------------------------------------------------------------------------
// Payload hygiene
// ---------------------------------------------------------------------------

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

test('no test payload, CLI source, or repo bookkeeping is published', async () => {
  const { outDir } = await site();
  const files = (await walk(outDir)).map((f) => path.relative(outDir, f));

  // `foo.test.mjs` is the convention, not a rule. This check was written to
  // match only that spelling, so `retainage-cashflow-calculator/test.mjs` and
  // `freelance-retainer-calculator/test_app.mjs` shipped to the public site
  // while the test that exists to catch exactly this stayed green. Match the
  // other spellings too, so the next venture that invents one is caught.
  const leaked = files.filter(
    (f) =>
      /(^|[./])test\.(mjs|js|py)$/.test(f) ||
      /(^|\/)test_/.test(f) ||
      /_test\.(mjs|js|py)$/.test(f) ||
      f.endsWith('.py') ||
      f.endsWith('VENTURE.yaml') ||
      f.endsWith('README.md') ||
      f.includes('node_modules'),
  );
  assert.deepEqual(leaked, [], `these should not be on the public site: ${leaked.join(', ')}`);
});

test('LICENSE files are kept', async () => {
  const { outDir } = await site();
  const files = (await walk(outDir)).map((f) => path.relative(outDir, f));
  assert.ok(files.some((f) => f.endsWith('LICENSE')), 'MIT terms ship with the tools');
});

test('no page still points at the placeholder origin', async () => {
  const { outDir } = await site();
  const textFiles = (await walk(outDir)).filter((f) => /\.(html|xml|txt|mjs|json)$/.test(f));

  const stale = [];
  for (const file of textFiles) {
    if ((await fs.readFile(file, 'utf8')).includes('example.invalid')) {
      stale.push(path.relative(outDir, file));
    }
  }
  assert.deepEqual(stale, [], `placeholder origin survived in: ${stale.join(', ')}`);
});

test('venture sitemaps are rewritten to the real origin', async () => {
  const xml = await read('ebay-fee-calculator', 'sitemap.xml');
  assert.ok(xml.includes(`${BASE}ebay-fee-calculator/`));
});

// ---------------------------------------------------------------------------
// Reachability — the whole point of the site
// ---------------------------------------------------------------------------

/**
 * Drop `<script>` and `<style>` bodies before looking for links.
 *
 * A browser does not parse either as markup, so an `href="..."` inside one is
 * not a link. `tender-radar/site/index.html` builds its result rows at runtime
 * with `` `<a href="${escapeHtml(href)}">` ``; scanning the raw file saw that
 * template placeholder as a relative link named `${escapeHtml(href)}`, found no
 * such file, and failed the whole Pages build over a page that is correct.
 *
 * Every tool here ships as static HTML plus an inline module, so any tool that
 * builds markup in script is one edit away from the same false positive.
 */
function stripRawText(html) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

test('every discovered tool has a landing page in the output', async () => {
  const { outDir, surfaces } = await site();
  for (const surface of surfaces) {
    const entry = path.join(outDir, surface.slug, 'index.html');
    await fs.access(entry); // throws if the tool did not make it into the site
  }
});

test('every hub link resolves to a file that exists', async () => {
  const { outDir } = await site();
  const hub = stripRawText(await read('index.html'));

  const all = [...hub.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('http'));
  const hrefs = all.filter((h) => !h.startsWith('#'));
  assert.ok(hrefs.length > 20, 'the hub should link to every tool');

  const hub_ = path.join(outDir, 'index.html');
  for (const href of hrefs) {
    await fs.access(hrefTarget(href, hub_, outDir));
  }

  // The contents index is in-page anchors, which resolve to an element rather
  // than a file. A stale one is silent — the click just does nothing — so it is
  // checked here rather than skipped.
  const ids = new Set([...hub.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const fragments = all.filter((h) => h.startsWith('#'));
  assert.ok(fragments.length > 5, 'the hub should carry a contents index');
  for (const fragment of fragments) {
    assert.ok(ids.has(fragment.slice(1)), `${fragment} points at no element on the hub`);
  }
});

test('relative links inside each tool resolve', async () => {
  const { outDir, surfaces } = await site();
  const broken = [];

  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    for (const file of (await walk(dir)).filter((f) => f.endsWith('.html'))) {
      const html = stripRawText(await fs.readFile(file, 'utf8'));
      const refs = [...html.matchAll(/(?:href|src)="([^"#?]+)"/g)]
        .map((m) => m[1])
        .filter((r) => !/^(https?:|mailto:|data:|\/\/|#)/.test(r) && r !== '');

      for (const ref of refs) {
        try {
          await fs.access(hrefTarget(ref, file, outDir));
        } catch {
          broken.push(`${path.relative(outDir, file)} -> ${ref}`);
        }
      }
    }
  }

  assert.deepEqual(broken, [], `broken relative links:\n${broken.join('\n')}`);
});

// ---------------------------------------------------------------------------
// Hub content
// ---------------------------------------------------------------------------

test('the hub carries the required disclaimers and privacy line', async () => {
  const hub = await read('index.html');
  assert.match(hub, /No warranty/i);
  assert.match(hub, /no SLA/i);
  assert.match(hub, /Everything runs in your browser/i);
  assert.match(hub, /never uploaded/i);
});

/**
 * The hub's copy with the search index stripped out.
 *
 * The index is a bag of words describing what the tools *calculate*, and some
 * of those tools price subscription programs — Subscribe & Save, Shopify
 * subscriptions. Those words are vocabulary a visitor searches for, never
 * anything the hub offers to sell them, so a check on what the page *says*
 * must not read them.
 */
const visibleCopy = (hub) => hub.replace(/ data-search="[^"]*"/g, '');

test('every published page carries both liability clauses, not just the hub', async () => {
  // PRODUCT_PLAYBOOK.md 5b requires the no-warranty clause AND the no-SLA
  // clause on every hosted surface. Until this site existed the second one was
  // arguably moot -- nothing was hosted -- and eighteen pages across nine
  // ventures shipped without any availability statement at all. The moment the
  // owner flips `GITHUB_PAGES_ENABLED` all of them are hosted surfaces, so the
  // clause is checked here, where a new landing page cannot slip past it.
  //
  // Matched loosely on purpose: several ventures word the clause in their own
  // voice ("Hosted URLs, when they exist, carry no availability SLA"), and
  // demanding the playbook's exact prose would force a rewrite of correct
  // pages rather than catch a missing one.
  const { outDir, surfaces } = await site();
  const warranty = /no warranty/i;
  const noSla = /best-effort hosting|no (availability )?sla|carry no availability|taken offline without notice/i;

  const missing = [];
  let checked = 0;
  for (const surface of surfaces) {
    for (const page of await htmlPagesUnder(path.join(outDir, surface.slug))) {
      const markup = await fs.readFile(page, 'utf8');
      const relative = path.relative(outDir, page);
      checked += 1;
      if (!warranty.test(markup)) missing.push(`${relative} (no-warranty)`);
      if (!noSla.test(markup)) missing.push(`${relative} (no-SLA)`);
    }
  }

  // A silently-empty walk would make the assertion above pass for free.
  assert.ok(checked > 100, `only ${checked} page(s) checked`);
  assert.deepEqual(missing, [], `pages missing a required clause:\n${missing.join('\n')}`);
});

async function htmlPagesUnder(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlPagesUnder(full)));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

test('the sponsor ask is optional and does not gate anything', async () => {
  const hub = await read('index.html');
  assert.match(hub, /github\.com\/sponsors\//);
  assert.match(hub, /entirely optional/i);
  assert.ok(
    !/subscribe|upgrade to|paid plan|free trial/i.test(visibleCopy(hub)),
    'no paywall language',
  );
});

test('the hub declares structured data listing every tool', async () => {
  const { surfaces } = await site();
  const hub = await read('index.html');
  const json = JSON.parse(hub.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);

  assert.equal(json['@type'], 'CollectionPage');
  assert.equal(json.mainEntity.numberOfItems, surfaces.length);
  assert.equal(json.mainEntity.itemListElement.length, surfaces.length);
  assert.ok(json.mainEntity.itemListElement.every((item) => item.url.startsWith(BASE)));
});

test('the hub renders the full list without JavaScript', async () => {
  const { surfaces } = await site();
  const hub = await read('index.html');
  for (const surface of surfaces) {
    assert.ok(hub.includes(`href="${surface.slug}/"`), `${surface.slug} missing from the static markup`);
  }
});

test('usage counting is local, opt-out, and honours browser signals', async () => {
  const hub = await read('index.html');
  assert.match(hub, /localStorage/);
  assert.match(hub, /doNotTrack/);
  assert.match(hub, /globalPrivacyControl/);
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(hub), 'nothing about a visit leaves the device');
});

test('the hub makes no off-origin request', async () => {
  const hub = await read('index.html');
  const external = [...hub.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const loaded = offOriginResources(hub);
  assert.deepEqual(loaded, [], `the hub loads off-origin resources: ${loaded.join(', ')}`);
  assert.ok(external.every((url) => url.startsWith('https://')), 'no plaintext http links');
});

test('the off-origin check sees resources fetched by <link>, not just src', () => {
  // The check above passes on an empty result, so it is only worth as much as
  // its ability to fail. This plants each way a page can reach off-origin and
  // asserts every one is caught -- in particular the <link> forms, which an
  // earlier version of this check missed because it matched only `src`. A
  // stylesheet or icon on someone else's host announces the visit of everyone
  // who opens a fee calculator, which is the opposite of what README.md
  // promises about this page.
  const planted = `
    <link rel="stylesheet" href="https://cdn.example.com/reset.css">
    <link rel="icon" href="https://cdn.example.com/favicon.ico">
    <link rel="preconnect" href="https://fonts.example.com">
    <link rel="manifest" href="https://cdn.example.com/app.webmanifest">
    <script src="https://cdn.example.com/analytics.js"></script>
  `;
  assert.deepEqual(offOriginResources(planted).sort(), [
    'https://cdn.example.com/analytics.js',
    'https://cdn.example.com/app.webmanifest',
    'https://cdn.example.com/favicon.ico',
    'https://cdn.example.com/reset.css',
    'https://fonts.example.com',
  ]);

  // A link a visitor clicks is not a resource the page loads, and neither is a
  // same-origin one -- flagging those would make the check noise and get it
  // switched off.
  assert.deepEqual(offOriginResources(`
    <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor</a>
    <link rel="canonical" href="https://duncan-haywood.github.io/monorepo-projects/">
    <link rel="icon" href="favicon.ico">
  `), []);
});

// ---------------------------------------------------------------------------
// Crawlability
// ---------------------------------------------------------------------------

test('robots.txt points at a sitemap that reaches the hub and every venture', async () => {
  const { surfaces } = await site();
  const robots = await read('robots.txt');
  assert.ok(robots.includes(`Sitemap: ${BASE}sitemap.xml`));

  const index = await read('sitemap.xml');
  assert.ok(index.includes('<sitemapindex'));
  assert.ok(index.includes(`${BASE}sitemap-hub.xml`), 'the front page must be crawlable');

  for (const surface of surfaces.filter((s) => s.hasSitemap)) {
    assert.ok(index.includes(`${BASE}${surface.slug}/sitemap.xml`), `${surface.slug} missing from the index`);
  }

  const hubMap = await read('sitemap-hub.xml');
  assert.ok(hubMap.includes(`<loc>${BASE}</loc>`));
});

test('the index points at a sitemap for every published tool', async () => {
  const { surfaces } = await site();
  const index = await read('sitemap.xml');

  assert.ok(index.includes(`${BASE}sitemap-hub.xml`), 'the hub page needs a crawlable home');
  for (const surface of surfaces) {
    assert.ok(
      index.includes(`${BASE}${surface.slug}/sitemap.xml`),
      `${surface.slug} is served but its sitemap is not in the index`,
    );
  }
});

// Organic search is the whole acquisition route for these tools, so the two
// ways a sitemap can quietly fail both get a test over the real artifact.

test('every page the site serves is listed in some sitemap', async () => {
  const listed = await sitemapUrlPaths();
  const { outDir } = await site();

  const orphans = [];
  for (const page of await allPages(outDir)) {
    if (page === '404.html') continue;
    // A page that tells crawlers not to index it is not expected in a sitemap;
    // listing one would be asking for it to be indexed and then refusing.
    if (/<meta name="robots" content="noindex">/.test(await read(page))) continue;
    const candidates = [`/${page}`];
    if (page.endsWith('/index.html')) candidates.push(`/${page.slice(0, -'index.html'.length)}`);
    if (page === 'index.html') candidates.push('/');
    if (!candidates.some((c) => listed.has(pathOf(BASE) + c.slice(1)))) orphans.push(page);
  }

  assert.deepEqual(orphans, [], 'served but invisible to crawlers');
});

test('every sitemap URL resolves to a page that shipped', async () => {
  const { outDir } = await site();
  const dead = [];

  for (const urlPath of await sitemapUrlPaths()) {
    const relative = urlPath.slice(pathOf(BASE).length);
    // A sitemap index lists sitemaps; a urlset lists pages. Both must exist.
    const target = relative === '' ? 'index.html' : relative.endsWith('/') ? `${relative}index.html` : relative;
    if (!(await exists(path.join(outDir, target)))) dead.push(urlPath);
  }

  assert.deepEqual(dead, [], 'a sitemap URL that 404s is worse than no sitemap at all');
});

test('a generated sitemap lists directories, not index.html', () => {
  const xml = renderVentureSitemap('tool', ['index.html', 'compare.html', 'guides/index.html'], BASE);
  assert.ok(xml.includes(`<loc>${BASE}tool/</loc>`));
  assert.ok(xml.includes(`<loc>${BASE}tool/compare.html</loc>`));
  assert.ok(xml.includes(`<loc>${BASE}tool/guides/</loc>`));
  assert.ok(!xml.includes('index.html'), 'index.html is served as its directory');
});

test('pageUrlPath maps a published file to the URL it is served at', () => {
  assert.equal(pageUrlPath('tool', 'index.html'), 'tool/');
  assert.equal(pageUrlPath('tool', 'compare.html'), 'tool/compare.html');
  assert.equal(pageUrlPath('tool', 'nested/index.html'), 'tool/nested/');
});

test('a favicon is emitted, because every page requests one whether or not it links one', async () => {
  const { outDir } = await site();
  const ico = await fs.readFile(path.join(outDir, 'favicon.ico'));

  // ICO header: reserved 0, type 1 (icon), one image.
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0]);
  assert.equal(ico[6], 16, 'width');
  assert.equal(ico[7], 16, 'height');
  // The payload is a PNG, and its signature must survive the offset arithmetic
  // in the directory entry -- get that wrong and browsers show nothing at all
  // while the file still looks fine on disk.
  const offset = ico.readUInt32LE(18);
  assert.deepEqual([...ico.subarray(offset, offset + 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('the favicon is byte-identical on every build', () => {
  assert.deepEqual(renderFavicon(), renderFavicon());
});

// The .ico covers the request browsers make on their own, but it is a fixed
// 16x16 raster and goes soft anywhere it is shown larger — a pinned tab, the
// bookmark bar, a phone home screen.
test('an SVG favicon ships alongside the .ico', async () => {
  const svg = await read('favicon.svg');
  assert.match(svg, /^<svg /, 'a real SVG document');
  assert.match(svg, /viewBox="0 0 16 16"/, 'scalable rather than fixed to one size');
});

test('both favicons draw the same mark', () => {
  // A drift here means the tab icon and the pinned icon are two different
  // logos, which is why the geometry lives in constants both renderers read.
  const svg = renderFaviconSvg();
  assert.match(svg, /#243d35/, "the hub's ink");
  assert.equal((svg.match(/#c5edb5/g) ?? []).length, 3, 'three bars in the mark colour');
  assert.match(svg, /x="3" y="9" width="2" height="4"/, 'the short bar');
  assert.match(svg, /x="11" y="3" width="2" height="10"/, 'the tall bar');
});

test('the hub links both favicons', async () => {
  const hub = await read('index.html');
  assert.match(hub, /rel="icon" href="favicon\.svg" type="image\/svg\+xml"/);
  assert.match(hub, /rel="alternate icon" href="favicon\.ico"/);
});

test('.nojekyll is emitted so Pages serves the tree verbatim', async () => {
  await read('.nojekyll');
});

test('a 404 page routes visitors back to the index', async () => {
  const notFound = await read('404.html');
  assert.ok(notFound.includes(BASE));
});

// ---------------------------------------------------------------------------
// AI discovery (llms.txt)
// ---------------------------------------------------------------------------
//
// Organic search and AI discovery are the whole acquisition route here, and a
// tool missing from llms.txt fails silently in the same way a tool missing from
// the sitemap does: everything still builds, every page still resolves, and the
// assistant recommending a free calculator simply never sees it.

test('llms.txt lists every published tool at its real URL', async () => {
  const { surfaces } = await site();
  const llms = await read('llms.txt');

  for (const surface of surfaces) {
    assert.ok(
      llms.includes(`](${BASE}${surface.slug}/)`),
      `${surface.slug} is served but absent from llms.txt`,
    );
  }
});

test('llms.txt opens with the h1 and blockquote summary the format expects', async () => {
  const lines = (await read('llms.txt')).split('\n');
  assert.match(lines[0], /^# \S/, 'llms.txt must start with a single h1');
  assert.ok(
    lines.slice(0, 5).some((line) => line.startsWith('> ')),
    'llms.txt needs a blockquote summary near the top',
  );
});

test('llms.txt keeps each tool on one line, so no description leaks into prose', async () => {
  const { surfaces } = await site();
  const bullets = (await read('llms.txt')).split('\n').filter((line) => line.startsWith('- ['));

  // Three trailing bullets under "Optional" describe the machine surfaces
  // rather than a tool, so the count is tools plus those.
  assert.equal(bullets.length, surfaces.length + 3);
  for (const bullet of bullets) {
    assert.match(bullet, /^- \[[^\]]+\]\(https?:\/\/[^)]+\): \S/, `malformed bullet: ${bullet}`);
  }
});

// Both machine surfaces exist so an assistant can answer "which of these is a
// gutter tool" without reading 110 sibling descriptions and guessing.
test('the machine surfaces carry the sub-group a trade tool belongs to', async () => {
  const llms = await read('llms.txt');
  const subheads = llms.split('\n').filter((line) => line.startsWith('### '));
  assert.ok(subheads.length > 1, 'the trades section is sub-divided in llms.txt too');
  assert.ok(subheads.some((line) => line.includes('Roofing')));

  const catalog = JSON.parse(await read('catalog.json'));
  const roof = catalog.tools.find((t) => t.slug === 'metal-roof-bid-calculator');
  assert.equal(roof.category, 'Trade & contractor bids');
  assert.equal(roof.subcategory, 'Roofing, siding & gutters');

  // Absent rather than null where a category is not sub-divided, so a consumer
  // filtering on the key never has to special-case an empty value.
  const ebay = catalog.tools.find((t) => t.slug === 'ebay-fee-calculator');
  assert.ok(!('subcategory' in ebay));
});

test('llms.txt carries each tool full self-description, not the trimmed card copy', async () => {
  const { surfaces } = await site();
  const llms = await read('llms.txt');

  // The card copy is truncated with an ellipsis to fit a fixed-height tile.
  // Publishing that here would drop most of what the longer-described tools
  // say about themselves — the half a model matches a query against.
  const trimmed = surfaces.filter((s) => s.description !== s.fullDescription);
  assert.ok(trimmed.length > 0, 'expected at least one tool whose card copy is truncated');
  for (const surface of trimmed) {
    const full = surface.fullDescription.replace(/\s+/g, ' ').trim();
    assert.ok(llms.includes(full), `${surface.slug} is listed with trimmed card copy`);
  }
});

test('the hub links llms.txt so it is reachable, not only well-known', async () => {
  assert.match(await read('index.html'), /href="llms\.txt"/);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test('readMeta prefers og:title over the SEO title', () => {
  const html = `<title>Janitorial Bid Calculator | Commercial Cleaning Price Per Month</title>
    <meta property="og:title" content="Janitorial Bid Calculator">
    <meta name="description" content="Price a contract.">`;
  assert.deepEqual(readMeta(html, 'janitorial-bid-calculator'), {
    title: 'Janitorial Bid Calculator',
    description: 'Price a contract.',
    // Card copy and search copy are the same string only while it fits a card.
    fullDescription: 'Price a contract.',
  });
});

test('readMeta keeps the whole description for search, not just the card', () => {
  const long = `${'word '.repeat(50)}needleword.`;
  const html = `<title>T</title><meta name="description" content="${long}">`;
  const { description, fullDescription } = readMeta(html, 'slug');
  assert.ok(description.endsWith('…'), 'card copy is trimmed');
  assert.ok(!description.includes('needleword'), 'the trim really does drop the tail');
  assert.ok(fullDescription.includes('needleword'), 'search copy keeps the tail');
});

test('readMeta falls back through title, then slug', () => {
  assert.equal(readMeta('<title>Tool | Extra</title>', 'x').title, 'Tool');
  assert.equal(readMeta('<html></html>', 'walk-in-tub-bid-calculator').title, 'Walk In Tub Bid Calculator');
});

test('readMeta decodes entities rather than showing them raw', () => {
  const meta = readMeta('<meta property="og:title" content="Fees &amp; Margin">', 'x');
  assert.equal(meta.title, 'Fees & Margin');
});

// Three shipped surfaces lost most of their description to this: the value was
// captured with `content=["']([^"']*)["']`, which ends at whichever quote comes
// first, so a possessive apostrophe closed a double-quoted attribute early.
// `shopify-a11y-evidence` reached the hub, its own `<meta description>`, and the
// JSON-LD ItemList as the fragment "Turn a Shopify storefront".
test('readMeta keeps an apostrophe inside a double-quoted attribute', () => {
  const html = `<meta name="description" content="Turn a Shopify storefront's axe-core JSON export into a dated record.">`;
  assert.equal(
    readMeta(html, 'shopify-a11y-evidence').description,
    "Turn a Shopify storefront's axe-core JSON export into a dated record.",
  );
});

test('readMeta keeps a quote inside a single-quoted attribute', () => {
  const html = `<meta name='description' content='The "walk-away" number before you bid.'>`;
  assert.equal(readMeta(html, 'x').description, 'The "walk-away" number before you bid.');
});

test('readMeta reads a description containing a bare > character', () => {
  const html = `<meta name="description" content="Compare 4×8 > 5×5 before you buy.">`;
  assert.equal(readMeta(html, 'x').description, 'Compare 4×8 > 5×5 before you buy.');
});

test('readMeta finds the tag whatever order its attributes are written in', () => {
  const html = `<meta content="Price the run and the corners." name="description">`;
  assert.equal(readMeta(html, 'x').description, 'Price the run and the corners.');
});

// The consequence users would have felt: the hub's search box matches against
// `data-search`, which is built from the description. A truncated description
// meant the Shopify tool could not be found by "axe-core".
test('a description survives into the searchable card text', () => {
  const html = `<meta property="og:title" content="Shopify Accessibility Evidence Report">
    <meta name="description" content="Turn a Shopify storefront's axe-core JSON export into a dated record.">`;
  const { title, description } = readMeta(html, 'shopify-a11y-evidence');
  assert.match(`${title} ${description}`.toLowerCase(), /axe-core/);
});

test('readMeta does not confuse one meta tag with the next', () => {
  const html = `<meta property="og:site_name" content="Portfolio">
    <meta name="description" content="The real description.">`;
  assert.equal(readMeta(html, 'x').description, 'The real description.');
});

// The other two affected surfaces, kept as their own case (from the fix that
// landed on main in parallel) so all three shipped regressions are pinned.
test('readMeta keeps an apostrophe in the other affected descriptions', () => {
  const backup = `<meta name="description" content="See whether last night's archive shrank.">`;
  assert.equal(readMeta(backup, 'x').description, "See whether last night's archive shrank.");
});

// og:title and og:description go through the same lookup, so they broke the
// same way — "Ohm's Law Calculator" would have become "Ohm".
test('readMeta keeps an apostrophe in og:title and og:description', () => {
  const html = `<meta property="og:title" content="Ohm's Law Calculator">
    <meta property="og:description" content="Resistor codes and Ohm's law.">`;
  const meta = readMeta(html, 'x');
  assert.equal(meta.title, "Ohm's Law Calculator");
  assert.equal(meta.description, "Resistor codes and Ohm's law.");
});

// A backreferenced `content=(["'])(.*?)\1` — the parallel fix on main — passes
// every case above but returns the empty string here, because `.` does not
// match a newline. Losing the whole description is worse than truncating it.
test('readMeta reads a description wrapped across two lines', () => {
  const html = `<meta name="description"
    content="Price the run,
    the corners, and the extras.">`;
  assert.match(readMeta(html, 'x').description, /the corners, and the extras\./);
});

test('truncate cuts on a word boundary', () => {
  assert.equal(truncate('short', 20), 'short');
  const long = truncate('a'.repeat(30) + ' tail words here that go on', 40);
  assert.ok(long.endsWith('…'));
  assert.ok(long.length <= 41);
});

// The hub's search is the only way a visitor narrows 34 tools, so a tool the
// search cannot find is a tool that does not exist for them. These tests cover
// the two ways that failed silently: indexing card copy that had already been
// cut to 180 characters, and matching the query as one substring so any
// two-word phrase found nothing.

test('searchTokens normalises, dedupes, and drops noise words', () => {
  assert.equal(searchTokens(['eBay Fee']), 'ebay fee');
  assert.equal(searchTokens(['fee', 'FEE', 'Fee']), 'fee');
  // Sorted, so the attribute is stable build to build.
  assert.equal(searchTokens(['zebra alpha']), 'alpha zebra');
  // Stopwords and single characters carry no signal and cost bytes on every card.
  assert.equal(searchTokens(['how much to charge for a deck']), 'charge deck much');
  // "in" is a stopword and "2" is a single character, so both are dropped —
  // and the client-side query normaliser must drop them the same way.
  assert.equal(searchTokens(['walk-in tub, 2 units']), 'tub units walk');
  assert.equal(searchTokens([null, undefined, '']), '');
});

test('searchVariants reaches the singular a plural query would step over', () => {
  // The matcher is a token-prefix test, so "fences" could never reach the
  // indexed "fence" and the query returned nothing at all. These are the
  // literal queries that were dead against the built catalogue.
  assert.ok(searchVariants('fences').includes('fence'));
  assert.ok(searchVariants('pools').includes('pool'));
  assert.ok(searchVariants('chimneys').includes('chimney'));
  assert.ok(searchVariants('driveways').includes('driveway'));

  // Derivational, not just plural: the trade name a searcher types is rarely
  // the noun the tool titled itself with.
  assert.ok(searchVariants('remodeling').includes('remodel'));
  assert.ok(searchVariants('landscaping').includes('landscap'));
  assert.ok(searchVariants('electrician').includes('electric'));
  assert.ok(searchVariants('cleaners').includes('clean'));

  // The word itself always survives, which is what makes the OR in the
  // matcher a widening: no query can lose a result it used to find.
  for (const word of ['fences', 'gas', 'vat', 'ebay']) {
    assert.equal(searchVariants(word)[0], word);
  }

  // Below the four-character floor nothing is stripped, so a short word is
  // never blurred into a prefix that matches half the catalogue.
  assert.deepEqual(searchVariants('gas'), ['gas']);
  assert.deepEqual(searchVariants('trees'), ['trees', 'tree']);
  assert.deepEqual(searchVariants('deck'), ['deck']);
});

test('aliases give a tool the words its own copy never uses', () => {
  // Each of these was a query that found nothing while the tool existed.
  assert.match(aliasesFor('pressure-washing-bid-calculator'), /power washing/);
  assert.match(aliasesFor('window-cleaning-bid-calculator'), /washing/);
  assert.match(aliasesFor('snow-removal-bid-calculator'), /plowing/);
  assert.match(aliasesFor('junk-removal-bid-calculator'), /hauling/);
  assert.match(aliasesFor('pest-control-bid-calculator'), /termite/);
  assert.match(aliasesFor('mini-split-bid-calculator'), /air conditioning/);

  // A room-level search reaches every tool that does part of that room, since
  // no single tool carries both words and the matcher ANDs across them.
  for (const slug of ['countertop-bid-calculator', 'cabinet-refinishing-bid-calculator']) {
    assert.match(aliasesFor(slug), /kitchen remodel/);
  }

  // Keyed by slug so an alias cannot wander onto an unrelated tool: the
  // well-pump calculator talks about pressure and must not become a
  // power-washing result.
  assert.equal(aliasesFor('well-pump-bid-calculator'), '');
  assert.equal(aliasesFor('ebay-fee-calculator'), '');
});

test('every alias names a venture that exists', async () => {
  // A typo'd or renamed slug makes an alias silently dead -- the query keeps
  // returning nothing and nothing turns red.
  const slugs = (await site()).surfaces.map((s) => s.slug);
  for (const { slug } of SEARCH_ALIASES) {
    assert.ok(
      slugs.some((published) => published.includes(slug)),
      `alias "${slug}" matches no published venture`,
    );
  }
});

test('the hub ships one stemmer, not a second copy that can drift', async () => {
  const html = await read('index.html');
  // The browser gets searchVariants by source injection. If that ever becomes
  // a hand-written duplicate, this catches it: the shipped text must be the
  // function the tests above actually exercised.
  assert.ok(
    html.includes(searchVariants.toString()),
    'hub page does not carry the exact searchVariants source that build.mjs exports',
  );
});

test('the search index carries description text the card is too small to show', async () => {
  const html = await read('index.html');
  const surfaces = (await site()).surfaces;

  const truncated = surfaces.filter(
    (s) => s.fullDescription && s.fullDescription.length > s.description.replace(/…$/, '').length + 1,
  );
  // If this is ever zero the test is no longer proving anything.
  assert.ok(truncated.length > 0, 'expected at least one description longer than its card');

  for (const surface of truncated) {
    const shown = surface.description.replace(/…$/, '');
    const tail = surface.fullDescription.slice(shown.length);
    const word = searchTokens([tail]).split(' ').filter((w) => w.length > 4)[0];
    if (!word) continue;
    const index = html.match(
      new RegExp(`data-search="([^"]*)"[^>]*>\\s*<a href="${surface.slug}/`),
    )?.[1];
    assert.ok(index, `no card rendered for ${surface.slug}`);
    assert.ok(
      ` ${index} `.includes(` ${word} `),
      `"${word}" is in ${surface.slug}'s description but not in its search index`,
    );
  }
});

test("the search index carries a venture's other page titles", async () => {
  // A visitor arrives having typed the question one of these pages answers.
  const titles = await collectPageTitles(
    path.join(VENTURES, 'ebay-fee-calculator'),
    path.join(VENTURES, 'ebay-fee-calculator', 'index.html'),
  );
  assert.ok(titles.length > 0, 'expected the eBay venture to have article pages');

  const surface = (await site()).surfaces.find((s) => s.slug === 'ebay-fee-calculator');
  const indexed = new Set(surface.searchIndex.split(' '));
  const fromTitles = searchTokens(titles).split(' ').filter((w) => w.length > 4);
  const missing = fromTitles.filter((w) => !indexed.has(w));
  assert.deepEqual(missing, [], 'page-title words missing from the search index');
});

test('a query whose words are not adjacent still matches', async () => {
  const html = await read('index.html');
  const cards = [...html.matchAll(/data-search="([^"]*)"[\s\S]*?data-tool="([^"]*)"/g)].map(
    (m) => ({ index: m[1], slug: m[2] }),
  );
  assert.equal(cards.length, (await site()).surfaces.length);

  // The rule the page implements: every query word must hit a token boundary.
  const search = (query) =>
    cards
      .filter((c) =>
        searchTokens([query])
          .split(' ')
          .filter(Boolean)
          .every((word) => ` ${c.index}`.includes(` ${word}`)),
      )
      .map((c) => c.slug);

  // Each of these found nothing when the index was one truncated string.
  assert.ok(search('ebay return').includes('ebay-fee-calculator'));
  assert.ok(search('freight accessorial').includes('freight-accessorial-auditor'));
  assert.deepEqual(search('qqzzxx'), []);
});

test('the query drops exactly the words the index dropped', async () => {
  // If the two normalisers disagree, a query containing a word the index never
  // stores can never match anything.
  const html = await read('index.html');
  const rendered = JSON.parse(html.match(/const STOPWORDS = new Set\((\[[\s\S]*?\])\)/)[1]);
  for (const word of rendered) {
    assert.equal(searchTokens([word]), '', `"${word}" is a query stopword but is still indexed`);
  }
  assert.ok(html.includes('word.length >= 2'), 'query must drop single characters as the index does');
});

test('every published page links the favicon, not just the site root', async () => {
  // The generated icon sits at the *published tree's* root. On a project site
  // the browser's automatic /favicon.ico request goes to the origin root
  // instead — a different place this repo does not serve — so without a link
  // written into each page the icon is emitted and never fetched.
  const { outDir, surfaces } = await site();

  const pages = (await listFiles(outDir)).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > surfaces.length, 'expected article pages as well as landing pages');

  const missing = [];
  const unresolved = [];
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    const href = html.match(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/i)?.[1];
    if (!href) {
      missing.push(path.relative(outDir, file));
      continue;
    }
    // A venture that ships its own icon keeps it; several declare a `data:`
    // URI, which is self-contained and has no file to resolve.
    if (/^(data:|https?:)/.test(href)) continue;
    // Relative, not root-absolute: `check.mjs` rejects a link that leaves the
    // site root, and the site is served under a path prefix in production.
    assert.ok(!href.startsWith('/'), `${path.relative(outDir, file)} links the icon absolutely`);
    if (!(await exists(hrefTarget(href, file, outDir)))) {
      unresolved.push(`${path.relative(outDir, file)} -> ${href}`);
    }
  }

  assert.deepEqual(missing, [], 'pages served without an icon');
  assert.deepEqual(unresolved, [], `icon links that do not resolve:\n${unresolved.join('\n')}`);
});

test('a venture that declares its own icon keeps it', () => {
  const own = '<head><link rel="icon" href="mine.png"></head>';
  assert.equal(injectFavicon(own, '../'), own);

  const injected = injectFavicon('<head>\n<title>t</title></head>', '../');
  assert.equal((injected.match(/rel="icon"/g) ?? []).length, 1);
  assert.ok(injected.includes('href="../favicon.ico"'));

  // Depth is the caller's to supply; a page at the root gets './'.
  assert.ok(injectFavicon('<head></head>', './').includes('href="./favicon.ico"'));

  // The charset declaration has to stay the first thing in the head.
  const withCharset = injectFavicon('<head><meta charset="utf-8"><title>t</title></head>', '../');
  assert.ok(
    withCharset.indexOf('charset') < withCharset.indexOf('rel="icon"'),
    'the icon must not displace the charset declaration',
  );

  // A fragment with no <head> must be left exactly as it was, not corrupted.
  assert.equal(injectFavicon('<p>no head here</p>', '../'), '<p>no head here</p>');
});

test('categories route each slug shape somewhere sensible', () => {
  assert.equal(categoryFor('ebay-fee-calculator').id, 'marketplace');
  assert.equal(categoryFor('walk-in-tub-bid-calculator').id, 'trades');
  assert.equal(categoryFor('janitorial-bid-calculator').id, 'trades');
  assert.equal(categoryFor('freight-accessorial-auditor').id, 'logistics');
  assert.equal(categoryFor('einvoice-preflight').id, 'evidence');
  assert.equal(categoryFor('something-brand-new').id, 'more');
});

// These four sat in "More free tools" — the section a visitor reads last, if at
// all — while the category they belong to was one scroll above them. A seller
// looking for the TikTok Shop fee tool had no reason to keep scrolling past the
// marketplace section that did not contain it.
test('tools that belong to a named category are not left in the catch-all', () => {
  assert.equal(categoryFor('tiktok-shop-fee-calculator').id, 'marketplace');
  assert.equal(categoryFor('delivery-app-margin-calculator').id, 'marketplace');
  assert.equal(categoryFor('ltl-freight-class-estimator').id, 'logistics');
  assert.equal(categoryFor('owner-operator-cpm-calculator').id, 'logistics');
  assert.equal(categoryFor('cash-runway-planner').id, 'backoffice');
  // The tool that computes the burden and overhead rates every bid calculator
  // asks for belongs beside them, not in "More free tools" where the readers who
  // meet those two fields would never see it.
  assert.equal(categoryFor('shop-rate-calculator').id, 'trades');
  assert.equal(subcategoryFor('shop-rate-calculator').id, 'trades-paid');
});

test('sub-groups only apply where a category is large enough to need them', () => {
  assert.equal(subcategoryFor('ebay-fee-calculator'), null, 'marketplace reads as one list');
  assert.equal(subcategoryFor('cut-list-optimizer'), null, 'logistics reads as one list');
  assert.equal(subcategoryFor('metal-roof-bid-calculator').id, 'trades-roof');
  assert.equal(subcategoryFor('quote-margin-check').id, 'trades-paid');
});

// Narrow rules have to precede broad ones. `window-cleaning-bid-calculator` is
// sold by a window cleaner, not a window installer; if the "Windows, doors &
// garage" rule ran first it would file the cleaner's tool under replacements.
test('a narrower sub-group rule wins over the broad one it overlaps', () => {
  assert.equal(subcategoryFor('window-cleaning-bid-calculator').id, 'trades-cleaning');
  assert.equal(subcategoryFor('window-replacement-bid-calculator').id, 'trades-openings');
  assert.equal(subcategoryFor('gutter-cleaning-bid-calculator').id, 'trades-cleaning');
  assert.equal(subcategoryFor('gutter-install-bid-calculator').id, 'trades-roof');
});

// The catch-all sub-group is a safety net for a slug no keyword claims, not a
// place tools are meant to accumulate. If a new bid calculator lands here, the
// fix is a keyword — this test is how anyone finds out it is needed.
test('every published trade tool lands in a named sub-group', async () => {
  const { surfaces } = await site();
  const homeless = surfaces
    .filter((s) => categoryFor(s.slug).id === 'trades')
    .filter((s) => subcategoryFor(s.slug).id === 'trades-other')
    .map((s) => s.slug);
  assert.deepEqual(homeless, [], 'add a keyword to SUBCATEGORY_RULES.trades for these');
});

test('grouping by sub-group keeps every tool and drops empty groups', () => {
  const trades = [
    { slug: 'metal-roof-bid-calculator' },
    { slug: 'siding-bid-calculator' },
    { slug: 'quote-margin-check' },
  ];
  const groups = groupBySubcategory('trades', trades);
  assert.deepEqual(
    groups.map((g) => g.subcategory.id),
    ['trades-paid', 'trades-roof'],
    'only the sub-groups with tools in them, in rule order',
  );
  assert.equal(groups.flatMap((g) => g.items).length, trades.length);

  const flat = groupBySubcategory('marketplace', [{ slug: 'ebay-fee-calculator' }]);
  assert.deepEqual(flat, [{ subcategory: null, items: [{ slug: 'ebay-fee-calculator' }] }]);
});

test('every discovered tool lands in exactly one rendered group', async () => {
  const { surfaces } = await site();
  const hub = renderHub(surfaces, BASE);
  for (const surface of surfaces) {
    const occurrences = hub.split(`href="${surface.slug}/"`).length - 1;
    assert.equal(occurrences, 1, `${surface.slug} appears ${occurrences} times`);
  }
});

// The hub is 43 screens tall on a phone, and the trades section alone spans 28
// of them. Without an index the only route to a later section is scrolling past
// all of it, and the only alternative is knowing what the tool is called.
test('the contents index reaches every section and sub-group', async () => {
  const { surfaces } = await site();
  const hub = renderHub(surfaces, BASE);
  const nav = hub.split('<nav class="contents"')[1].split('</nav>')[0];

  for (const { category, items } of groupByCategory(surfaces)) {
    assert.ok(nav.includes(`href="#${category.id}"`), `no contents link for ${category.id}`);
    for (const { subcategory } of groupBySubcategory(category.id, items)) {
      if (!subcategory) continue;
      assert.ok(nav.includes(`href="#${subcategory.id}"`), `no contents link for ${subcategory.id}`);
    }
  }

  // Anchors, not a script hook: the index has to work before the script runs
  // and for a visitor who blocks it.
  assert.ok(!nav.includes('onclick'), 'the index is plain anchors');
});

test('the hub sub-divides the trades section and leaves small ones flat', async () => {
  const { surfaces } = await site();
  const hub = renderHub(surfaces, BASE);

  const trades = hub.split('data-group="trades"')[1].split('</section>\n      </section>')[0];
  const rendered = [...trades.matchAll(/data-subgroup="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(rendered.length > 1, 'the 100+ trade tools are broken into families');
  assert.ok(rendered.includes('trades-roof'));

  const marketplace = hub.split('data-group="marketplace"')[1].split('</section>')[0];
  assert.ok(
    !marketplace.includes('data-subgroup'),
    'a section that fits on a screen gets no sub-headings',
  );
});

// The sub-group heading is an h3, so a card beneath it has to be an h4 or the
// outline claims the card is a sibling of the heading above it. Heading order is
// how a screen-reader user browses a directory this long.
test('card headings sit one level below the section that holds them', async () => {
  const { surfaces } = await site();
  const hub = renderHub(surfaces, BASE);

  const levels = [...hub.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
  const skip = levels.slice(1).find((level, i) => level > levels[i] + 1);
  assert.equal(skip, undefined, 'no heading level is skipped anywhere on the hub');

  const roof = hub.split('data-subgroup="trades-roof"')[1].split('</section>')[0];
  assert.ok(roof.includes('<h4>'), 'a card under a sub-group heading is an h4');
  const marketplace = hub.split('data-group="marketplace"')[1].split('</section>')[0];
  assert.ok(marketplace.includes('<h3>'), 'a card in a flat category stays an h3');
});

// A category of 110 makes "same category" almost meaningless as a signal: the
// rotation would offer a roofer whichever four tools it landed on.
test('related tools prefer the sub-group before the wider category', () => {
  const surfaces = [
    { slug: 'metal-roof-bid-calculator', title: 'A' },
    { slug: 'furnace-bid-calculator', title: 'B' },
    { slug: 'siding-bid-calculator', title: 'C' },
    { slug: 'ebay-fee-calculator', title: 'D' },
  ];
  const related = relatedTools(surfaces, 'metal-roof-bid-calculator', 3);
  assert.deepEqual(
    related.map((s) => s.slug),
    ['siding-bid-calculator', 'furnace-bid-calculator', 'ebay-fee-calculator'],
    'a roofing sibling first, then the rest of the trades, then off-category',
  );
});

test('isPublishable keeps web assets and drops the rest', () => {
  assert.ok(isPublishable('calc.mjs'));
  assert.ok(isPublishable('index.html'));
  assert.ok(isPublishable('LICENSE'));
  assert.ok(!isPublishable('calc.test.mjs'));

  // The spellings two ventures actually used, which the original rule missed.
  assert.ok(!isPublishable('test.mjs'), 'retainage-cashflow-calculator names its suite this');
  assert.ok(!isPublishable('test_app.mjs'), 'freelance-retainer-calculator names its suite this');
  assert.ok(!isPublishable('calc_test.mjs'));
  assert.ok(!isPublishable('test_calc.py'));

  // ...without swallowing product code that merely contains the word.
  assert.ok(isPublishable('latest.mjs'), 'a substring match would drop this');
  assert.ok(isPublishable('protest.js'));
  assert.ok(isPublishable('testimonials.html'));

  assert.ok(!isPublishable('checks.py'));
  assert.ok(!isPublishable('pyproject.toml'));
  assert.ok(!isPublishable('VENTURE.yaml'));
});

test('renderRobots allows crawling', () => {
  assert.match(renderRobots(BASE), /User-agent: \*\nAllow: \//);
});

test('links that escape the site are repointed at the repository, not left broken', async () => {
  const { repairs } = await site();
  assert.ok(repairs.length > 0, 'the portfolio does contain such links today');

  // The concrete case: a tool published from a nested directory links to the
  // venture README that sits one level above its own published root.
  const academy = await read('ai-engineering-academy', 'index.html');
  assert.ok(
    academy.includes(`${SOURCE_URL_PREFIX}ventures/ai-engineering-academy/README.md`),
    'the README link should resolve on GitHub instead of 404ing',
  );
  assert.ok(!academy.includes('href="../README.md"'));
});

test('repair leaves working in-site links untouched', async () => {
  const ebay = await read('ebay-fee-calculator', 'index.html');
  assert.ok(ebay.includes('href="calc.mjs"') || ebay.includes('src="calc.mjs"') || ebay.includes('./calc.mjs'),
    'the tool still loads its own module by relative path');
  assert.ok(!ebay.includes(`${SOURCE_URL_PREFIX}ventures/ebay-fee-calculator/calc.mjs`),
    'a module that is published must not be repointed off-site');
});

test('JSON-LD cannot break out of its script element', () => {
  const hub = renderHub(
    [{ slug: 'x', title: 'Bad</script><img src=x>', description: 'd', pageCount: 1, hasSitemap: false }],
    BASE,
  );
  const block = hub.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
  assert.ok(!block.includes('</script>'));
  assert.equal(JSON.parse(block).mainEntity.itemListElement[0].name, 'Bad</script><img src=x>');
});

test('hub markup escapes venture copy', () => {
  const hub = renderHub(
    [{ slug: 'x', title: '<script>alert(1)</script>', description: 'a & b', pageCount: 1, hasSitemap: false }],
    BASE,
  );
  assert.ok(!hub.includes('<script>alert(1)</script>'));
  assert.ok(hub.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// Site chrome
//
// Before this, the hub linked down into 33 tools and nothing linked back or
// across: a visitor arriving from a search result at a deep SEO page saw one
// calculator and had no route to the other 32. These tests fail the build if a
// page ships without that route, or if the route points somewhere that 404s.
// ---------------------------------------------------------------------------

test('every published venture page routes back to the hub', async () => {
  const { outDir, surfaces } = await site();
  const pages = (await listFiles(outDir))
    .filter((f) => f.endsWith('.html'))
    .filter((f) => path.dirname(f) !== outDir); // the hub and 404 are the destination

  assert.ok(pages.length > surfaces.length, 'deep SEO pages are included, not just landing pages');

  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    assert.ok(
      html.includes('data-pf-to="hub"'),
      `${path.relative(outDir, file)} ships with no way back to the hub`,
    );
  }
});

test('every injected link resolves to a page that exists', async () => {
  const { outDir } = await site();
  const pages = (await listFiles(outDir)).filter((f) => f.endsWith('.html'));

  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    for (const [, ref] of html.matchAll(/href="([^"]+)"[^>]*data-pf-to=/g)) {
      const resolved = path.resolve(path.dirname(file), ref);
      const target = ref.endsWith('/') ? path.join(resolved, 'index.html') : resolved;
      assert.ok(
        await fs.stat(target).then(() => true, () => false),
        `${path.relative(outDir, file)} points at ${ref}, which is not published`,
      );
    }
  }
});

test('a page nested deeper climbs further to reach the root', () => {
  assert.equal(upToRoot('index.html'), './');
  assert.equal(upToRoot(path.join('etsy-profit-calculator', 'index.html')), '../');
  assert.equal(upToRoot(path.join('a', 'b', 'index.html')), '../../');
});

test('the deepest published page still reaches the hub', async () => {
  const { outDir } = await site();
  const deepest = (await listFiles(outDir))
    .filter((f) => f.endsWith('.html'))
    .sort((a, b) => b.split(path.sep).length - a.split(path.sep).length)[0];

  assert.ok(path.relative(outDir, deepest).split(path.sep).length > 2, 'the site does nest');
  const html = await fs.readFile(deepest, 'utf8');
  const ref = html.match(/href="([^"]+)"[^>]*data-pf-to="hub"/)[1];
  assert.equal(path.resolve(path.dirname(deepest), ref), outDir);
});

test('wrapping a page twice does not stack two navigation bars', () => {
  const page = '<html><head></head><body><h1>Tool</h1></body></html>';
  const once = injectChrome(page, { slug: 'x', toRoot: '../', total: 2, related: [] });
  const twice = injectChrome(once, { slug: 'x', toRoot: '../', total: 2, related: [] });
  assert.equal(twice, once);
  assert.equal(once.match(/<nav class="pf-chrome pf-chrome-top"/g).length, 1);
  assert.equal(once.match(/<aside class="pf-chrome pf-chrome-foot"/g).length, 1);
});

test('a fragment with no body is left alone rather than corrupted', () => {
  const fragment = '<div>partial</div>';
  assert.equal(injectChrome(fragment, { slug: 'x', toRoot: '../', total: 2, related: [] }), fragment);
});

// ---------------------------------------------------------------------------
// Discovery tags
// ---------------------------------------------------------------------------

const CANONICAL = `${BASE}flat-roof-bid-calculator/`;

test('a venture canonical pointing at index.html is repaired to the served URL', () => {
  // The exact markup fifteen tools shipped: legal, self-resolving, and naming a
  // second URL for the page the whole site links to as `/<slug>/`.
  const page =
    '<html><head><link rel="canonical" href="./index.html"></head><body>x</body></html>';
  const out = injectDiscoveryTags(page, { canonical: CANONICAL, baseUrl: BASE });

  const found = [...out.matchAll(/<link[^>]+rel="canonical"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(found, [CANONICAL], 'exactly one canonical, and it is the served URL');
});

test('an already-correct canonical is left as it stands', () => {
  const page = `<html><head><link rel="canonical" href="${CANONICAL}"></head><body>x</body></html>`;
  const out = injectDiscoveryTags(page, { canonical: CANONICAL, baseUrl: BASE });
  assert.equal(out.match(/rel="canonical"/g).length, 1);
  assert.ok(out.includes(`<link rel="canonical" href="${CANONICAL}">`));
});

test('share-card tags are added, and og:url matches the canonical', () => {
  const page = '<html><head><title>Flat Roof</title></head><body>x</body></html>';
  const out = injectDiscoveryTags(page, {
    canonical: CANONICAL,
    baseUrl: BASE,
    title: 'Flat Roof Bid Calculator',
    description: 'Bid the membrane, not the coupon.',
  });

  assert.ok(out.includes(`<meta property="og:url" content="${CANONICAL}">`));
  assert.ok(out.includes(`<meta property="og:image" content="${BASE}${SOCIAL_CARD_FILE}">`));
  assert.ok(out.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(out.includes(`<meta property="og:site_name" content="${SITE_NAME}">`));
  assert.ok(out.includes('<meta property="og:title" content="Flat Roof Bid Calculator">'));
  assert.ok(out.includes('<meta property="og:description" content="Bid the membrane, not the coupon.">'));
});

test("a venture's own card copy wins over anything derived here", () => {
  const page =
    '<html><head><meta property="og:title" content="Its own words">' +
    '<meta property="og:description" content="Its own pitch"></head><body>x</body></html>';
  const out = injectDiscoveryTags(page, {
    canonical: CANONICAL,
    baseUrl: BASE,
    title: 'Derived title',
    description: 'Derived pitch',
  });

  assert.equal(out.match(/og:title/g).length, 1);
  assert.ok(out.includes('content="Its own words"'));
  assert.ok(!out.includes('Derived title'));
  assert.ok(!out.includes('Derived pitch'));
});

test('the pass is safe to run twice', () => {
  const page = '<html><head><title>T</title></head><body>x</body></html>';
  const once = injectDiscoveryTags(page, { canonical: CANONICAL, baseUrl: BASE, title: 'T' });
  const twice = injectDiscoveryTags(once, { canonical: CANONICAL, baseUrl: BASE, title: 'T' });
  assert.equal(twice, once);
});

test('a fragment with no head is left alone rather than corrupted', () => {
  const fragment = '<div>partial</div>';
  assert.equal(injectDiscoveryTags(fragment, { canonical: CANONICAL, baseUrl: BASE }), fragment);
});

test('the share card is a PNG at the size a wide card is cropped to', () => {
  const png = renderSocialCard();
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR width and height, big-endian, at the fixed offset after the signature.
  assert.equal(png.readUInt32BE(16), SOCIAL_CARD_WIDTH);
  assert.equal(png.readUInt32BE(20), SOCIAL_CARD_HEIGHT);
  // Under 600x315 Facebook drops the image entirely.
  assert.ok(SOCIAL_CARD_WIDTH >= 600 && SOCIAL_CARD_HEIGHT >= 315);
});

test('every published page names a canonical that resolves to its own URL', async () => {
  const { outDir } = await site();
  const pages = (await listFiles(outDir))
    .filter((file) => file.endsWith('.html'))
    .map((file) => path.relative(outDir, file).split(path.sep).join('/'));

  const wrong = [];
  for (const relative of pages) {
    const html = await fs.readFile(path.join(outDir, relative), 'utf8');
    const canonical = /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i.exec(html);
    // 404 and offline are noindex; they are meant to carry none.
    if (!canonical) {
      assert.match(html, /<meta name="robots" content="noindex">/, `${relative}: no canonical and not noindex`);
      continue;
    }
    const pageUrl = new URL(relative.replace(/(^|\/)index\.html$/, '$1'), BASE).href;
    if (new URL(canonical[1], pageUrl).href !== pageUrl) wrong.push(`${relative} -> ${canonical[1]}`);
  }
  assert.deepEqual(wrong, [], 'pages whose canonical names a URL they are not served at');
});

test('every indexable page carries the tags a shared link previews from', async () => {
  const { outDir } = await site();
  const pages = (await listFiles(outDir))
    .filter((file) => file.endsWith('.html'))
    .map((file) => path.relative(outDir, file).split(path.sep).join('/'));

  const bare = [];
  for (const relative of pages) {
    const html = await fs.readFile(path.join(outDir, relative), 'utf8');
    if (/<meta name="robots" content="noindex">/.test(html)) continue;
    for (const tag of ['og:url', 'og:image', 'og:title', 'og:description', 'twitter:card']) {
      if (!html.includes(`"${tag}"`)) bare.push(`${relative}: ${tag}`);
    }
  }
  assert.deepEqual(bare, [], 'pages that would preview without a card');
});

test('the share card the pages name is actually published', async () => {
  const { outDir } = await site();
  const card = await fs.readFile(path.join(outDir, SOCIAL_CARD_FILE));
  assert.ok(card.length > 0);
  const hub = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.ok(hub.includes(`<meta property="og:image" content="${BASE}${SOCIAL_CARD_FILE}">`));
});

test('the 404 body is noindex, so mistyped paths do not index as duplicates', async () => {
  const { outDir } = await site();
  const html = await fs.readFile(path.join(outDir, '404.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('related tools exclude the page they sit on and prefer its category', () => {
  const surfaces = [
    { slug: 'amazon-fba-calculator', title: 'A' },
    { slug: 'ebay-fee-calculator', title: 'B' },
    { slug: 'etsy-profit-calculator', title: 'C' },
    { slug: 'toilet-replacement-bid-calculator', title: 'D' },
  ];
  const related = relatedTools(surfaces, 'amazon-fba-calculator', 2);
  assert.ok(!related.some((s) => s.slug === 'amazon-fba-calculator'));
  assert.deepEqual(
    related.map((s) => categoryFor(s.slug).id),
    ['marketplace', 'marketplace'],
    'a marketplace tool offers marketplace siblings before a trade calculator',
  );
});

test('related tools fall back across categories when a category is thin', () => {
  const surfaces = [
    { slug: 'cut-list-optimizer', title: 'A' },
    { slug: 'ebay-fee-calculator', title: 'B' },
  ];
  const related = relatedTools(surfaces, 'cut-list-optimizer', 4);
  assert.deepEqual(related.map((s) => s.slug), ['ebay-fee-calculator']);
});

test('a lone tool advertises no siblings and still renders', () => {
  const html = injectChrome('<html><head></head><body>x</body></html>', {
    slug: 'only', toRoot: '../', total: 1, related: relatedTools([{ slug: 'only', title: 'Only' }], 'only'),
  });
  assert.ok(!html.includes('<ul>'), 'no empty list is emitted');
  assert.ok(html.includes('data-pf-to="hub"'));
});

// The clause is injected rather than required of each venture because the
// requirement can otherwise only be discovered after the venture is on `main`.
// Three ventures shipped without it in one day; these two tests are what stop
// a fourth from turning `main` red.

test('a page with no availability clause is given one', () => {
  const html = injectChrome('<html><head></head><body>calculator</body></html>', {
    slug: 'x',
    toRoot: '../',
    total: 2,
    related: [],
  });
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, NO_SLA_PATTERN);
});

test('a page that writes its own availability clause is not given a second', () => {
  // The wording a venture uses is its own; two notices are worse than one.
  const own = '<p>Hosted URLs, when they exist, carry no availability SLA.</p>';
  const html = injectChrome(`<html><head></head><body>${own}</body></html>`, {
    slug: 'x',
    toRoot: '../',
    total: 2,
    related: [],
  });
  assert.ok(!html.includes('pf-sla'), 'the venture already says it');
  assert.ok(html.includes(own), 'and its own wording survives');
});

test('the chrome escapes venture copy', () => {
  const html = injectChrome('<html><head></head><body>x</body></html>', {
    slug: 'x',
    toRoot: '../',
    total: 2,
    related: [{ slug: 'y"><script>alert(1)</script>', title: '<script>alert(1)</script>' }],
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('the chrome counts locally, honours opt-out, and asks for nothing off-origin', async () => {
  const page = await read('etsy-profit-calculator', 'index.html');
  // From the injected element, not the style block that names the same class:
  // the venture's own footer sits above it and carries its own GitHub links.
  const chrome = page.slice(page.indexOf('<aside class="pf-chrome pf-chrome-foot"'));

  assert.ok(chrome.includes("localStorage.getItem('portfolio-hub-optout')"), 'the hub opt-out applies here too');
  assert.ok(chrome.includes('doNotTrack') && chrome.includes('globalPrivacyControl'));
  assert.ok(chrome.includes('tool_viewed:etsy-profit-calculator'));
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(chrome), 'nothing is transmitted');

  const offOrigin = [...chrome.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offOrigin, ['https://github.com/sponsors/Duncan-Haywood'], 'only the sponsor link leaves');
});

test('the sponsor line on a tool page is optional and gates nothing', async () => {
  const page = await read('etsy-profit-calculator', 'index.html');
  assert.match(page, /Sponsoring on GitHub<\/a>\s*\n?\s*is optional and changes nothing/);
});

test('the hub itself is not wrapped in its own navigation', async () => {
  assert.ok(!(await read('index.html')).includes('pf-chrome'));
  assert.ok(!(await read('404.html')).includes('pf-chrome'));
});

test('no venture ships its package manifest to visitors', async () => {
  const { outDir } = await site();
  const leaked = [];
  for (const file of await fs.readdir(outDir, { recursive: true })) {
    if (path.basename(file) === 'package.json') leaked.push(file);
  }
  assert.deepEqual(leaked, [],
    'package.json exposes internal script names and dependency versions for no visitor benefit');
});

test('publishable JSON that a page actually needs is still copied', () => {
  // The exclusion is by filename, not by extension: a web manifest or a
  // JSON-LD payload beside a page must keep shipping.
  assert.equal(isPublishable('package.json'), false);
  assert.equal(isPublishable('site.webmanifest'), true);
  assert.equal(isPublishable('rates.json'), true);
});

// ---------------------------------------------------------------------------
// "Pick up where you left off"
//
// The hub leads a returning visitor with the tools their own browser has
// opened. The behaviour itself is exercised in a browser (see the PR); these
// pin the parts a Node test can hold: that it degrades to nothing without
// script or storage, and that it never trusts what it reads back.
// ---------------------------------------------------------------------------

test('the personalised row is absent until script fills it', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<section class="yours" id="yours" hidden>/,
    'a visitor with script off, no history, or no storage must not see an empty panel');
  assert.match(hub, /<ul id="yoursList"><\/ul>/, 'the list ships empty — the catalogue is the fallback');
});

test('the personalised row is built from local counts and says so', async () => {
  const hub = await read('index.html');
  assert.match(hub, /never uploaded/i);
  assert.match(hub, /clearing your browser data clears it/i);
  // The copy a visitor reads, not the script comments that explain it.
  const visible = hub.slice(0, hub.indexOf('<script type="module">'));
  assert.ok(!/sign in|log in|create an account|your profile/i.test(visible), 'no account is involved');
});

test('a stored slug is validated before it reaches a selector or a link', async () => {
  const hub = await read('index.html');
  // Every tool shares one origin, so any page on the site can write this key.
  assert.match(hub, /\/\^\[a-z0-9\]\[a-z0-9-\]\*\$\//,
    'the slug shape check must survive; without it a stored value reaches querySelector and href');
  assert.ok(!/innerHTML\s*=/.test(hub.slice(hub.indexOf('function yourTools'))),
    'stored values are written as text, never as markup');
});

// ---------------------------------------------------------------------------
// "Your saved bids"
//
// The cross-tool index. Bids are stored and restored per tool; this answers the
// question that was left over — which tool priced the job the customer is
// ringing about. Same shape of test as the row above: a Node test can hold the
// degradation and the hardening, and the browser pass covers the behaviour.
// ---------------------------------------------------------------------------

test('the saved-bid index is absent until script fills it', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<section class="bids" id="bids" hidden>/,
    'a visitor with script off, no storage, or no saved bids must not see an empty panel');
  assert.match(hub, /<ul id="bidsList"><\/ul>/, 'the list ships empty');
});

test('the backup panel ships on the hub, outside the section that hides when empty', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<section class="support backup" id="backup-box" hidden>/,
    'drawn by script only — a file picker that cannot work without script should not appear');
  // It must sit *after* `#bids` closes: nested inside, the restore control
  // would be hidden on exactly the browser it exists for — the new phone with
  // no saved bids at all.
  const bidsEnd = hub.indexOf('</section>', hub.indexOf('id="bids"'));
  assert.ok(hub.indexOf('id="backup-box"') > bidsEnd, 'the backup panel is a sibling, not a child');
});

test('the saved-bid index links to the band anchor, never to a bid name', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'));
  assert.match(script, /link\.href = slug \+ '\/#pf-jobs'/,
    "the link is built from the validated slug and the band's own anchor");
  // A bid name is a customer's name or address. A fragment lands in browser
  // history and in anything the visitor shares, so it must never carry one.
  assert.ok(!/href[^\n]*name/.test(script), 'a bid name must never reach the URL');
});

test('a stored bid is written as text and its slug validated before it is used', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'));
  assert.match(script, /textContent = name/, 'a visitor-typed name is never markup');
  assert.ok(!/innerHTML\s*=/.test(script), 'stored values are written as text, never as markup');
  assert.match(script, /\/\^\[a-z0-9\]\[a-z0-9-\]\*\$\/\.test\(slug\)/,
    'any page on this origin can write the key; the slug shape check must survive');
});

test('the saved-bid index survives a storage key holding anything at all', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'));
  // A throw here would take the hub's script down with it, and the catalogue
  // below is the whole page.
  assert.match(script, /catch \{ return \[\]; \}/);
  assert.match(script, /Array\.isArray\(list\)/);
});

test('the visitor\'s own saved bids are shown even when counting is off', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'), hub.indexOf('function showSavedBids'));
  // Unlike yourTools(), which is derived from counts and is genuinely empty
  // under an opt-out, these are the visitor's own documents — the tool pages
  // show them to someone who opted out and the hub hiding them would read as
  // data loss. Only the counting is gated, by record() itself.
  assert.ok(!/optedOut\(\)/.test(script),
    'saved bids are the visitor\'s data, not a count, so the opt-out must not empty the list');
});

test('the saved-bid list never cuts silently', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  // The section promises "bids you saved in any tool". A list that quietly
  // stopped at eight would state something the page contradicts, and a
  // contractor looking for a job from three weeks ago would read it as the
  // tool having forgotten it.
  assert.match(script, /Showing the ' \+ recent \+ ' most recent of ' \+ rows\.length/);
  assert.match(script, /'Show all ' \+ rows\.length/);
  // "the N most recent" counts only the newest tier, never the quiet rows
  // surfaced past it — a row older than the tenth being on screen would make
  // "showing the 10 most recent" false, which is the one thing this section
  // must never be. The quiet ones are named in their own clause instead.
  assert.match(script, /const recent = Math\.min\(rows\.length, BIDS_SHOWN\)/);
  assert.match(script, /const surfaced = drawn\.length - recent/);
  assert.match(script, /' that ' \+ \(surfaced === 1 \? 'has' : 'have'\) \+ ' gone quiet\. '/);
  // The cut is what hid them: a quiet bid is an old bid by definition, so it
  // always fell below a plain newest-first slice.
  assert.match(script, /rows\.filter\(\(row, i\) => i < BIDS_SHOWN \|\| isQuietBid\(row, seen, now\)\)/);
  assert.match(script, /const hidden = rows\.length - drawn\.length/);
  assert.match(hub, /<p class="bid-more" id="bidsMore" hidden><\/p>/);
  // Counted before the cut is applied, so the number offered is a number of
  // rows the visitor could actually open.
  assert.match(script, /if \(card\) \{\s*rows\.push\(/);
});

test('following a saved bid counts the act, never the customer', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  assert.match(script, /record\('saved_bid_followed'\)/);
  assert.match(script, /record\('saved_bid_index_shown'\)/);
  // record() is silent under DNT/GPC and the opt-out; what matters here is that
  // neither event carries the name or the slug.
  assert.ok(!/record\('saved_bid_followed:' ?\+/.test(script), 'the event names nothing');
});

test('no injected script carries a template literal across a line break', async () => {
  // The guard on stripForInjection, which the chrome, shop-rates and saved-bids
  // scripts all pass through: it removes leading whitespace, so a template
  // literal spanning two lines would silently lose the indentation *inside the
  // string* and change text a visitor reads. The ventures' own modules do span
  // lines that way — which is exactly why the strip is applied to the injected
  // strings only and never to venture code.
  //
  // An odd count of unescaped backticks on a line means a literal opened or
  // closed on it and continues onto the next.
  for (const file of ['index.html', ['fence-bid-calculator', 'index.html']]) {
    const html = await read(...[].concat(file));
    const injected = [...html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      // The venture's own module is the one script on the page the build did
      // not write; it is identified by the marker only injected scripts carry.
      .filter((body) => /pf-jobs|pf-rates|pf-chrome|portfolio-hub-usage/.test(body));
    assert.ok(injected.length > 0, `no injected script found in ${file}`);
    for (const body of injected) {
      for (const [n, line] of body.split('\n').entries()) {
        const ticks = (line.match(/(?<!\\)`/g) || []).length;
        assert.equal(ticks % 2, 0,
          `injected script line ${n} leaves a template literal open: ${line.trim().slice(0, 80)}`);
      }
    }
  }
});

test('the injected scripts ship without their prose', async () => {
  // ~19 KB of unminified source sat on each of 234 pages and again in the
  // opt-in offline bundle, which has a fixed 16 MB budget. Stripping the
  // comment lines and the indentation is worth ~976 KB across the bundle.
  const band = await read('pf-jobs.js');
  assert.ok(band.includes('var SLUG'), 'the shared saved-bids script was not written');
  const commentLines = band.split('\n').filter((line) => line.trim().startsWith('//'));
  assert.deepEqual(commentLines, [], 'a whole-line comment survived into the shipped script');
  const indented = band.split('\n').filter((line) => /^\s+\S/.test(line));
  assert.deepEqual(indented, [], 'leading indentation survived into the shipped script');
});

test('the hub says how many quotes are still out, and how old the oldest is', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-summary" id="bidsSummary" hidden><\/p>/,
    'the line ships empty and hidden — a visitor with no saved bids sees nothing');
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  assert.match(script, /followUpSentence\(rows, now\)/,
    'counted over every row, not the eight drawn, or the number contradicts the "Show all" button');
  assert.match(script, /summary\.hidden = sentence === ''/);
});

test('the hub reads the chase window across every tool at once', async () => {
  // The window needs three answered bids. A contractor working six calculators
  // reaches three in none of them and clears it easily across all of them, so
  // the hub is where this reading usually exists at all — and it is sound to
  // pool because a reply time is a fact about their customers, not about a
  // trade. The price band is the opposite case and stays per-tool: a gutter bid
  // and a deck bid do not belong in one dollar comparison.
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-chase" id="bidsChase" hidden><\/p>/,
    'the line ships empty and hidden — below the sample threshold there is nothing to say');
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  assert.match(script, /chaseSentence\(rows, now\)/, 'read over every row, like the summary above it');
  assert.match(script, /chase\.hidden = chasing === ''/);
  assert.ok(!/priceBandSentence/.test(hub),
    'the price band compares dollars and must not be pooled across trades');
});

test('the hub marks which quotes have gone quiet, not just how many', async () => {
  // chaseSentence has always been able to say "2 still waiting have been out
  // longer than that" and never which two, leaving the contractor to check
  // every row's age against a number in the paragraph above it.
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  assert.match(script, /const quiet = isQuietBid\(row, seen, now\)/);
  assert.match(script, /state\.dataset\.state = outcome \|\| \(quiet \? 'quiet' : 'waiting'\)/);
  assert.match(script, /chaseTag\.textContent = 'Chase'/);
  // The tag sits before the date, which bid-when's auto margin pushes right, so
  // it reads as qualifying the state beside it rather than ending the row.
  assert.match(script, /link\.append\(label, figure, where, state, \.\.\.tag, when\)/);
  // Not a colour alone: the palette flips between light and dark and a visitor
  // may not separate the two hues at all, so the row carries the word.
  assert.match(hub, /\.bids \.bid-chase-tag \{/);
});

test('the hub carries the timestamp the chase window is computed from', async () => {
  // The regression this feature was: the hub injected chaseSentence on every
  // visit and could never run it, because savedBids() built rows without
  // decidedAt — the one field bidResponseDays reads. Nothing failed; the code
  // shipped, was tested, and returned '' forever.
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'), hub.indexOf('function showSavedBids'));
  assert.match(script, /rows\.push\(\{ slug, name, at, amount, outcome, decidedAt, lostTo, cost \}\)/);
  // Only on a decided bid, which is the only state it means anything in.
  assert.match(script, /outcome && typeof bid\.decidedAt === 'string'/);
});

test('the hub carries the winning price its pricing reading is computed from', async () => {
  // Exactly the regression above, one field along: pricingSentence reads
  // lostTo, so a savedBids() that dropped it would inject the reading on every
  // visit and return '' forever. Same failure, same silence, same test.
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'), hub.indexOf('function showSavedBids'));
  // Through the guard the band wrote it with, never trusted as stored: any page
  // on this origin can write this key.
  assert.match(script, /const lostTo = outcome === 'lost' \? normalizeLostTo\(bid\.lostTo\) \|\| undefined : undefined/);
  // And the guard has to actually be in scope on the hub, which is the half
  // that BID_PRICING_HELPERS exists to deliver.
  assert.ok(hub.includes('var normalizeLostTo = function normalizeLostTo('),
    'normalizeLostTo is not embedded in the hub');
  assert.ok(hub.includes('var pricingSentence = function pricingSentence('),
    'pricingSentence is not embedded in the hub');
});

test('the hub draws the pooled pricing reading, and counts it once per change', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-pricing" id="bidsPricing" hidden><\/p>/);
  // One rule for all four standing readings, so the pricing line and the three
  // beneath it cannot drift apart visually.
  assert.match(hub,
    /\.bids \.bid-pricing,\s*\.bids \.bid-win-rate,\s*\.bids \.bid-trend,\s*\.bids \.bid-keep \{/);
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  // Read off every row, not the eight drawn — otherwise the reading would
  // change when the visitor pressed "Show all".
  assert.match(script, /const priced = pricingSentence\(rows\)/);
  assert.match(script, /pricing\.hidden = priced === ''/);
  // Counted on change, as the chase line is, so a re-render is not a second
  // reading. No name, no slug, no figure.
  assert.match(script, /record\('saved_bid_pricing_shown'\)/);
});

test('the hub draws the win rate, and counts it once per change', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-win-rate" id="bidsWinRate" hidden><\/p>/);
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  // Off every row, for the reason the two readings above it are: a win rate
  // that moved when the visitor pressed "Show all" would not be a win rate.
  assert.match(script, /const rated = winRateSentence\(rows\)/);
  assert.match(script, /winRate\.hidden = rated === ''/);
  // The tool's own heading, read off the card the row was matched to. Without
  // it the sentence would name "deck-bid-calculator" at a contractor.
  assert.match(script, /label: card\.querySelector\('h3, h4'\)\?\.textContent\.trim\(\) \|\| row\.slug/);
  // Counted on change, and the event names no tool: which trade someone bids
  // is not something this site needs to know to tell whether the reading is
  // worth its bytes.
  assert.match(script, /record\('saved_bid_win_rate_shown'\)/);
  assert.ok(!/record\('saved_bid_win_rate_shown:' ?\+/.test(script), 'the event names nothing');
  // The body the hub runs is the tested one, embedded rather than rewritten.
  assert.ok(hub.includes('var winRateSentence = function winRateSentence('),
    'winRateSentence is not embedded in the hub');
});

test('the hub carries the job cost its keep reading is computed from', async () => {
  // The third instance of the regression the two tests above pin, and the
  // reason this one is worth its own test: `savedBids()` is a hand copy of
  // `normalizeBid`, so `cost` — added to jobs.mjs when the won-row cost box
  // shipped — was never transcribed here. Any hub reading that divides a cost
  // into a price would have been injected on every visit and returned ''
  // forever, with nothing failing anywhere.
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'), hub.indexOf('function showSavedBids'));
  // Through the guard the band wrote it with, and only on a won row — the
  // state a delivered job can exist in.
  assert.match(script, /const cost = outcome === 'won' \? normalizeJobCost\(bid\.cost\) \|\| undefined : undefined/);
  // And that guard has to be in scope on the hub, which is the half
  // BID_PRICING_HELPERS delivers.
  assert.ok(hub.includes('var normalizeJobCost = function normalizeJobCost('),
    'normalizeJobCost is not embedded in the hub');
});

test('the hub draws which trade keeps most, and counts it once per change', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-keep" id="bidsKeep" hidden><\/p>/);
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  // Off every row, for the reason every reading above it is: a share that
  // moved when the visitor pressed "Show all" would be a different claim about
  // their business each time they looked.
  assert.match(script, /const keeping = keepSentence\(rows\)/);
  assert.match(script, /keep\.hidden = keeping === ''/);
  // Counted on change, and the event names no trade: which work a contractor
  // makes money on is not something this site needs to know to tell whether
  // the reading is worth its bytes.
  assert.match(script, /record\('saved_bid_keep_shown'\)/);
  assert.ok(!/record\('saved_bid_keep_shown:' ?\+/.test(script), 'the event names nothing');
  // The body the hub runs is the tested one, embedded rather than rewritten.
  assert.ok(hub.includes('var keepSentence = function keepSentence('),
    'keepSentence is not embedded in the hub');
});

test('the hub draws whether a trade has been landing differently, on every row', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-trend" id="bidsTrend" hidden><\/p>/);
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  // Off every row, and here that rule is load-bearing rather than merely
  // consistent: this reading splits a tool's bids into an older and a newer
  // half, and the eight rows the page draws are the newest — so computing it
  // from them would compare the recent half against itself and report that
  // nothing has changed, on every book, forever.
  assert.match(script, /const trending = trendSentence\(rows, now\)/);
  assert.match(script, /trend\.hidden = trending === ''/);
  // Counted on change, and the event names no trade and no direction.
  assert.match(script, /record\('saved_bid_trend_shown'\)/);
  assert.ok(!/record\('saved_bid_trend_shown:' ?\+/.test(script), 'the event names nothing');
  // The body the hub runs is the tested one, embedded rather than rewritten —
  // and it needs bidWaitingDays, which arrives with the follow-up helpers the
  // hub emits above these. A reading whose date clause silently threw would
  // take the whole saved-bid section down with it.
  assert.ok(hub.includes('var trendSentence = function trendSentence('),
    'trendSentence is not embedded in the hub');
  assert.ok(hub.indexOf('var bidWaitingDays = function bidWaitingDays(') <
    hub.indexOf('var trendSentence = function trendSentence('),
    'trendSentence is emitted before the helper it calls');
});

test('the hub ships the percentage half of the pricing code and not the money half', async () => {
  // BID_PRICING_HELPERS is deliberately not BID_PRICE_BAND_HELPERS. The money
  // readings stay on the tool pages, and shipping them to the one page every
  // visitor loads would be a kilobyte in the offline bundle for nothing.
  const hub = await read('index.html');
  for (const name of ['priceBandSentence', 'undercutSentence', 'bidPriceSide', 'formatBidAmount']) {
    assert.ok(!hub.includes(`var ${name} = function ${name}(`),
      `${name} is money-only and should not be on the hub`);
  }
});

test('the hub and the calculator band share one definition of a waiting bid', async () => {
  // These bodies are embedded from jobs.mjs by toString rather than re-written
  // here, because the hub script and the band script are assembled separately:
  // two hand-written copies would drift, and the drift would be invisible —
  // the hub saying a bid is nine days old and the tool saying ten.
  const hub = await read('index.html');
  // The band's half now lives in the one shared file every tool page loads,
  // rather than inline in each of them.
  const band = await read('pf-jobs.js');
  for (const name of ['bidWaitingDays', 'bidWaitingPhrase', 'followUpSentence']) {
    assert.ok(hub.includes(`var ${name} = function ${name}(`), `${name} is not embedded in the hub`);
    assert.ok(band.includes(`var ${name} = function ${name}(`), `${name} is not in the shared script`);
  }
});

test('an outcome the hub does not recognise leaves the bid in the chase list', async () => {
  // Hiding a live quote behind a state this page cannot clear is worse than
  // showing it in the wrong column: the bid would never be chased again.
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'));
  assert.match(script, /bid\.outcome === 'won' \|\| bid\.outcome === 'lost' \? bid\.outcome : null/);
});

test('every saved-bid row says which of the three states it is in', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  assert.match(script, /state\.dataset\.state = outcome \|\| \(quiet \? 'quiet' : 'waiting'\)/,
    'a row with no badge would look untracked rather than open');
  assert.match(script, /bidWaitingPhrase\(bidWaitingDays\(at, now\)\) \|\| 'Waiting'/);
});

test('opting out is wired to remove the personalised row, not just stop counting', async () => {
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function yourTools'));
  assert.match(script, /optout\.addEventListener\('change', showYourTools\)/);
  assert.match(script, /if \(optedOut\(\) \|\| honorsBrowserSignal\(\)\) return \[\]/,
    'DNT/GPC and the opt-out must both suppress it');
});

// ---------------------------------------------------------------------------
// Offline support
//
// The failure mode here is quieter than a broken page: the site looks fine on a
// connection and simply does nothing when the visitor loses one — which is
// exactly the moment this audience needs it. So these assert the shipped
// artefacts, not the helpers that wrote them.
// ---------------------------------------------------------------------------

test('the site ships a service worker, a manifest, and an offline page', async () => {
  const { outDir } = await site();
  for (const file of ['sw.js', 'manifest.webmanifest', 'offline.html']) {
    await fs.access(path.join(outDir, file));
  }
});

test('every published page registers the worker and points at the manifest', async () => {
  const { outDir } = await site();
  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > 100, 'the site is more than a handful of pages');

  const missing = [];
  for (const page of pages) {
    const html = await fs.readFile(page, 'utf8');
    if (!/serviceWorker/.test(html) || !/rel="manifest"/.test(html)) {
      missing.push(path.relative(outDir, page));
    }
  }
  assert.deepEqual(missing, [], `these pages cannot work offline: ${missing.slice(0, 5).join(', ')}`);
});

test('the worker and manifest resolve from a page at any depth', async () => {
  const { outDir } = await site();
  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html'));

  const broken = [];
  for (const page of pages) {
    const html = await fs.readFile(page, 'utf8');
    const refs = [
      html.match(/register\('([^']+)'\)/)?.[1],
      html.match(/rel="manifest" href="([^"]+)"/)?.[1],
      html.match(/rel="apple-touch-icon" href="([^"]+)"/)?.[1],
    ].filter(Boolean);
    for (const ref of refs) {
      const target = path.resolve(path.dirname(page), ref);
      try {
        await fs.access(target);
      } catch {
        broken.push(`${path.relative(outDir, page)} -> ${ref}`);
      }
    }
  }
  assert.deepEqual(broken, [], `unreachable offline assets: ${broken.slice(0, 5).join(', ')}`);
});

test('registration is feature-detected, so a browser without it is unaffected', async () => {
  const hub = await read('index.html');
  assert.match(hub, /'serviceWorker' in navigator/);
  assert.match(hub, /\.catch\(\(\) => \{\}\)/, 'a rejected registration must not throw into the page');
});

test('the cache name carries the build, so a deploy cannot serve a stale mix', async () => {
  const { offline } = await site();
  const sw = await read('sw.js');
  assert.match(offline.cacheName, /^portfolio-[0-9a-f]{12}$/);
  assert.ok(sw.includes(JSON.stringify(offline.cacheName)));
  // Old caches must be dropped on activation, or cache-first would keep
  // answering from the previous deploy forever.
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /key !== CACHE/);
});

test('an identical build produces an identical cache name', async () => {
  const first = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-sw-a-'));
  const second = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-sw-b-'));
  const a = await buildSite({ outDir: first, baseUrl: BASE });
  const b = await buildSite({ outDir: second, baseUrl: BASE });
  assert.equal(a.offline.cacheName, b.offline.cacheName, 'the hash must not depend on build order or paths');
});

test('the worker only ever touches same-origin GETs', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  // Caching the worker itself is how a site gets permanently stuck on an old one.
  assert.match(sw, /sw\.js'\)\) return/);
});

test('a navigation that fails with nothing cached lands on the offline page', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /caches\.match\(OFFLINE_PAGE\)/);
  const offlinePage = await read('offline.html');
  assert.match(offlinePage, /offline/i);
  assert.ok(offlinePage.includes(BASE), 'it routes back to the hub');
});

test('the save-for-offline bundle covers every tool and only real files', async () => {
  const { outDir, surfaces, offline } = await site();
  for (const surface of surfaces) {
    assert.ok(
      offline.bundle.includes(`${surface.slug}/index.html`),
      `${surface.slug} would not be saved for offline use`,
    );
    assert.ok(offline.bundle.includes(`${surface.slug}/`), 'both link forms are cached');
  }

  const missing = [];
  for (const asset of offline.bundle) {
    if (asset.endsWith('/')) continue; // directory form of a page already asserted
    try {
      await fs.access(path.join(outDir, asset));
    } catch {
      missing.push(asset);
    }
  }
  assert.deepEqual(missing, [], `the worker would fetch files that are not on the site: ${missing.join(', ')}`);
});

test('the offline bundle stays small enough to fetch on mobile data', async () => {
  const { outDir, offline } = await site();
  let bytes = 0;
  for (const asset of offline.bundle) {
    if (asset.endsWith('/')) continue;
    bytes += (await fs.stat(path.join(outDir, asset))).size;
  }
  // The catalog is now 150+ static tools. 8 MB was set when ~30 products
  // shipped; the offline worker still has to cache every calculator a
  // contractor might open on a jobsite. 16 MB is one fetch on mobile data.
  assert.ok(bytes < 16 * 1024 * 1024, `offline bundle is ${(bytes / 1e6).toFixed(1)} MB`);
});

test('the manifest is installable: real icons, standalone, scoped to the site', async () => {
  const { outDir } = await site();
  const manifest = JSON.parse(await read('manifest.webmanifest'));

  assert.equal(manifest.start_url, BASE);
  assert.equal(manifest.scope, BASE);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 2);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'Android crops icons without one');

  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith(BASE), 'an icon must not be fetched off-origin');
    const file = path.join(outDir, icon.src.slice(BASE.length));
    const bytes = await fs.readFile(file);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'real PNG');
    const [size] = icon.sizes.split('x').map(Number);
    assert.equal(bytes.readUInt32BE(16), size, `${icon.src} is not ${icon.sizes}`);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test('the offline offer is honest and gates nothing', async () => {
  const hub = await read('index.html');
  assert.match(hub, /Save all tools for offline/);
  assert.match(hub, /Nothing is uploaded either way/);
  // Still no request about a visit leaving the device: the worker fetches
  // pages, and pages only.
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(hub));
});

test('the offline widget is hidden unless the browser can honour it', async () => {
  const hub = await read('index.html');
  assert.match(hub, /id="offline-box" hidden/);
  assert.match(hub, /box\.hidden = false/);
});

test('the worker can be withdrawn from devices that already have it', async () => {
  // A service worker outlives the deploy that installed it, so reverting a
  // commit is not on its own a way to take one back. This is the lever that is.
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-killswitch-'));
  await buildSite({ outDir, baseUrl: BASE, disableWorker: true });
  const sw = await fs.readFile(path.join(outDir, 'sw.js'), 'utf8');

  assert.match(sw, /registration\.unregister\(\)/);
  assert.match(sw, /caches\.delete/);
  assert.ok(!/BUNDLE/.test(sw), 'the withdrawn worker caches nothing');
});

test('taking the offline offer is counted the same private way as everything else', async () => {
  const hub = await read('index.html');
  assert.match(hub, /record\('offline_offer_shown'\)/);
  assert.match(hub, /record\(data\.failed \? 'offline_saved_partial' : 'offline_saved'\)/);
  // record() is the function that honours the opt-out and DNT/GPC; counting
  // must not route around it.
  assert.ok(!/localStorage\.setItem\(KEY/.test(hub.split("record('offline_offer_shown')")[1] || ''));
});

test('changing the worker itself changes the cache name', async () => {
  // Otherwise a fix to the worker's own logic ships under the old cache name,
  // no old cache is deleted, and every existing visitor keeps being served the
  // previous behaviour from cache indefinitely.
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-version-'));
  const built = await buildSite({ outDir, baseUrl: BASE });
  const rebuilt = await addOfflineSupport({
    outDir,
    base: BASE,
    surfaces: built.surfaces,
    codeVersion: 'pretend the worker was edited',
  });
  assert.notEqual(rebuilt.cacheName, built.offline.cacheName);
});

// ---------------------------------------------------------------------------
// A stale real origin, as opposed to the placeholder
//
// Three ventures wrote today's Pages address into their canonical tags as a
// literal rather than using `example.invalid`. That is invisible while the
// site is served from exactly that URL, and wrong the moment `PAGES_BASE_URL`
// points somewhere else — which is the whole reason that variable exists.
//
// Sitemaps are immune (they are regenerated from what published); canonicals
// are copied through, so they are not.
// ---------------------------------------------------------------------------

test('no canonical tag names an origin other than the one the site was built with', async () => {
  // The suite builds at https://example.test/site/, deliberately not the
  // default — so a hardcoded production origin shows up here and nowhere else.
  const { outDir } = await site();
  const offenders = [];

  for (const file of (await walk(outDir)).filter((f) => f.endsWith('.html'))) {
    const html = await fs.readFile(file, 'utf8');
    const canonical = /<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]+)"/i.exec(html);
    if (canonical && /^https?:/i.test(canonical[1]) && !canonical[1].startsWith(BASE)) {
      offenders.push(`${path.relative(outDir, file)} -> ${canonical[1]}`);
    }
  }

  assert.deepEqual(offenders, [],
    `these canonicals ignore the base URL the site was built with:\n${offenders.join('\n')}`);
});

// ---------------------------------------------------------------------------
// Shared-origin head tags, and chrome that follows the page it wraps
// ---------------------------------------------------------------------------

const everyToolPage = async () => {
  const { outDir, surfaces } = await site();
  const out = [];
  for (const surface of surfaces) {
    for (const f of await htmlPagesUnder(path.join(outDir, surface.slug))) {
      out.push({ rel: path.relative(outDir, f), html: await fs.readFile(f, 'utf8') });
    }
  }
  return out;
};

test('every published page declares exactly one canonical URL', async () => {
  const missing = [];
  const duplicated = [];
  for (const { rel, html } of await everyToolPage()) {
    const n = (html.match(/rel=["']canonical["']/gi) ?? []).length;
    if (n === 0) missing.push(rel);
    // Two canonicals are worse than none: the crawler then picks one at random.
    if (n > 1) duplicated.push(`${rel} (${n})`);
  }
  assert.deepEqual(missing, [], 'a page with no canonical competes with its own /index.html twin');
  assert.deepEqual(duplicated, [], 'these pages carry more than one canonical');
});

test('an injected canonical is the directory URL on the real origin', async () => {
  const entry = await read('ebay-fee-calculator', 'index.html');
  assert.equal(entry.match(/<link rel="canonical" href="([^"]*)"/)[1], `${BASE}ebay-fee-calculator/`);
});

test('each tool entry page carries breadcrumb structured data', async () => {
  const { surfaces } = await site();
  for (const surface of surfaces) {
    const html = await read(surface.slug, 'index.html');
    const crumb = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b['@type'] === 'BreadcrumbList');
    assert.ok(crumb, `${surface.slug} has no BreadcrumbList`);
    assert.equal(crumb.itemListElement[0].item, BASE, 'the first crumb is the hub');
    assert.equal(crumb.itemListElement.at(-1).item, `${BASE}${surface.slug}/`);
    assert.equal(crumb.itemListElement.at(-1).name, surface.title);
  }
});

test('breadcrumbs go on entry pages only', async () => {
  // A deep SEO page inside a tool is not a third level of the site; claiming it
  // is would describe a hierarchy that does not exist.
  const deep = (await everyToolPage()).filter(({ rel }) => !/^[^/\\]+[/\\]index\.html$/.test(rel));
  assert.ok(deep.length > 100, `fixture assumption: many sub-pages, saw ${deep.length}`);
  for (const { rel, html } of deep) {
    assert.ok(!html.includes('"BreadcrumbList"'), `${rel} should not claim to be a breadcrumb level`);
  }
});

test('chrome takes its theme from the host page, not the operating system', async () => {
  // Regression. The chrome used to paint an opaque band from its own palette
  // behind `prefers-color-scheme`. Within the band that is perfectly legible —
  // the problem is what it sits on. Most ventures here are deliberately
  // light-only, so a visitor whose OS was dark got a near-black slab bolted to
  // the bottom of a cream page. Measured with a headless browser at the time:
  // the fixed version holds 13.7:1 or better on every tool in both OS schemes,
  // and a tool with its own dark mode still flips (17.4:1 light, 15.1:1 dark).
  const html = await read('etsy-profit-calculator', 'index.html');
  const style = html.match(/<style id="pf-chrome-style">([\s\S]*?)<\/style>/)[1];

  assert.ok(!/prefers-color-scheme/.test(style),
    'the chrome must not branch on the OS theme — the host page decides');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(style),
    `the chrome must not hard-code a colour: ${style.match(/#[0-9a-f]{3,8}\b/i)?.[0]}`);
  assert.match(style, /color:inherit/, 'text colour comes from the page');
  assert.match(style, /--pf-line:rgba\(128,128,128/, 'lines are neutral on either background');
});

test('nothing this build injects reaches a printed customer proposal', async () => {
  // The nine calculators that produce a customer proposal print a sheet whose
  // whole premise is that the homeowner sees the price and not the cost
  // structure behind it. That sheet's own stylesheet hides `header, main,
  // footer` — an allow-list written against the venture's markup, which cannot
  // know about the `<nav>`, `<aside>` and shop-rates `<section>` this build
  // injects as siblings of `<main>`.
  //
  // `.pf-rates` is the one that matters: it renders the contractor's saved crew
  // wage, payroll burden, overhead and target net margin. A contractor who had
  // saved their rates and left the panel open would have handed the customer
  // their margin stapled to the quote.
  const html = await read('deck-bid-calculator', 'index.html');
  assert.ok(html.includes('id="proposalDoc"'),
    'deck-bid-calculator no longer carries a proposal; point this test at one that does');

  const chromeStyle = html.match(/<style id="pf-chrome-style">([\s\S]*?)<\/style>/)[1];
  assert.match(chromeStyle, /@media print\{\.pf-chrome\{display:none !important\}\}/,
    'the site navigation would print on the customer’s proposal');

  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const ratesStyle = styles.find((style) => style.includes('.pf-rates-list'));
  assert.ok(ratesStyle, 'the shop-rates band is no longer injected; this test needs rewriting');
  assert.match(ratesStyle, /@media print\{\.pf-rates\{display:none !important\}\}/,
    'the contractor’s wage, burden, overhead and margin would print on the customer’s proposal');
});

test('injected head tags do not disturb the page they land in', async () => {
  const html = await read('ebay-fee-calculator', 'index.html');
  assert.equal((html.match(/<\/head>/gi) ?? []).length, 1);
  assert.equal((html.match(/<body[^>]*>/gi) ?? []).length, 1);
  assert.ok(html.includes('calc.mjs'), 'the calculator still loads its own module');
});

test('the availability clause is supplied only where a venture lacks its own', async () => {
  const { surfaces } = await site();
  // A venture that words the clause itself must not be given a second one in
  // different prose — two availability statements on one page is how a reader
  // stops believing either.
  const own = await read('janitorial-bid-calculator', 'index.html');
  const supplied = (own.match(/Best-effort hosting/gi) ?? []).length;
  assert.ok(supplied <= 1, `${supplied} availability clauses on one page`);

  // And the build's own copy says what the playbook requires it to say.
  const injected = await read(surfaces[0].slug, 'index.html');
  assert.match(injected, /no warranty|Best-effort hosting/i);
});

// ---------------------------------------------------------------------------
// Number inputs
// ---------------------------------------------------------------------------

test('step decides whether a decimal keypad is offered', () => {
  // Whole-number fields (niches, doors, fixture counts) must not offer a
  // decimal key, because the input would then reject what the key produced.
  for (const step of ['1', '5', '10', '25', '100']) {
    assert.equal(stepAllowsDecimals(step), false, `step="${step}"`);
  }
  for (const step of ['0.001', '0.01', '0.05', '0.1', '0.25', '0.5']) {
    assert.equal(stepAllowsDecimals(step), true, `step="${step}"`);
  }
  // No constraint declared means the browser imposes none, so decimals are
  // the safe reading rather than the risky one.
  for (const step of [undefined, null, '', 'any', 'ANY', 'nonsense']) {
    assert.equal(stepAllowsDecimals(step), true, `step=${String(step)}`);
  }
});

test('number inputs get the keypad their step implies', () => {
  const html = annotateNumberInputs(
    '<input type="number" min="0" step="1" value="4">' +
      '<input type="number" min="0" step="0.25" value="4">' +
      '<input type="number" value="4">',
  );
  assert.match(html, /step="1" value="4" inputmode="numeric"/);
  assert.match(html, /step="0.25" value="4" inputmode="decimal"/);
  assert.match(html, /<input type="number" value="4" inputmode="decimal">/);
});

test('inputs that are not numbers are left alone', () => {
  const html =
    '<input type="text" name="a"><input type="checkbox" checked><input type="radio"><textarea></textarea>';
  assert.equal(annotateNumberInputs(html), html);
});

test("a venture's own inputmode wins, and the pass is idempotent", () => {
  const own = '<input type="number" step="1" inputmode="decimal">';
  assert.equal(annotateNumberInputs(own), own, 'an explicit choice is not overridden');

  const once = annotateNumberInputs('<input type="number" step="0.5">');
  assert.equal(annotateNumberInputs(once), once, 'running twice adds nothing');
  assert.equal((once.match(/inputmode/g) ?? []).length, 1);
});

test('a self-closing tag stays well-formed', () => {
  assert.equal(
    annotateNumberInputs('<input type="number" step="1" />'),
    '<input type="number" step="1" inputmode="numeric" />',
  );
});

test('every number input on the built site carries an inputmode', async () => {
  // The reason this is asserted over the whole site rather than one fixture:
  // the pass runs at build time precisely so a calculator landing tomorrow is
  // covered without anyone editing it, and only a full walk can show that.
  const { outDir, surfaces } = await site();

  let inputs = 0;
  const missing = [];
  for (const surface of surfaces) {
    for (const page of await htmlPagesUnder(path.join(outDir, surface.slug))) {
      const markup = await fs.readFile(page, 'utf8');
      for (const tag of markup.match(/<input\b[^>]*>/gi) ?? []) {
        if (!/\btype\s*=\s*["']?number\b/i.test(tag)) continue;
        inputs += 1;
        if (!/\binputmode\s*=/i.test(tag)) missing.push(`${path.relative(outDir, page)}: ${tag}`);
      }
    }
  }

  // A silently-empty walk would make the assertion below pass for free.
  assert.ok(inputs > 1000, `only ${inputs} number input(s) found`);
  assert.deepEqual(missing, [], `number inputs with no keypad:\n${missing.slice(0, 10).join('\n')}`);
});

// ---------------------------------------------------------------------------
// Machine-readable catalog
//
// The flat thing an AI assistant answering "is there a free tool for X" can
// fetch in one request, instead of parsing the hub. Carried over from #1740
// after `main` independently landed that branch's Pages race fix; the catalog
// was the part of it `main` did not already have.
// ---------------------------------------------------------------------------

test('catalog.json describes every published tool', async () => {
  const { surfaces } = await site();
  const catalog = JSON.parse(await read('catalog.json'));
  assert.equal(catalog.tools.length, surfaces.length);
  for (const tool of catalog.tools) {
    assert.ok(tool.slug && tool.name && tool.description, `incomplete entry: ${tool.slug}`);
    assert.ok(tool.url.startsWith(BASE), `${tool.slug} url is not on the site origin`);
    assert.ok(tool.category, `${tool.slug} has no category`);
  }
});

test('catalog.json states the product is free and browser-only', async () => {
  const catalog = JSON.parse(await read('catalog.json'));
  assert.equal(catalog.price.amount, '0');
  assert.equal(catalog.privacy, 'client-side-only');
  assert.equal(catalog.url, BASE);
});

test('catalog.json does not pre-answer the open funding decision', async () => {
  // Whether the repo carries a sponsorship surface is queued for the owner
  // (funding-sponsors-live); a machine-readable file must not decide it.
  const catalog = JSON.parse(await read('catalog.json'));
  assert.ok(!('sponsor' in catalog), 'catalog.json must not carry a funding field');
});

test('the hub links to the machine-readable catalog', async () => {
  const hub = await read('index.html');
  assert.ok(hub.includes('catalog.json'), 'catalog.json should be discoverable from the hub');
});

test('the saved-bids script is one file the whole site loads, not 234 copies', async () => {
  // It was inlined into every page that carries the band, and the arithmetic on
  // that had become indefensible: ~14 KB written out 234 times was 3.26 MiB of
  // the built site and 2.06 MiB of the 16 MiB offline bundle — the same bytes,
  // paid for on every page load and again by every tool saved for offline use.
  const { outDir, offline } = await site();
  const shared = await read('pf-jobs.js');
  assert.ok(shared.includes('var SLUG'), 'the shared script is not at the site root');

  assert.ok(offline.bundle.includes('pf-jobs.js'),
    'a tool cached offline without it opens with no saved-bids band at all');

  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html') && !f.endsWith('offline.html'));
  let tagged = 0;
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    if (!html.includes('data-pf-jobs-root')) continue;
    tagged += 1;

    // The one thing a shared script can get wrong that an inlined one could
    // not: these pages are served at two depths, and a src that is right at
    // `/<slug>/` is a 404 at `/<slug>/some-question.html`.
    const src = html.match(/<script type="module" src="([^"]*pf-jobs\.js)"/)?.[1];
    assert.ok(src, `${path.relative(outDir, file)} carries the band but does not load its script`);
    const resolved = path.resolve(path.dirname(file), src);
    assert.equal(resolved, path.join(outDir, 'pf-jobs.js'),
      `${path.relative(outDir, file)} points its script at ${src}`);

    // And the copy it replaced is gone. A page carrying both would run the
    // whole feature twice, with two sets of listeners on one panel.
    assert.ok(!html.includes('var SLUG = '),
      `${path.relative(outDir, file)} still inlines the saved-bids script`);
  }
  assert.ok(tagged > 200, `only ${tagged} pages carry the band`);
});

// ---------------------------------------------------------------------------
// Legibility
//
// `contrast.mjs` is the real check here and it needs a browser, so it cannot
// run in CI. These are the parts of the same guarantee that can be asserted on
// the built text: the anti-patterns that produced the failures, rather than the
// ratios themselves. An opacity on inherited text is the one that matters most
// — it is invisible to review, it multiplies a colour the chrome never chose,
// and there is no value of it that is safe on a host already at the AA floor.
// ---------------------------------------------------------------------------

test('the injected chrome never dims text it did not choose the colour of', async () => {
  const { outDir } = await site();
  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html'));
  const offenders = [];
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    // Only the chrome's own stylesheet: a venture is free to use opacity on
    // markup whose colour it also owns and can check.
    const style = html.match(/<style id="pf-chrome-style">([\s\S]*?)<\/style>/)?.[1];
    if (!style) continue;
    if (/opacity\s*:/.test(style)) offenders.push(path.relative(outDir, file));
  }
  assert.deepEqual(offenders.slice(0, 5), [],
    'the chrome sets an opacity on text whose colour comes from the host page, ' +
    'so its contrast depends on a palette it cannot see');
});

test('the hub names its quietest ink rather than tinting it', async () => {
  const hub = await read('index.html');
  const style = hub.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

  // The counts next to each group and sub-group say how many tools are in it.
  // They are content, and they used to be --muted at .65 and .7 opacity, which
  // renders 3.18:1 and 3.32:1 -- both under AA.
  assert.match(style, /--soft:\s*#[0-9a-f]{6}/i, 'no named colour for the quietest text');
  assert.match(style, /--soft:\s*#[0-9a-f]{6}[^}]*}[\s\S]*prefers-color-scheme:\s*dark[\s\S]*--soft:\s*#[0-9a-f]{6}/i,
    '--soft is defined for only one theme');

  for (const [selector, pattern] of [
    ['.contents span', /\.contents span\s*\{([^}]*)\}/],
    ['.subgroup-count', /\.subgroup-count\s*\{([^}]*)\}/],
  ]) {
    const rule = style.match(pattern);
    assert.ok(rule, `no rule for ${selector}`);
    assert.ok(!/opacity\s*:/.test(rule[1]),
      `${selector} de-emphasises with an opacity, which cannot be measured for contrast`);
    assert.match(rule[1], /color:\s*var\(--soft\)/, `${selector} does not use the named tint`);
  }
});

test('a sideways-scrolling box is given keyboard access, and only when it scrolls', async () => {
  const { outDir } = await site();
  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html') && !f.endsWith('offline.html'));
  let carrying = 0;
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    if (!html.includes('data-pf-scrollable')) continue;
    carrying += 1;

    // Measured, not asserted statically: whether a box overflows depends on the
    // viewport and on how long the numbers rendered, so a `tabindex="0"` in the
    // markup would put a dead tab stop on every table that fits.
    assert.match(html, /scrollWidth\s*>\s*\w+\.clientWidth/,
      `${path.relative(outDir, file)} marks scroll boxes without measuring them`);
    assert.match(html, /removeAttribute\('tabindex'\)/,
      `${path.relative(outDir, file)} never releases the tab stop when the box fits again`);

    // `role="region"` on a <table> replaces its table semantics, so a screen
    // reader stops announcing rows and columns. The tab stop is the whole fix.
    assert.ok(!/setAttribute\('role'/.test(html),
      `${path.relative(outDir, file)} overrides the role of the box it makes focusable`);
  }
  assert.ok(carrying > 200, `only ${carrying} pages carry the keyboard-scroll pass`);
});

test('no published page hides a link inside a panel that sets no link colour', async () => {
  const { outDir } = await site();
  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html'));
  const offenders = [];
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    // The shape that produced 1.1:1 links: a result panel painting its own dark
    // fill, with no colour for the anchors inside it, so they fall back to the
    // browser default blue on a near-black background.
    if (!/\.result\s*\{[^}]*background:\s*#[0-9a-f]{6}/i.test(html)) continue;
    if (!/\.result\s+a\s*\{/.test(html)) offenders.push(path.relative(outDir, file));
  }
  assert.deepEqual(offenders.slice(0, 5), [],
    'a result panel paints its own background but leaves links to the browser default');
});
