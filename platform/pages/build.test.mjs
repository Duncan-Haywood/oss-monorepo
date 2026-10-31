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
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);

import { audienceGroups, audiencePageId } from './audiences.mjs';
import {
  exampleTools,
  researchHighlights,
  addOfflineSupport,
  annotateNumberInputs,
  stepAllowsDecimals,
  buildSite,
  collectOfflineBundle,
  categoryFor,
  DOWNLOADABLE_CLI_FILES,
  collectPageTitles,
  copyTree,
  clampMetaDescription,
  injectFavicon,
  discoverSurfaces,
  surfaceKind,
  faqEntries,
  injectChrome,
  isPublishable,
  NO_SLA_PATTERN,
  listFiles,
  readMeta,
  relatedTools,
  upToRoot,
  renderHub,
  flagshipSlugs,
  pageUrlPath,
  renderFavicon,
  renderFaviconSvg,
  FAVICON_SIZES,
  MARK_GEOMETRY,
  renderRobots,
  INDEXNOW_KEY,
  indexNowKeyFileName,
  renderSitemapIndex,
  renderVentureSitemap,
  searchTokens,
  searchVariants,
  searchScore,
  catalogueStopwords,
  withoutStopwords,
  CATALOGUE_STOPWORD_SHARE,
  aliasesFor,
  SEARCH_ALIASES,
  subcategoryFor,
  groupByCategory,
  groupBySubcategory,
  truncate,
  snippetize,
  SNIPPET_MAX,
  injectDiscoveryTags,
  SOCIAL_CARD_FILE,
  categoryCardOptions,
  toolCardOptions,
  socialCardFileFor,
  toolCardFileFor,
  ALL_CATEGORIES,
  SITE_NAME,
  REPO_ROOT,
  SOURCE_URL_PREFIX,
  repairLinks,
  pageHasOwnShareControl,
  categoryPagePath,
  CATEGORY_PATH_PREFIX,
  CHROME_MODULE_FILE,
  renderHubSitemap,
  renderLlmsTxt,
  toolProseName,
  listProse,
  renderCatalog,
  externalCallExceptions,
  surfaceExternalFetchHosts,
  CARD_FOOTER,
  CARD_FOOTER_EXCEPTION,
  COMPARE_PATH,
  RESEARCH_PATH,
  COMPARISON_FILE_PATTERN,
  comparisonSubject,
  comparisonSubjectKey,
  comparisonText,
  comparisonProductGroups,
  comparisonProductSlug,
  discoverComparisons,
  groupComparisons,
  renderComparePage,
  renderCompareProductPage,
  renderCategoryPage,
  GUIDES_PATH,
  isGuidePage,
  guidePageMeta,
  discoverGuides,
  groupGuidesByCategory,
  renderGuidesPage,
  sponsorsNote,
  SPONSORS_URL,
  SPONSOR_CLICK_EVENT,
  SPONSOR_LINK_ATTR,
  markSponsorLinks,
  renderChromeModule,
  KIND_PAGES,
  kindPageGroups,
  SEARCH_INDEX_FILE,
  renderSearchIndex,
} from './build.mjs';
import { LATE_NAV_DIRS, SITE_NAV, HEADER_MARKER, VENTURE_CHROME_CSS } from './site-nav.mjs';
import { AGENT_POSTS_DIR, loadPosts } from './writing.mjs';
import { renderSocialCard, SOCIAL_CARD_WIDTH, SOCIAL_CARD_HEIGHT, offlineBundleSizeLabel } from './offline.mjs';
import { renderCard } from './sharecard.mjs';
import { EMBED_QUERY_PARAM, DEFAULT_EMBED_HEIGHT } from './embed.mjs';
import { decodeEntities } from './entities.mjs';
// The hub embeds these rather than paraphrasing them, so the tests that used to
// pin its transcription line by line now compare against the definitions
// themselves. See "the hub validates a saved bid with the tested definition".
import { normalizeBid, normalizeOutcome, stripForInjection } from './jobs.mjs';

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
  // `DOWNLOADABLE_CLI_FILES` publishes exactly these `.py` paths on purpose --
  // the one file each of these 18 ventures' own page offers as a same-origin
  // download, not leaked CLI source. Everything else ending in `.py` still
  // should not be on the public site.
  const downloadable = new Set(
    Object.entries(DOWNLOADABLE_CLI_FILES).flatMap(([slug, names]) => names.map((name) => `${slug}/${name}`)),
  );
  const leaked = files.filter(
    (f) =>
      /(^|[./])test\.(mjs|js|py)$/.test(f) ||
      /(^|\/)test_/.test(f) ||
      /_test\.(mjs|js|py)$/.test(f) ||
      (f.endsWith('.py') && !downloadable.has(f)) ||
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
    // deploy/ and dev/ (and dev/daily/ under it) are written after the site build.
    if (LATE_NAV_DIRS.some((dir) => href.startsWith(`${dir}/`))) continue;
    // A fragment names a section of the target page, not a file.
    await fs.access(hrefTarget(href.split('#')[0], hub_, outDir));
  }

  // In-page anchors resolve to an element rather than a file. A stale one is
  // silent — the click just does nothing — so it is checked here rather than
  // skipped.
  const ids = new Set([...hub.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const fragments = all.filter((h) => h.startsWith('#'));
  assert.ok(fragments.length > 0, 'the hub should carry its skip link');
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
        // The site header links deploy/ and dev/, which publish-branch.sh
        // writes after this build.
        const target = path.relative(outDir, hrefTarget(ref, file, outDir)).split(path.sep)[0];
        if (LATE_NAV_DIRS.includes(target)) continue;
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
  // owner flips `PAGES_ENABLED` all of them are hosted surfaces, so the
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
  assert.match(hub, /buymeacoffee\.com\//);
  assert.match(hub, /is optional and changes nothing/i);
  // `\bsubscribe\b` rather than a bare `subscribe`: the guard is about a
  // paywall *call to action* ("Subscribe", "subscribe now", "subscribe to
  // unlock"), and every one of those forms still matches. What no longer
  // matches is the noun -- "subscriber", "subscribers", "subscriber count" --
  // which is a legitimate domain word rather than an ask.
  //
  // It first fired on 2026-09-08 against `newsletter-sponsorship-rate-
  // calculator`, whose entire input is a newsletter's subscriber count, and
  // it fired *after* that venture had already merged: Actions was starved, so
  // nothing ran this suite on the PR and `main` went red on it. Rewording the
  // venture's copy to satisfy a substring match would have made the product
  // worse to protect a guard from a word it never meant to catch.
  // Same for "free trials" (plural): trial-converter's whole job is turning a
  // SaaS's free trials into paying customers, which is its domain, not an ask.
  assert.ok(
    !/\bsubscribe\b|upgrade to|paid plan|\bfree trial\b/i.test(visibleCopy(hub)),
    'no paywall language',
  );
});

test('the hub declares structured data listing every section', async () => {
  const { surfaces } = await site();
  const hub = await read('index.html');
  const json = JSON.parse(hub.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);

  assert.equal(json['@type'], 'CollectionPage');
  const sections = groupByCategory(surfaces).length + KIND_PAGES.length;
  assert.equal(json.mainEntity.numberOfItems, sections);
  assert.equal(json.mainEntity.itemListElement.length, sections);
  assert.ok(json.mainEntity.itemListElement.every((item) => item.url.startsWith(`${BASE}${CATEGORY_PATH_PREFIX}/`)));
});

test('every tool is reachable from the hub without JavaScript, in at most two clicks', async () => {
  const { surfaces } = await site();
  const hub = (await read('index.html')).replace(/<script\b[\s\S]*?<\/script>/g, '');
  const reachable = new Set([...hub.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]));
  const categories = [...hub.matchAll(/href="c\/([^"/]+)\/" data-category="\1"/g)].map((m) => m[1]);
  assert.ok(categories.length >= groupByCategory(surfaces).length, 'the hub links every category page');
  for (const id of categories) {
    const page = (await read(CATEGORY_PATH_PREFIX, id, 'index.html')).replace(/<script\b[\s\S]*?<\/script>/g, '');
    for (const [, slug] of page.matchAll(/data-tool="([^"]+)" data-pf-to/g)) reachable.add(slug);
  }
  const missing = surfaces.map((s) => s.slug).filter((slug) => !reachable.has(slug));
  assert.deepEqual(missing, [], 'tools no visitor can click through to');
});

test('usage counting is local, opt-out, and honours browser signals', async () => {
  const hub = await read('index.html');
  assert.match(hub, /localStorage/);
  assert.match(hub, /doNotTrack/);
  assert.match(hub, /globalPrivacyControl/);
  assert.ok(!/XMLHttpRequest|sendBeacon/.test(hub), 'nothing about a visit leaves the device');
  // One request, to this site's own search index, and it carries nothing.
  const fetches = [...hub.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['SEARCH_INDEX']);
  assert.match(hub, new RegExp(`const SEARCH_INDEX = '${SEARCH_INDEX_FILE}';`));
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
    <link rel="canonical" href="https://duncan-haywood.github.io/oss-monorepo/">
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

test('the IndexNow key is published at the site root, matching the constant', async () => {
  const keyFile = await read(indexNowKeyFileName());
  assert.equal(keyFile, INDEXNOW_KEY);
  // The protocol reads this file's content as the key itself -- no trailing
  // newline or surrounding whitespace, or a verifier comparing it byte-for-
  // byte to the key in the submission request sees a mismatch.
  assert.equal(keyFile.trim(), keyFile);
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

  // ICO header: reserved 0, type 1 (icon), one image per size.
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, FAVICON_SIZES.length, 0]);
  assert.equal(ico[6], 16, 'the first image is the 16px tab icon (width)');
  assert.equal(ico[7], 16, 'height');
  FAVICON_SIZES.forEach((size, i) => assert.equal(ico[6 + i * 16], size, `entry ${i} is ${size}px`));
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
  // logos, which is why the geometry lives in one constant both renderers read.
  const svg = renderFaviconSvg();
  assert.match(svg, /stop-color="#1f4e8c"/, "the header mark's gradient starts in the hub's navy");
  assert.match(svg, /stop-color="#3a6ea5"/, '...and ends in its steel blue');
  assert.equal((svg.match(/fill="#ffffff"/g) ?? []).length, MARK_GEOMETRY.bars.length, 'three white bars');
  // The bars rise left to right, as `drawMark` draws them.
  const tops = [...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(tops, MARK_GEOMETRY.bars.map((b) => Number((b.top * 16).toFixed(2))));
  assert.ok(tops[0] > tops[1] && tops[1] > tops[2]);
});

test('the hub\'s top navigation links the blog and the podcast', async () => {
  // The Writing section (`writing.mjs`) is the site's blog; the footer link alone
  // left it a screen of tools away from anyone who came to read.
  const html = await read('index.html');
  const nav = html.match(/<nav class="pfs-head"[\s\S]*?<\/nav>/);
  assert.ok(nav, 'the hub has the shared site header');
  assert.match(nav[0], /<a data-pfs-nav="writing" href="writing\/"[^>]*>Blog<\/a>/);
  // Both at the top level (owner, 2026-10-21).
  assert.match(nav[0], /<a data-pfs-nav="podcast" href="writing\/podcast\/"[^>]*>Podcast<\/a>/);
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

test('llms-full.txt lists every published tool at its real URL', async () => {
  const { surfaces } = await site();
  const llms = await read('llms-full.txt');

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

// P052: the index is the first file an assistant reads, so it has to fit one
// fetch (it was 539 KB), with a one-sentence summary; the long text is in
// llms-full.txt, which the index links.
test('llms.txt is a short index that links llms-full.txt', async () => {
  const llms = await read('llms.txt');
  assert.ok(Buffer.byteLength(llms) < 50_000, `llms.txt is ${Buffer.byteLength(llms)} bytes`);
  const quote = llms.split('\n').find((line) => line.startsWith('> '));
  assert.ok(quote.length < 500, `blockquote is ${quote.length} characters`);
  assert.ok(llms.includes(`](${BASE}llms-full.txt)`));
});

test('llms-full.txt keeps each tool on one line, so no description leaks into prose', async () => {
  const { surfaces } = await site();
  const bullets = (await read('llms-full.txt')).split('\n').filter((line) => line.startsWith('- ['));

  // Eleven trailing bullets (the first links the other llms file) under "Optional" describe the site's own surfaces
  // rather than a tool — About, open custom development, Ask, updates and the changelog, the comparison
  // index, the guides index, catalog.json, the agent CLI, the sitemap and the
  // Atom feed, plus the agent-to-agent blog once `docs/agent-posts/` has a
  // post. Above the tools, one bullet per audience page; below them, one per
  // research topic. The count is tools plus those.
  const audiences = audienceGroups(surfaces).length;
  const topics = researchHighlights().themes.length;
  const agentBlog = loadPosts(undefined, AGENT_POSTS_DIR).length ? 1 : 0;
  assert.equal(bullets.length, surfaces.length + 11 + audiences + topics + agentBlog);
  for (const bullet of bullets) {
    assert.match(bullet, /^- \[[^\]]+\]\(https?:\/\/[^)]+\): \S/, `malformed bullet: ${bullet}`);
  }
});

// Both machine surfaces exist so an assistant can answer "which of these is a
// gutter tool" without reading 110 sibling descriptions and guessing.
test('the machine surfaces carry the sub-group a trade tool belongs to', async () => {
  const llms = await read('llms-full.txt');
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
  const llms = await read('llms-full.txt');

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

test('llms.txt names every audience page and every research topic', async () => {
  const { surfaces } = await site();
  const llms = await read('llms-full.txt');
  assert.match(llms.split('\n')[0], /^# Open Tools and Research$/);
  for (const { audience } of audienceGroups(surfaces)) {
    assert.ok(llms.includes(`](${BASE}c/${audiencePageId(audience)}/)`), `${audience.id} is missing from llms.txt`);
  }
  const { themes } = researchHighlights();
  assert.ok(themes.length > 0);
  for (const theme of themes) {
    assert.ok(llms.includes(`](${BASE}research/topics/${theme.id}/)`), `research topic ${theme.id} is missing`);
  }
});

test('an audience page leads with its fullest tools and their own guide pages, all of which shipped', async () => {
  const { outDir, surfaces } = await site();
  let checked = 0;
  for (const { audience, items } of audienceGroups(surfaces)) {
    const html = await fs.readFile(path.join(outDir, 'c', audiencePageId(audience), 'index.html'), 'utf8');
    const lead = html.match(/<section class="start-here"[\s\S]*?<\/section>/);
    if (items.length < 8) {
      assert.equal(lead, null, `${audience.id} is short enough to need no lead`);
      continue;
    }
    assert.ok(lead, `${audience.id} has no start-here block`);
    const starts = [...lead[0].matchAll(/href="\.\.\/\.\.\/([^"/]+)\/"/g)].map((m) => m[1]);
    assert.deepEqual(starts, exampleTools(items, 4).map((s) => s.slug));
    const answers = html.match(/<section class="answers"[\s\S]*?<\/section>/);
    if (answers) {
      for (const [, href] of answers[0].matchAll(/<li><a href="\.\.\/\.\.\/([^"]+)"/g)) {
        const file = href.endsWith('/') ? `${href}index.html` : href;
        assert.ok(await exists(path.join(outDir, file)), `${audience.id} lists ${href}, which did not ship`);
        assert.ok(items.some((s) => href.startsWith(`${s.slug}/`)), `${href} is not one of ${audience.id}'s tools`);
      }
    }
    checked += 1;
  }
  assert.ok(checked > 5, 'expected several audience pages large enough for a lead');
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
  // power-washing result. It does carry its own alias now — the pump type
  // most residential wells use, and a word its own copy never says — which
  // is the same fix as every other entry above, not the collision this
  // guards against.
  assert.match(aliasesFor('well-pump-bid-calculator'), /submersible/);
  assert.doesNotMatch(aliasesFor('well-pump-bid-calculator'), /power washing/);
  assert.equal(aliasesFor('ebay-fee-calculator'), '');

  // The trade's word and the material's word for the same roof.
  assert.match(aliasesFor('roofing-bid-calculator'), /shingle/);
  assert.match(aliasesFor('sod-install-bid-calculator'), /grass/);
  assert.match(aliasesFor('lawn-care-bid-calculator'), /mowing/);
  assert.match(aliasesFor('junk-removal-bid-calculator'), /dumpster/);
  for (const slug of ['mini-split-bid-calculator', 'hvac-maintenance-contract-calculator']) {
    assert.match(aliasesFor(slug), /\bac\b/);
  }
});

test('an alias reaches a slug word, never a word ending', () => {
  // The failure this replaces was live and invisible: the key is matched
  // against the slug, and a raw substring test reads the slug as one string.
  // "basement-waterproofing-bid-calculator" ends "…roofing-bid-calculator", so
  // under a substring test the shingle words land on the French-drain
  // calculator and "shingle" starts returning a basement tool. Nothing about
  // that is red -- the alias table looks right and the query returns a result.
  assert.equal(aliasesFor('basement-waterproofing-bid-calculator'), '');
  assert.match(aliasesFor('roofing-bid-calculator'), /shingle/);

  // Only a run of whole slug words claims a tool: the key's words have to be
  // adjacent and in order, and neither may be half of a longer word.
  assert.equal(aliasesFor('snow-plow-removal-bid-calculator'), '');
  assert.equal(aliasesFor('removal-snow-bid-calculator'), '');
  assert.equal(aliasesFor('snowplow-removal-bid-calculator'), '');
  // A tool whose slug carries the run keeps the alias wherever the run sits.
  assert.match(aliasesFor('snow-removal-bid-calculator'), /plowing/);
  assert.match(aliasesFor('commercial-snow-removal-bid-calculator'), /plowing/);
});

test('every alias names a venture that exists', async () => {
  // A typo'd or renamed slug makes an alias silently dead -- the query keeps
  // returning nothing and nothing turns red. Asked through aliasesFor rather
  // than through a substring test of its own, so the check answers the
  // question that matters: does any published tool actually receive it?
  const slugs = (await site()).surfaces.map((s) => s.slug);
  for (const alias of SEARCH_ALIASES) {
    assert.ok(
      slugs.some((published) => aliasesFor(published).includes(alias.add)),
      `alias "${alias.slug}" reaches no published venture`,
    );
  }
});

test('search ranks the tool a query names above one that merely mentions it', () => {
  const name = (title, slug) => searchTokens([title, slug]);
  const index = (...parts) => searchTokens(parts);
  const forms = (...words) => words.map(searchVariants);

  const roofing = {
    name: name('Roofing Bid Calculator', 'roofing-bid-calculator'),
    index: index('Roofing Bid Calculator', 'Price a residential reroof from roof squares, pitch, waste'),
  };
  // Its copy says "roof" — it is roof work — but it is not the roofing
  // calculator, and it led the results for "roof" before ranking existed.
  const chimney = {
    name: name('Chimney Sweep Bid Calculator', 'chimney-sweep-bid-calculator'),
    index: index('Chimney Sweep Bid Calculator', 'Price a sweep and inspection from flue, roof pitch, and access'),
  };
  const score = (tool, ...words) => searchScore(tool.name, tool.index, forms(...words), true);

  assert.ok(score(roofing, 'roof') > score(chimney, 'roof'));

  // Two words in the name beat a name word plus a description word, so a
  // query gets more specific rather than merely longer.
  assert.ok(score(chimney, 'chimney', 'sweep') > score(chimney, 'chimney', 'roof'));

  // The shorter name wins a tie, on the reading that the query covered more of
  // it. Never more than a tie-break: the fraction is below 1 by construction,
  // so it cannot lift a description match over a name match.
  const metalRoof = {
    name: name('Metal Roof Bid Calculator', 'metal-roof-bid-calculator'),
    index: index('Metal Roof Bid Calculator', 'Price a standing-seam metal roof from panel squares'),
  };
  assert.ok(score(roofing, 'roof') > score(metalRoof, 'roof'));
  assert.ok(score(metalRoof, 'roof') - Math.floor(score(metalRoof, 'roof')) < 1);

  // A tool no word reaches still scores below one a single word does, so a
  // non-match can never be ordered above a match.
  const ebay = { name: name('eBay Fee Calculator', 'ebay-fee-calculator'), index: index('eBay Fee Calculator') };
  assert.ok(score(ebay, 'roof') < score(chimney, 'roof'));
});

/** The search index the hub fetches, parsed once. */
let parsedIndex;
const searchIndexJson = async () => (parsedIndex ??= JSON.parse(await read(SEARCH_INDEX_FILE)));
const toolItems = async () => (await searchIndexJson()).items.filter((item) => ['tool', 'app', 'cli'].includes(item.k));

test('the hub carries the ranking function its index is scored with', async () => {
  const html = await read('index.html');
  // Ranking decides what a visitor sees first. A hand-written copy in the page
  // that drifted from the tested export would be a ranking bug with a green
  // suite -- the same failure the stemmer injection exists to prevent.
  assert.ok(
    html.includes(searchScore.toString()),
    'hub page does not carry the exact searchScore source that build.mjs exports',
  );
  // Scoring needs the tool's own name apart from its description and aliases;
  // without it every item scores alike and the order never changes.
  const roofing = (await toolItems()).find((item) => item.s === 'roofing-bid-calculator');
  assert.ok(roofing.n.includes('roofing'), 'no name index for the roofing calculator');
  assert.ok(roofing.x.includes('roofing'));
  assert.match(html, /searchScore\(item\.n, item\.x, forms, boundary\)/);
});

test('the search index lists every tool and every research project, and the hub does not', async () => {
  const { surfaces } = await site();
  const index = await searchIndexJson();
  const tools = await toolItems();
  assert.deepEqual(tools.map((t) => t.s).sort(), surfaces.map((s) => s.slug).sort());
  for (const item of tools) assert.ok(index.cats[item.c], `${item.s} names no category`);
  const research = index.items.filter((item) => item.k === 'research');
  assert.ok(research.length > 0, 'research projects are searchable too');
  for (const item of research) {
    assert.ok(item.u.startsWith(RESEARCH_PATH), item.u);
    assert.ok(await exists(path.join((await site()).outDir, item.u, 'index.html')), `${item.u} did not ship`);
  }
  // The front door no longer carries the catalogue: a handful of example and
  // featured links, not one card per tool.
  const hub = (await read('index.html')).replace(/<script\b[\s\S]*?<\/script>/g, '');
  const linked = new Set([...hub.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(linked.size > 10 && linked.size < surfaces.length / 4, `the hub links ${linked.size} tools directly`);
  assert.doesNotMatch(hub, /data-search=/);
});

test("a tool's guide pages and the blog's posts are their own search results", async () => {
  const { outDir, surfaces } = await site();
  const index = await searchIndexJson();
  const slugs = new Set(surfaces.map((s) => s.slug));
  const guides = index.items.filter((item) => item.k === 'guide');
  assert.ok(guides.length > 100, `fixture assumption: many guide pages, saw ${guides.length}`);
  for (const item of guides) {
    assert.ok(slugs.has(item.s), `${item.u} names no tool`);
    assert.ok(item.u.startsWith(`${item.s}/`) && item.u !== `${item.s}/`, item.u);
    assert.ok(await exists(path.join(outDir, item.u)), `${item.u} did not ship`);
    assert.ok(item.t && item.d, `${item.u} has no title or description`);
  }
  // Comparison and collection pages answer "jobber" or "roofers" once, where
  // 43 identical "This calculator vs. Jobber" rows would not.
  const pages = index.items.filter((i) => i.k === 'page');
  assert.ok(pages.some((i) => i.u.startsWith('compare/')) && pages.some((i) => i.u.startsWith('c/')));
  for (const item of pages) assert.ok(await exists(path.join(outDir, item.u, 'index.html')), `${item.u} did not ship`);
  const jobber = guides.filter((i) => /\/vs-jobber\.html$/.test(i.u));
  assert.deepEqual(jobber, [], 'a vs page its compare/ page gathers is not listed again');
  for (const item of index.items.filter((i) => i.k === 'post')) {
    assert.equal(index.cats[item.c], 'Blog');
    assert.ok(await exists(path.join(outDir, item.u, 'index.html')), `${item.u} did not ship`);
  }
  // Listed after every tool, so the tie-break never puts a guide above a tool.
  const lastTool = index.items.findLastIndex((i) => ['tool', 'app', 'cli'].includes(i.k));
  assert.ok(index.items.findIndex((i) => i.k === 'guide') > lastTool);
});

test('renderSearchIndex files a guide under its tool and a post under the blog', () => {
  const data = JSON.parse(renderSearchIndex(
    [{ slug: 'roofing-bid-calculator', title: 'Roofing Bid Calculator', description: 'Price a roof.' }],
    [],
    {
      guides: [{ slug: 'roofing-bid-calculator', url: 'roofing-bid-calculator/how-to-price-a-tear-off.html', title: 'How to price a tear-off', description: 'Layers, disposal and decking.' }],
      posts: [{ slug: 'hello', title: 'Hello', description: 'A post.', tags: ['agents'] }],
      sections: [{ url: 'compare/jobber/', title: 'Jobber alternatives', description: 'Tools with a page against Jobber.', section: 'compare' }],
    },
  ));
  const [tool, page, guide, post] = data.items;
  assert.equal(tool.k, 'tool');
  assert.deepEqual([page.k, page.u, data.cats[page.c]], ['page', 'compare/jobber/', 'Comparison']);
  assert.deepEqual([guide.k, guide.s, guide.u, guide.c], ['guide', 'roofing-bid-calculator', 'roofing-bid-calculator/how-to-price-a-tear-off.html', tool.c]);
  assert.match(guide.x, /\bdisposal\b/);
  assert.deepEqual([post.k, post.u, data.cats[post.c]], ['post', 'writing/hello/', 'Blog']);
  assert.match(post.x, /\bagents\b/);
});

test('a query that matches every word in nothing is offered the closest tools', async () => {
  const html = await read('index.html');
  // The matcher ANDs across words, which keeps two-word queries precise and
  // turns a typed sentence into nothing at all. The dead end is a ranked
  // shortlist, and the page says it is approximate.
  assert.match(html, /<p class="closest" id="closest" hidden><\/p>/);
  assert.match(html, /No tool matches every word\. Closest /);
  assert.match(html, /const CLOSEST_LIMIT = \d+;/);
  // Scored at a token boundary, so "air" does not score inside "stair".
  assert.match(html, /searchScore\(item\.n, item\.x, forms, true\)/);
  // And only when it offers something the strict pass did not.
  assert.match(html, /if \(partial\.some\(\(\{ item \}\) => !hitSet\.has\(item\)\)\) \{/);
});

test('a word this catalogue repeats everywhere stops narrowing a search', () => {
  const cards = [
    { name: 'roofing bid calculator', index: 'roofing bid calculator see away charge squares' },
    { name: 'fence bid calculator', index: 'fence bid calculator see away charge lineal' },
    { name: 'deck bid calculator', index: 'deck bid calculator see away joists' },
  ];
  const stops = catalogueStopwords(cards, 0.7);
  // In every index, in no name: house phrasing, not something anyone searches.
  assert.ok(stops.has('see'));
  assert.ok(stops.has('away'));
  // 2 of 3 is 67%, under the 70% floor used here.
  assert.ok(!stops.has('charge'));
  // Words that identify one tool are what the search is for.
  for (const word of ['squares', 'lineal', 'joists']) assert.ok(!stops.has(word));

  // The rule that makes the cut safe: a word in any tool's NAME is never
  // dropped, however common. Without it a frequency cut would quietly delete
  // tools from the search -- the worst outcome for the box that finds them.
  const named = [
    { name: 'notary trip quote', index: 'notary trip quote fee' },
    { name: 'quote margin check', index: 'quote margin check' },
    { name: 'deck bid calculator', index: 'deck bid calculator quote' },
  ];
  assert.ok(!catalogueStopwords(named, 0.5).has('quote'));

  assert.deepEqual(catalogueStopwords([]), new Set());
  assert.equal(withoutStopwords('roofing see away bid', new Set(['see', 'away'])), 'roofing bid');
  assert.equal(withoutStopwords('roofing bid', new Set()), 'roofing bid');
});

test('the index drops the catalogue words that narrow nothing, and ships them for the query', async () => {
  const { surfaces } = await site();
  const index = await searchIndexJson();
  const cards = (await toolItems()).map((item) => ({ name: item.n, index: item.x }));
  assert.equal(cards.length, surfaces.length);
  const stops = catalogueStopwords(cards, CATALOGUE_STOPWORD_SHARE);
  // A word the index never stores can never match, so the query filter the
  // browser uses has to hold every derived stopword.
  const shipped = new Set(index.stopwords);
  for (const word of stops) {
    assert.ok(shipped.has(word), `derived stopword "${word}" is not in the shipped query filter`);
    for (const card of cards) assert.ok(!card.index.split(' ').includes(word), `"${word}" is still indexed`);
  }
  // No tool is ever made unfindable by its own name.
  for (const card of cards) {
    for (const word of card.name.split(' ').filter(Boolean)) assert.ok(!shipped.has(word));
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
  const tools = await toolItems();
  const surfaces = (await site()).surfaces;

  const truncated = surfaces.filter(
    (s) => s.fullDescription && s.fullDescription.length > s.description.replace(/…$/, '').length + 1,
  );
  // If this is ever zero the test is no longer proving anything.
  assert.ok(truncated.length > 0, 'expected at least one description longer than its card');

  // A probe word has to survive the same catalogue-wide stopword cut the real
  // index went through -- otherwise a word that happens to cross
  // CATALOGUE_STOPWORD_SHARE across the whole catalogue (as "browser" did once
  // enough tools said "runs in your browser") fails this test for an unrelated
  // venture, not because the index is missing anything but because the probe
  // word was never going to be indexed in the first place.
  //
  // It is derived from each surface's *pre-strip* index -- the same input
  // renderHub feeds catalogueStopwords, aliases included -- rather than from
  // the already-rendered `data-search` attributes. Reading it back out of the
  // output is circular twice over: a word cut for being too common is by then
  // absent from every card and so never looks frequent enough to cut, and,
  // worse, a word unique to one venture that is missing from the index because
  // of the very regression this test exists to catch also appears on no card,
  // so the output-derived reading classifies it as a stopword and skips the
  // assertion. That is a silent pass on the real bug.
  const rawCards = surfaces.map((s) => ({
    name: searchTokens([s.title, s.slug]),
    index:
      s.searchIndex ??
      searchTokens([s.title, s.fullDescription ?? s.description, s.slug, aliasesFor(s.slug)]),
  }));
  const stops = catalogueStopwords(rawCards, CATALOGUE_STOPWORD_SHARE);
  // searchTokens already drops generic English (SEARCH_STOPWORDS) on the way
  // in, so `stops` is the whole of the remaining difference between a word in
  // the tail and a word in the rendered index.

  for (const surface of truncated) {
    const shown = surface.description.replace(/…$/, '');
    const tail = surface.fullDescription.slice(shown.length);
    const candidates = searchTokens([tail])
      .split(' ')
      .filter((w) => w.length > 4 && !stops.has(w));
    if (candidates.length === 0) continue;
    const index = tools.find((item) => item.s === surface.slug)?.x;
    assert.ok(index, `no card rendered for ${surface.slug}`);
    const padded = ` ${index} `;
    assert.ok(
      candidates.some((word) => padded.includes(` ${word} `)),
      `none of "${candidates.join(', ')}" (from ${surface.slug}'s truncated description) is in its search index, though none of them was cut as a catalogue stopword`,
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
  const cards = (await toolItems()).map((item) => ({ index: item.x, slug: item.s }));
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

  assert.ok(search('ebay return').includes('ebay-fee-calculator'));
  assert.ok(search('freight accessorial').includes('freight-accessorial-auditor'));
  assert.deepEqual(search('qqzzxx'), []);
});

test('the query drops exactly the words the index dropped', async () => {
  // If the two normalisers disagree, a query containing a word the index never
  // stores can never match anything.
  const html = await read('index.html');
  const index = await searchIndexJson();
  const indexes = (await toolItems()).map((item) => item.x.split(' '));
  assert.ok(indexes.length > 0);
  for (const word of index.stopwords) {
    const generic = searchTokens([word]) === '';
    const indexed = indexes.some((tokens) => tokens.includes(word));
    assert.ok(generic || !indexed, `"${word}" is a query stopword but is still indexed`);
  }
  assert.ok(html.includes('word.length >= 2'), 'query must drop single characters as the index does');
  assert.ok(html.includes('!stop.has(word)'), 'the query is filtered by the stopwords shipped with the index');
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
  const shortcut = '<head><link rel="shortcut icon" href="mine.ico"></head>';
  assert.equal(injectFavicon(shortcut, '../'), shortcut);
  // A home-screen tile is not a tab icon: the page still gets one.
  const touch = injectFavicon('<head><link rel="apple-touch-icon" href="t.png"></head>', '../');
  assert.ok(touch.includes('href="../favicon.ico"'), 'apple-touch-icon must not count as a favicon');

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
  assert.equal(categoryFor('changepoint-detector').id, 'research-algorithms');
  for (const slug of ['open-floor-robots', 'open-robot-mower', 'open-tennis-robots']) {
    assert.equal(categoryFor(slug).id, 'open-hardware');
  }
});

test('every category names a distinct share-card file and accent colour', () => {
  assert.equal(ALL_CATEGORIES.length, 15, 'the fourteen named sections plus the catch-all');
  const files = ALL_CATEGORIES.map((category) => socialCardFileFor(category.id));
  assert.equal(new Set(files).size, files.length, 'no two categories share a card file');
  const accents = ALL_CATEGORIES.map((category) => category.accent);
  assert.ok(accents.every((hex) => /^#[0-9a-f]{6}$/i.test(hex)), 'every accent is a real hex colour');
  assert.equal(new Set(accents).size, accents.length, 'no two categories share an accent');
});

test("socialCardFileFor names a file under the category's own id, not its title", () => {
  // The id is what stays stable across a rename; the title is prose that gets
  // rewritten. Filing the card under the title would break the link the first
  // time someone edited a heading.
  assert.equal(socialCardFileFor('trades'), 'social-card-trades.png');
  assert.equal(socialCardFileFor('more'), 'social-card-more.png');
});

// These four sat in "More free tools" — the section a visitor reads last, if at
// all — while the category they belong to was one scroll above them. A seller
// looking for the TikTok Shop fee tool had no reason to keep scrolling past the
// marketplace section that did not contain it.
test('tools that belong to a named category are not left in the catch-all', () => {
  assert.equal(categoryFor('tiktok-shop-fee-calculator').id, 'marketplace');
  assert.equal(categoryFor('delivery-app-margin-calculator').id, 'marketplace');
  assert.equal(categoryFor('kdp-royalty-calculator').id, 'marketplace');
  // Whatnot's retail fee ranking already deep-links this payout tool; leaving
  // it in "More free tools" hid it from every seller already reading the
  // marketplace section that names it.
  assert.equal(categoryFor('whatnot-seller-payout').id, 'marketplace');
  // `food-service`'s three, pinned with the section that introduces them.
  // `pour-cost-calculator` is the one that matters here: it is the only member
  // that came from a named section rather than the catch-all, having sat in
  // `services` for want of anywhere better, so it is the placement a later
  // reader is most likely to undo by widening the `services` prefix list back
  // over it. The other two are the ordinary case — a placement with no
  // assertion is one regex edit from dropping its venture back into "More free
  // tools", the section a visitor reads last, with nothing going red.
  assert.equal(categoryFor('food-truck-event-margin-calculator').id, 'food-service');
  assert.equal(categoryFor('menu-engineering-calculator').id, 'food-service');
  assert.equal(categoryFor('pour-cost-calculator').id, 'food-service');
  // `childcare-tuition-calculator` stayed in `services` — it prices a seat,
  // not a plate, so `food-service`'s three did not pull it in with them.
  assert.equal(categoryFor('childcare-tuition-calculator').id, 'services');
  assert.equal(categoryFor('security-deposit-return-calculator').id, 'backoffice');
  assert.equal(categoryFor('ltl-freight-class-estimator').id, 'logistics');
  assert.equal(categoryFor('owner-operator-cpm-calculator').id, 'logistics');
  assert.equal(categoryFor('cash-runway-planner').id, 'backoffice');
  // The tool that computes the burden and overhead rates every bid calculator
  // asks for belongs beside them, not in "More free tools" where the readers who
  // meet those two fields would never see it.
  assert.equal(categoryFor('shop-rate-calculator').id, 'trades');
  assert.equal(subcategoryFor('shop-rate-calculator').id, 'trades-paid');
  // Four browser+CLI developer checks sat in the catch-all as a coherent
  // group — starved-runner triage, coverage delta, flaky-test classification,
  // AI-crawler robots.txt audit — while related-tool chrome mixed them with
  // Sponsor Ready. A maintainer browsing for a CI gate never saw the section.
  assert.equal(categoryFor('actions-runner-starvation-check').id, 'ci');
  assert.equal(categoryFor('coverage-drop-check').id, 'ci');
  assert.equal(categoryFor('flaky-test-finder').id, 'ci');
  assert.equal(categoryFor('ai-crawler-access-check').id, 'ci');
  // `license-drift-check` graduated 2026-09-07 and landed in the catch-all
  // because the rule enumerates families by prefix and its slug starts a new
  // one — it names what it diffs rather than what it reads. Same shape as the
  // rest: a browser-local checker plus a matching CLI, run against a
  // dependency tree the maintainer already has.
  assert.equal(categoryFor('license-drift-check').id, 'ci');
});

// Found 2026-09-06: five more tools sat in the catch-all for the same reason —
// each is a sibling of a tool already filed in a named section, under a slug
// no keyword there caught. `equipment-lease-buyout-calculator` is the same
// cost-per-month-of-use decision as `equipment-rental-break-even`, just ending
// in `-calculator` rather than `-break-even`. `card-processing-fee-audit` is
// the same after-the-sale statement reconciliation as this section's other
// tools, for a card processor's bill. `tender-bid-readiness`, `tender-radar`
// and `which-job-first` are read by the same contractor deciding whether and
// what to bid as `contractor-bid-readiness`, already in "Getting paid & job
// margin" — none of their slugs start with a trade-bid keyword.
test('a contractor pre-bid tool and a statement-reconciliation tool are not left in the catch-all either', () => {
  assert.equal(categoryFor('equipment-lease-buyout-calculator').id, 'backoffice');
  assert.equal(categoryFor('card-processing-fee-audit').id, 'backoffice');
  // UK tax, pay and benefits tools have their own section (split from backoffice 2026-10-17).
  assert.equal(categoryFor('uk-take-home-pay-calculator').id, 'uk-tax');
  assert.equal(categoryFor('uk-vat-flat-rate-scheme-calculator').id, 'uk-tax');
  assert.equal(categoryFor('tender-bid-readiness').id, 'trades');
  assert.equal(subcategoryFor('tender-bid-readiness').id, 'trades-paid');
  assert.equal(categoryFor('tender-radar').id, 'trades');
  assert.equal(subcategoryFor('tender-radar').id, 'trades-paid');
  assert.equal(categoryFor('which-job-first').id, 'trades');
  assert.equal(subcategoryFor('which-job-first').id, 'trades-paid');
});

// A cutting planner for woodworkers and sign shops spent its whole life filed
// under "Logistics, freight & cloud cost" because the `logistics` rule matched
// the literal prefix `cut-list`. Nothing about the page was wrong; every
// internal link out of it was. The four related tools it offered were a 3PL
// quote normaliser, a cloud egress calculator, a medical-courier route margin
// and an owner-operator CPM, and it was listed on the freight hub where its
// readers do not look. Both halves are asserted here: where it now lives, and
// that the freight section no longer claims it.
test('the cut list planner is filed with the trades that cut sheet goods, not with freight', () => {
  assert.equal(categoryFor('cut-list-optimizer').id, 'trades');
  assert.equal(subcategoryFor('cut-list-optimizer').id, 'trades-interior');
  assert.notEqual(categoryFor('cut-list-optimizer').id, 'logistics');
  // The freight tools it used to sit beside are still freight tools.
  for (const slug of ['3pl-quote-normalizer', 'ltl-freight-class-estimator', 'medical-courier-route-margin']) {
    assert.equal(categoryFor(slug).id, 'logistics', `${slug} should still be logistics`);
  }
});

// The consequence the misfiling actually had, asserted directly rather than
// through the category id: a woodworker is offered woodworking tools.
test('the cut list planner offers trade siblings, not freight tools', () => {
  const surfaces = [
    'cut-list-optimizer',
    'countertop-bid-calculator',
    'cabinet-refinishing-bid-calculator',
    'crown-molding-bid-calculator',
    'flooring-bid-calculator',
    '3pl-quote-normalizer',
    'cloud-egress-calculator',
    'medical-courier-route-margin',
  ].map((slug) => ({ slug, title: slug }));
  const related = relatedTools(surfaces, 'cut-list-optimizer', 4);
  assert.equal(related.length, 4);
  for (const surface of related) {
    assert.equal(categoryFor(surface.slug).id, 'trades', `${surface.slug} is not a trade tool`);
  }
});

test('sub-groups only apply where a category is large enough to need them', () => {
  assert.equal(subcategoryFor('ebay-fee-calculator'), null, 'marketplace reads as one list');
  assert.equal(subcategoryFor('3pl-quote-normalizer'), null, 'logistics reads as one list');
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

test('every discovered tool lands on exactly one category page', async () => {
  const { surfaces } = await site();
  const counts = new Map(surfaces.map((s) => [s.slug, 0]));
  for (const { category } of groupByCategory(surfaces)) {
    const page = (await read(CATEGORY_PATH_PREFIX, category.id, 'index.html')).replace(/<script\b[\s\S]*?<\/script>/g, '');
    for (const [, slug] of page.matchAll(/data-tool="([^"]+)"/g)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  for (const [slug, n] of counts) assert.equal(n, 1, `${slug} is on ${n} category pages`);
});

// The catalogue is too long for one page, so the Tools index is its table of
// contents: every category, and every sub-group inside one.
test('the Tools index reaches every section and sub-group', async () => {
  const { surfaces } = await site();
  const index = await read(CATEGORY_PATH_PREFIX, 'index.html');
  for (const { category, items } of groupByCategory(surfaces)) {
    assert.ok(index.includes(`href="${category.id}/" data-category="${category.id}"`), `no link for ${category.id}`);
    for (const { subcategory } of groupBySubcategory(category.id, items)) {
      if (!subcategory) continue;
      assert.ok(index.includes(`href="${category.id}/#${subcategory.id}"`), `no link for ${subcategory.id}`);
      const page = await read(CATEGORY_PATH_PREFIX, category.id, 'index.html');
      assert.ok(page.includes(`id="${subcategory.id}"`), `${subcategory.id} has no anchor on its page`);
    }
  }
  for (const kind of KIND_PAGES) assert.ok(index.includes(`href="${kind.id}/" data-category="${kind.id}"`));
});

test('a long category page is sub-divided with jump links, and a short one stays flat', async () => {
  const trades = await read(CATEGORY_PATH_PREFIX, 'trades', 'index.html');
  const jumps = trades.split('<nav class="jumps"')[1].split('</nav>')[0];
  assert.ok(jumps.includes('href="#trades-roof"'), 'the 100+ trade tools are broken into families');
  assert.ok(trades.includes('<section class="subgroup" id="trades-roof">'));
  // The in-page filter is drawn hidden and shown by the script that runs it.
  assert.match(trades, /<p class="filter" id="cat-filter-row" hidden>/);
  const marketplace = await read(CATEGORY_PATH_PREFIX, 'marketplace', 'index.html');
  assert.ok(!marketplace.includes('class="subgroup"'), 'a section that fits on a screen gets no sub-headings');
});

// Heading order is how a screen-reader user browses a directory this long.
test('no heading level is skipped on the hub or a category page', async () => {
  for (const parts of [['index.html'], [CATEGORY_PATH_PREFIX, 'trades', 'index.html'], [CATEGORY_PATH_PREFIX, 'index.html']]) {
    const html = (await read(...parts)).replace(/<script\b[\s\S]*?<\/script>/g, '');
    const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    const skip = levels.slice(1).find((level, i) => level > levels[i] + 1);
    assert.equal(skip, undefined, `${parts.join('/')} skips a heading level`);
  }
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
  // This used to read a naturally-occurring case out of real venture content
  // (ai-engineering-academy's own README link). That coupled the test to
  // whatever venture happened to have such a link, which is how it went
  // silent the day the portfolio's last one was fixed: this repository is
  // private, so every one of those was a 404 for every real visitor (see
  // CLAUDE.md and #2720), and by the time that was cleaned up across the
  // site, zero remained for this test to find. Build an isolated case
  // instead, so the fallback itself -- point at the repository rather than
  // leave a raw broken relative link -- stays covered on its own.
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-repair-root-'));
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-repair-out-'));
  const ventureDir = path.join(repoRoot, 'ventures', 'widget-co');
  const siteDir = path.join(ventureDir, 'site');
  await fs.mkdir(siteDir, { recursive: true });
  // Stands in for a CLI-only module or test payload: it exists in the repo,
  // but this build never publishes it.
  await fs.writeFile(path.join(ventureDir, 'cli.py'), '# not published');
  await fs.writeFile(path.join(siteDir, 'index.html'), '<a href="../cli.py">the CLI</a>');

  const destination = path.join(outDir, 'widget-co');
  await fs.mkdir(destination, { recursive: true });
  await fs.copyFile(path.join(siteDir, 'index.html'), path.join(destination, 'index.html'));

  const repairs = await repairLinks({ publishedDir: destination, sourceDir: siteDir, repoRoot, outDir });
  assert.ok(repairs.length > 0, 'a link to a genuinely unpublished file should be repointed, not left broken');

  const built = await fs.readFile(path.join(destination, 'index.html'), 'utf8');
  assert.ok(
    built.includes(`${SOURCE_URL_PREFIX}ventures/widget-co/cli.py`),
    'the escaping link should point at the file in the repository',
  );
  assert.ok(!built.includes('href="../cli.py"'));
});

test('repair leaves working in-site links untouched', async () => {
  const ebay = await read('ebay-fee-calculator', 'index.html');
  assert.ok(ebay.includes('href="calc.mjs"') || ebay.includes('src="calc.mjs"') || ebay.includes('./calc.mjs'),
    'the tool still loads its own module by relative path');
  assert.ok(!ebay.includes(`${SOURCE_URL_PREFIX}ventures/ebay-fee-calculator/calc.mjs`),
    'a module that is published must not be repointed off-site');
});

test('JSON-LD cannot break out of its script element', () => {
  const items = [{ slug: 'x', title: 'Bad</script><img src=x>', description: 'd', pageCount: 1, hasSitemap: false }];
  const category = categoryFor('x');
  const page = renderCategoryPage({ category, items, groups: [{ category, items }], baseUrl: BASE });
  const block = page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
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

test('every page type carries the one site header, with every nav item', async () => {
  const { outDir } = await site();
  const pages = {
    hub: ['index.html'],
    tools: [CATEGORY_PATH_PREFIX, 'index.html'],
    category: [CATEGORY_PATH_PREFIX, 'trades', 'index.html'],
    apps: [CATEGORY_PATH_PREFIX, 'apps', 'index.html'],
    about: ['about', 'index.html'],
    compare: ['compare', 'index.html'],
    guides: ['guides', 'index.html'],
    research: ['research', 'index.html'],
    researchProject: ['research', 'accel-kws', 'index.html'],
    researchTopic: ['research', 'topics', 'accel', 'index.html'],
    engineering: ['engineering', 'index.html'],
    writing: ['writing', 'index.html'],
    updates: ['updates', 'index.html'],
    changelog: ['changelog', 'index.html'],
    venture: ['ebay-fee-calculator', 'index.html'],
    notFound: ['404.html'],
  };
  for (const [name, parts] of Object.entries(pages)) {
    const html = await read(...parts);
    assert.equal(html.split(HEADER_MARKER).length - 1, 1, `${name}: expected exactly one site header`);
    const toRoot = name === 'notFound' ? BASE : upToRoot(path.join(...parts));
    const hrefs = [...html.matchAll(/data-pfs-nav="[^"]+" href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, SITE_NAV.map((item) => `${toRoot === './' ? '' : toRoot}${item.href}`), name);
    if (name !== 'notFound' && name !== 'venture') {
      assert.ok(await exists(path.join(outDir, path.dirname(path.join(...parts)), `${toRoot}pf-site.css`)), `${name}: pf-site.css`);
    }
  }
  // The bars later passes anchor under the header (saved bids, shop rates)
  // still find it, so they sit below the site navigation, not above it.
  const roofing = await read('roofing-bid-calculator', 'index.html');
  assert.ok(roofing.includes('data-pf-jobs-root'), 'the roofing tool carries the saved-bids band');
  assert.ok(roofing.indexOf(HEADER_MARKER) < roofing.indexOf('data-pf-jobs-root'), 'the saved-bids band sits above the site header');
  // A deep page inside a tool gets a breadcrumb through its category.
  const deep = (await listFiles(path.join(outDir, 'ebay-fee-calculator'))).find((f) => f.endsWith('.html') && !f.endsWith('index.html'));
  const html = await fs.readFile(deep, 'utf8');
  assert.match(html, /aria-label="Breadcrumb"><a href="\.\.\/" data-pf-to="hub">Home<\/a>.*href="\.\.\/c\/marketplace\/".*href="\.\.\/ebay-fee-calculator\/"/s);
});

// Until 2026-10-19 a research project page linked only back to a 2 MB index of
// all 700 projects, and the index's card titles went to GitHub, so most
// project pages had one inbound link and no route sideways.
test('research has a topic level, and every project page routes up and sideways', async () => {
  const { outDir } = await site();
  const project = await read('research', 'accel-kws', 'index.html');
  assert.match(project, /aria-label="Breadcrumb"><a href="\.\.\/\.\.\/" data-pf-to="hub">Home<\/a>.*href="\.\.\/\.\.\/research\/">Research<\/a>.*href="\.\.\/\.\.\/research\/topics\/accel\/">/s);
  assert.doesNotMatch(project, /\{\{\w+\}\}/, 'no unfilled placeholder');
  assert.doesNotMatch(project, /<title>accel-kws /, 'the title is the project, not its slug');
  // "More in <topic>", previous/next, and every topic.
  const more = project.slice(project.indexOf('id="more"'));
  assert.ok([...more.matchAll(/<li><a href="\.\.\/[\w-]+\/">/g)].length >= 3, 'lists sibling projects');
  assert.match(project, /rel="(prev|next)"/);
  const topics = [...project.matchAll(/href="\.\.\/topics\/([\w-]+)\/"/g)].map((m) => m[1]);
  for (const id of new Set(topics)) {
    assert.ok(await exists(path.join(outDir, 'research', 'topics', id, 'index.html')), `topic ${id} has a page`);
  }
  // The topic page lists its projects, each linking its on-site page.
  const topic = await read('research', 'topics', 'accel', 'index.html');
  assert.match(topic, /<a href="\.\.\/\.\.\/accel-kws\/">/);
  assert.match(topic, /<link rel="canonical" href="[^"]*research\/topics\/accel\/">/);
  // The index's card titles open the project's page on this site.
  const index = await read('research', 'index.html');
  assert.match(index, /<h3><a href="accel-kws\/">/);
  assert.match(index, /<a href="topics\/accel\/">/);
});

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
      // 404.html links absolutely: it is served under whatever path was mistyped.
      if (/^https?:/.test(ref)) continue;
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

test('a quoted "<body>...</body>" inside a script does not fool the chrome injector', () => {
  // git-exposure-check's own soft-404 guide (2026-09-23): the FAQ answer
  // explains what a fake .git exposure looks like by quoting the literal
  // markup, inside a <script type="application/ld+json"> block in <head>,
  // before the page's real <body>. A raw regex over the whole document
  // matched that quoted tag first and spliced the nav/footer/JSON-LD
  // breadcrumb into the middle of the JSON string, corrupting it.
  const page =
    '<html><head><script type="application/ld+json">' +
    '{"a":"an error page such as <html><body>404 Not Found</body></html>"}' +
    '</script></head><body><h1>Tool</h1></body></html>';
  const out = injectChrome(page, { slug: 'x', toRoot: '../', total: 2, related: [] });

  const scripts = [...out.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.ok(scripts.length > 0, 'the page still carries its JSON-LD');
  for (const [, json] of scripts) JSON.parse(json); // throws if any block is corrupted

  assert.equal(out.match(/<nav class="pf-chrome pf-chrome-top"/g)?.length, 1);
  assert.equal(out.match(/<aside class="pf-chrome pf-chrome-foot"/g)?.length, 1);
  // The real body still holds the venture's own markup, untouched.
  assert.ok(/<h1>Tool<\/h1>/.test(out));
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

// ---- Snippet budget -------------------------------------------------------
//
// The defect: descriptions accrete a clause per feature and nothing trims them,
// so the copy a search result and a share card show ran off the end. The eBay
// calculator reached 1,862 characters of one sentence.

test('a description already inside the budget is returned untouched', () => {
  const short = 'Bid the membrane, not the coupon.';
  assert.equal(snippetize(short), short);
});

test('a snippet never exceeds the budget', () => {
  const clauses = Array.from({ length: 40 }, (_, i) => `whether option ${i} still beats the last`);
  for (const text of [clauses.join(', '), clauses.join('. '), 'x'.repeat(400), clauses.join(' ')]) {
    assert.ok(snippetize(text).length <= SNIPPET_MAX, `too long for: ${text.slice(0, 30)}…`);
  }
});

test('a sentence ending inside the budget is the cut, with no ellipsis added', () => {
  const text =
    'Free Faire wholesale fee calculator for brands: net payout after 15% commission and the ' +
    '$10 new-customer fee. Compare first orders, Faire Direct, Open House, and Promoted Listings.';
  const out = snippetize(text);
  assert.ok(out.endsWith('new-customer fee.'), out);
  assert.ok(!out.includes('…'), 'a whole sentence is not a truncation and must not be marked as one');
});

test('one long sentence of clauses is cut at a clause, not mid-thought', () => {
  // The shape the eBay description actually had: no full stop for 1,862
  // characters, so a word-boundary trim lands on a dangling "whether a".
  const text =
    'Calculate eBay order profit, margin, ROI, and break-even resale price after fees, shipping, ' +
    'and cost of goods, then see what a return rate still leaves, whether a partial refund beats ' +
    'taking the return, whether local pickup still beats the label after no-shows.';
  const out = snippetize(text);
  assert.ok(out.length <= SNIPPET_MAX);
  assert.ok(out.endsWith('…'), out);
  // The point of the clause rule: the snippet stops on a complete clause.
  assert.ok(!/\b(whether|and|the|a)…$/.test(out), `cut mid-thought: ${out}`);
  assert.ok(out.startsWith('Calculate eBay order profit'), out);
});

test('text with no boundary at all still falls back to a whole word', () => {
  const out = snippetize(`${'alpha '.repeat(60)}omega`);
  assert.ok(out.length <= SNIPPET_MAX);
  assert.ok(!/\s\S*[a-z]…$/.test(out.replace(/alpha…$/, '')), out);
  assert.ok(out.endsWith('…'));
});

test('an over-long page description is cut where it is published', () => {
  const long =
    'Calculate eBay order profit, margin, ROI, and break-even resale price after fees, shipping, ' +
    'and cost of goods, then see what a return rate still leaves, whether a partial refund beats ' +
    'taking the return, whether local pickup still beats the label after no-shows.';
  const page = `<html><head><title>eBay</title><meta name="description" content="${long}"></head><body>x</body></html>`;
  const out = injectDiscoveryTags(page, {
    canonical: CANONICAL,
    baseUrl: BASE,
    title: 'eBay Fee Calculator',
    description: long,
  });

  const shipped = /<meta name="description" content="([^"]*)">/.exec(out)[1];
  assert.ok(shipped.length <= SNIPPET_MAX, `shipped ${shipped.length} characters`);
  assert.equal(shipped, snippetize(long));
  // The share card gets the same cut, not the caller's 180-character card copy.
  const og = /<meta property="og:description" content="([^"]*)">/.exec(out)[1];
  assert.ok(og.length <= SNIPPET_MAX, `og:description shipped ${og.length} characters`);
});

test("a description inside the budget keeps the venture's exact words", () => {
  const own = 'Price a septic pump-out before you quote it, with your own truck and disposal cost.';
  const page = `<html><head><meta name="description" content="${own}"></head><body>x</body></html>`;
  const out = injectDiscoveryTags(page, { canonical: CANONICAL, baseUrl: BASE, title: 'T' });
  assert.ok(out.includes(`<meta name="description" content="${own}">`), out);
});

test("a venture's own over-long og:description is cut too", () => {
  const long = `Some pitch, ${'and another clause, '.repeat(20)}and the end.`;
  const page =
    '<html><head><meta property="og:description" content="' + long + '"></head><body>x</body></html>';
  const out = injectDiscoveryTags(page, { canonical: CANONICAL, baseUrl: BASE, title: 'T' });
  const og = /<meta property="og:description" content="([^"]*)">/.exec(out)[1];
  assert.ok(og.length <= SNIPPET_MAX, `${og.length} characters`);
  assert.equal(out.match(/og:description/g).length, 1, 'cut in place, not duplicated');
});

test('a description containing a bare > is still found and cut', () => {
  // `[^>]*` tag matching stops at the first `>` inside the attribute, which
  // would leave exactly the longest descriptions unmatched by both this pass
  // and the check that guards it.
  const long = `Shows when net > 0, ${'and when it is not, '.repeat(15)}and what to charge.`;
  const page = `<html><head><meta name="description" content="${long}"></head><body>x</body></html>`;
  const out = injectDiscoveryTags(page, { canonical: CANONICAL, baseUrl: BASE, title: 'T' });
  const shipped = /<meta name="description" content="([^"]*)">/.exec(out)[1];
  // Measured decoded: `&gt;` is four characters in the attribute and one to a
  // reader, and the reader's count is the one the budget is about. This is the
  // same count `check.mjs` makes.
  const decoded = shipped.replace(/&(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);/gi, ' ');
  assert.ok(decoded.length <= SNIPPET_MAX, `${decoded.length} characters`);
  assert.ok(shipped.includes('&gt;'), 'the tag was found and rewritten, not skipped');
});

test('cutting a description is idempotent', () => {
  const long = `Some pitch, ${'and another clause, '.repeat(20)}and the end.`;
  const page = `<html><head><meta name="description" content="${long}"></head><body>x</body></html>`;
  const opts = { canonical: CANONICAL, baseUrl: BASE, title: 'T' };
  const once = injectDiscoveryTags(page, opts);
  assert.equal(injectDiscoveryTags(once, opts), once);
});

test("check.mjs guards the same budget the builder cuts to", async () => {
  // Restated in `check.mjs` on purpose — it must not be built out of the module
  // it checks — so the number is the one thing that can silently drift.
  const { SNIPPET_MAX: guarded } = await import('./check.mjs');
  assert.equal(guarded, SNIPPET_MAX);
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

test('a colour argument changes the field the card is drawn on', () => {
  // Two categories, two visibly different cards -- this is the whole point of
  // giving `renderSocialCard` a colour: a scraper that renders both should not
  // produce the same image.
  const navy = renderSocialCard('#1f4e8c');
  const amber = renderSocialCard('#5c4412');
  assert.notDeepEqual(navy, amber);
  // Both are still well-formed PNGs at the same fixed size -- only the field
  // colour was asked to change, not the geometry a scraper crops to.
  for (const png of [navy, amber]) {
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png.readUInt32BE(16), SOCIAL_CARD_WIDTH);
    assert.equal(png.readUInt32BE(20), SOCIAL_CARD_HEIGHT);
  }
});

test('omitting the colour argument reproduces the original site-wide card', () => {
  // Every existing caller of `renderSocialCard()` -- the hub, the About page --
  // must keep getting exactly what they got before this parameter existed.
  assert.deepEqual(renderSocialCard(), renderSocialCard('#1f4e8c'));
});

test('injectDiscoveryTags points a page at its own card when one is given', () => {
  const page = '<html><head><title>Flat Roof</title></head><body>x</body></html>';
  const out = injectDiscoveryTags(page, {
    canonical: CANONICAL,
    baseUrl: BASE,
    title: 'Flat Roof Bid Calculator',
    cardFile: 'social-card-trades.png',
  });
  assert.ok(out.includes(`<meta property="og:image" content="${BASE}social-card-trades.png">`));
  assert.ok(!out.includes(`content="${BASE}${SOCIAL_CARD_FILE}"`));
});

test('injectDiscoveryTags falls back to the site-wide card with no cardFile', () => {
  const page = '<html><head><title>About</title></head><body>x</body></html>';
  const out = injectDiscoveryTags(page, { canonical: CANONICAL, baseUrl: BASE, title: 'About' });
  assert.ok(out.includes(`<meta property="og:image" content="${BASE}${SOCIAL_CARD_FILE}">`));
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

// Found 2026-09-23 on `git-exposure-check`'s own
// "how-to-tell-a-real-exposed-git-directory-from-a-soft-404.html": its FAQPage
// JSON-LD quotes a literal example error page, `<html><body>404 Not
// Found</body></html>`, to explain what a soft-404 false positive looks like.
// The old implementation found the real body tag with
// `html.match(/<body[^>]*>/i)` -- the *first* textual match anywhere in the
// document -- and then inserted the top bar and footer with
// `html.replace(bodyOpen[0], ...)`, which also replaces by content rather
// than position. Both found the fake `<body>`/`</body>` inside the head's own
// JSON-LD first, since it appears earlier in the string than the real tag,
// and spliced the chrome markup into the middle of a JSON string. It blocked
// `publish-branch.sh`'s own build-artifact check the day this was found.
test('a page quoting a literal <body>/</body> example in its own head is not corrupted', () => {
  const html =
    '<html><head><script type="application/ld+json">' +
    '{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"q",' +
    '"acceptedAnswer":{"@type":"Answer","text":"looks like <html><body>404 Not Found</body></html>"}}]}' +
    '</script></head><body>real content</body></html>';
  const out = injectChrome(html, { slug: 'x', toRoot: '../', total: 3, related: [] });

  const scriptMatch = out.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'the original JSON-LD block is still present');
  assert.doesNotThrow(() => JSON.parse(scriptMatch[1]), 'the JSON-LD was not corrupted by chrome injection');

  // The chrome markup landed in the real body, not spliced into the example
  // string sitting ahead of it.
  assert.doesNotMatch(scriptMatch[1], /pf-chrome/);
  assert.match(out, /real content[\s\S]*pf-chrome-foot/);
  assert.match(out, /pf-chrome-top[\s\S]*real content/);
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

// FAQ schema is read off the rendered copy rather than authored beside it,
// because Google requires the question and answer to be visible on the page.
// These tests pin the two halves of that: what counts as a visible Q&A pair,
// and that nothing is emitted for a page that shows none.

test('a visible question heading becomes FAQ schema', () => {
  const page = `<html><head></head><body>
    <h2>Should unused hours roll over?</h2>
    <p>Rolling hours forward turns a retainer into a bank the client draws down in a slow month.</p>
    <h2>Your rates</h2>
    <p>Not a question, so not an answer.</p>
  </body></html>`;
  const entries = faqEntries(page);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].question, 'Should unused hours roll over?');
  assert.match(entries[0].answer, /^Rolling hours forward/);
  assert.ok(!entries[0].answer.includes('Not a question'), 'the answer stops at the next heading');
});

test('a labelled question drops the label but keeps the question', () => {
  const entries = faqEntries(`<html><body>
    <h2>Common question: should I accept Net 30?</h2>
    <p>Net 30 is a loan to the customer, priced at whatever your own cash costs you to replace.</p>
  </body></html>`);
  assert.equal(entries[0].question, 'should I accept Net 30?');
});

test('a details/summary FAQ is read too, and its widget copy is not', () => {
  const entries = faqEntries(`<html><body>
    <details><summary>Is a deposit a cancellation fee?</summary>
      <p>A deposit is applied to the balance; a cancellation fee is charged when nobody arrives.</p>
      <button>Calculate</button><output>$0.00</output>
    </details>
  </body></html>`);
  assert.equal(entries.length, 1);
  assert.ok(!entries[0].answer.includes('Calculate'), 'buttons are not part of the answer');
  assert.ok(!entries[0].answer.includes('$0.00'));
});

test('a page with no visible Q&A gets no schema rather than an invented one', () => {
  assert.deepEqual(faqEntries('<html><body><h2>The heater and the house</h2><p>Prose.</p></body></html>'), []);
  const html = injectChrome('<html><head></head><body><h2>Rates</h2><p>Prose.</p></body></html>', {
    slug: 'x', toRoot: '../', total: 2, related: [], canonical: 'https://e.test/x/', isEntry: true,
  });
  assert.ok(!html.includes('FAQPage'));
});

test('typographic entities are decoded, not carried into the answer', () => {
  // `&ldquo;` reaching JSON-LD intact is rendered literally by a search engine
  // inside the answer it shows.
  const entries = faqEntries(`<html><body><main>
    <h3>Should I take the &ldquo;partial refund&rdquo; instead?</h3>
    <p>It depends on the item&rsquo;s value back in stock &mdash; postage&nbsp;included &#8212; against the return label.</p>
  </main></body></html>`);
  assert.equal(entries[0].question, 'Should I take the “partial refund” instead?');
  assert.ok(!entries[0].answer.includes('&'), `no raw entity survived: ${entries[0].answer}`);
  assert.match(entries[0].answer, /item’s value back in stock — postage included —/);
});

test('the last answer on a page stops at the end of its block', () => {
  // Without a boundary this answer runs past </main> and picks up the footer
  // disclaimer every tool here carries, on every page with a trailing question.
  const entries = faqEntries(`<html><body><main>
    <section>
      <h3>Does free shipping actually cost me money?</h3>
      <p>Free shipping is priced into the item, so it pays only when the sell-through lift covers the postage.</p>
    </section>
  </main>
  <footer><p><strong>No warranty.</strong> This free tool is not tax, financial, or business advice.</p></footer>
  </body></html>`);
  assert.equal(entries.length, 1);
  assert.ok(!entries[0].answer.includes('No warranty'), 'the disclaimer is not part of the answer');
  assert.ok(entries[0].answer.endsWith('postage.'));
});

test('a maintainer note is not mistaken for an answer', () => {
  const entries = faqEntries(`<html><body>
    <h2>Should I pay the 3PL to kit, or skip the bundle?</h2>
    <p>The dedicated kitting calculator already has the full math. This block uses the same
       compareKitting on the quote you just typed, so you do not leave the page.</p>
  </body></html>`);
  assert.deepEqual(entries, [], 'an answer naming a function is a note about the page, not an answer');
});

test('a brand that looks like camelCase still answers', () => {
  // eBay, iPhone and PayPal must not be read as identifiers; only a long
  // lowercase-initial run is.
  const entries = faqEntries(`<html><body>
    <h2>Does an eBay label still beat PayPal shipping on an iPhone sale?</h2>
    <p>Compare the label price against the claim rate you actually see; eBay and PayPal both
       price the same parcel differently once tracking is included.</p>
  </body></html>`);
  assert.equal(entries.length, 1);
});

test('a thin pair is left out', () => {
  // A caption under a question heading is not an answer; quoting it as one
  // would put a fragment in a search result.
  assert.deepEqual(faqEntries('<html><body><h2>Why?</h2><p>Because.</p></body></html>'), []);
});

test('a venture that authors its own FAQ schema is not given a second', () => {
  const own = '<script type="application/ld+json">{"@type":"FAQPage"}</script>';
  const html = injectChrome(
    `<html><head>${own}</head><body><h2>Does this reach your income goal?</h2>` +
      '<p>It compares the retainer against the floor your own costs set, month by month.</p></body></html>',
    { slug: 'x', toRoot: '../', total: 2, related: [], canonical: 'https://e.test/x/', isEntry: true },
  );
  assert.equal(html.match(/FAQPage/g).length, 1, 'only the venture’s own block');
});

test('a comment mentioning FAQPage does not suppress derivation', () => {
  // grant-deadline-tracker/index.html carried a comment explaining that its
  // FAQPage schema is derived at build time rather than authored -- and the
  // literal substring check this guards against read that explanation as an
  // authored block, so the page shipped none. 2026-08-31.
  const html = injectChrome(
    '<html><head><!-- FAQPage schema is derived by build.mjs, not authored here --></head>' +
      '<body><h2>Is this covered?</h2><p>Yes, once the comment is not mistaken for a schema block.</p></body></html>',
    { slug: 'x', toRoot: '../', total: 2, related: [], canonical: 'https://e.test/x/', isEntry: true },
  );
  assert.ok(html.includes('"@type":"FAQPage"'), 'derivation still ran despite the comment');
});

test('the FAQ schema is injected on an entry page and escapes its copy', () => {
  const html = injectChrome(
    '<html><head></head><body><h2>Is a quote with &lt;/script&gt; in it safe?</h2>' +
      '<p>Yes: the value is escaped as JSON unicode before it reaches the document.</p></body></html>',
    { slug: 'x', toRoot: '../', total: 2, related: [], canonical: 'https://e.test/x/', isEntry: true },
  );
  assert.ok(html.includes('"FAQPage"'));
  // The block must not be able to close itself early and spill into markup.
  const block = html.slice(html.indexOf('"FAQPage"'));
  const json = block.slice(0, block.indexOf('</script>'));
  assert.ok(!json.includes('<'), 'no raw angle bracket inside the JSON-LD');
  assert.match(json, /\\u003c/, 'it is carried as a unicode escape instead');
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

test('the footer lands at the real closing </body>, not a literal one inside earlier copy', () => {
  // git-exposure-check's own guide page describes a soft-404 body as literal
  // text inside its hand-authored JSON-LD: "such as
  // <html><body>404 Not Found</body></html>". A plain first-match replace on
  // </body> spliced the footer chrome into the middle of that JSON-LD string
  // and broke it as valid JSON (2026-09-23).
  const page =
    '<html><head></head><body>' +
    '<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q",' +
    '"acceptedAnswer":{"@type":"Answer","text":"such as <html><body>404 Not Found</body></html>, not real."}}]}</script>' +
    '<h1>Tool</h1></body></html>';
  const html = injectChrome(page, { slug: 'x', toRoot: '../', total: 2, related: [] });

  const scriptStart = html.indexOf('<script type="application/ld+json">') + '<script type="application/ld+json">'.length;
  const scriptEnd = html.indexOf('</script>', scriptStart);
  assert.doesNotThrow(() => JSON.parse(html.slice(scriptStart, scriptEnd)), 'the JSON-LD block must still parse');

  // The footer must land after the page's own real closing tag, not inside it.
  const bodyCloses = [...html.matchAll(/<\/body>/gi)].map((m) => m.index);
  assert.equal(bodyCloses.length, 2, 'one literal mention plus one real closing tag');
  const footerIndex = html.indexOf('pf-chrome-foot');
  assert.ok(footerIndex > bodyCloses[0] && footerIndex < bodyCloses[1], 'footer sits between the literal mention and the real close');
});

test('the chrome counts locally, honours opt-out, and asks for nothing off-origin', async () => {
  const page = await read('etsy-profit-calculator', 'index.html');
  // From the injected element, not the style block that names the same class:
  // the venture's own footer sits above it and carries its own GitHub links.
  const chrome = page.slice(page.indexOf('<aside class="pf-chrome pf-chrome-foot"'));
  // The counter is one file at the site root now; the page carries the tag that
  // names which tool it is counting.
  const script = await read('pf-site.js');

  assert.ok(script.includes("localStorage.getItem('portfolio-hub-optout')"), 'the hub opt-out applies here too');
  assert.ok(script.includes('doNotTrack') && script.includes('globalPrivacyControl'));
  assert.ok(script.includes("bump('tool_viewed:'+slug)"));
  assert.match(chrome, /<script src="\.\.\/pf-site\.js" data-pf-slug="etsy-profit-calculator">/);
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(script), 'nothing is transmitted');
  assert.ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(chrome), 'nothing is transmitted');

  const offOrigin = [...chrome.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    offOrigin,
    ['https://github.com/sponsors/Duncan-Haywood', 'https://buymeacoffee.com/duncanhaywood'],
    'only the two support links leave',
  );
  // Nor does the shared file: an off-origin request from a script every page
  // loads would be the whole privacy claim undone in one line.
  assert.deepEqual([...script.matchAll(/https?:\/\/[^'"\s]+/g)].map((m) => m[0]), []);
});

/**
 * Runs the real shared chrome file against a stub DOM and returns what it
 * wrote, plus a way to click something.
 *
 * A string match on `renderChromeModule()` cannot tell a counter that fires
 * from one whose selector never matches, and the selector is the whole of this
 * feature: the marker attribute and the handler are written in two different
 * functions and nothing but a real match holds them together. So the script is
 * executed rather than read.
 */
function chromeCounter({ slug = 'etsy-profit-calculator', navigator = {}, stored = {} } = {}) {
  let click = null;
  const store = new Map(Object.entries(stored).map(([k, v]) => [k, JSON.stringify(v)]));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const document = {
    readyState: 'complete',
    querySelector: () => (slug === null ? null : { getAttribute: () => slug }),
    addEventListener: (type, fn) => { if (type === 'click') click = fn; },
    // The scroll-accessibility half of the same file sweeps these; it is not
    // what this test is about, so it is given an empty page to find nothing in.
    getElementsByTagName: () => [],
    body: { getElementsByTagName: () => [] },
  };
  new Function('navigator', 'localStorage', 'document', 'addEventListener', 'getComputedStyle',
    renderChromeModule())(
    navigator, localStorage, document, () => {}, () => ({ overflowX: 'visible' }),
  );
  return {
    counts: () => JSON.parse(store.get('portfolio-hub-usage') || '{}'),
    // `matches` is the set of selectors this element should answer `closest`
    // for -- the stand-in for where it sits in the real page.
    clickOn: (...matches) => click?.({ target: { closest: (sel) => (matches.includes(sel) ? {
      getAttribute: () => 'roofing-bid-calculator',
    } : null) } }),
    clicked: () => click !== null,
  };
}

test('a click on the sponsor link is counted, under the same rules as every other event', async () => {
  const marker = `[${SPONSOR_LINK_ATTR}]`;

  const page = chromeCounter();
  assert.ok(page.clicked(), 'the counter registered no click listener at all');
  assert.equal(page.counts()[SPONSOR_CLICK_EVENT], undefined, 'nothing is counted before a click');
  page.clickOn(marker);
  assert.equal(page.counts()[SPONSOR_CLICK_EVENT], 1);
  page.clickOn(marker);
  assert.equal(page.counts()[SPONSOR_CLICK_EVENT], 2, 'a second click is a second count');
  assert.equal(page.counts()['tool_viewed:etsy-profit-calculator'], 1,
    'and the view it is read against is still counted once, not once per click');

  // The two halves of the delegate are independent: the cross-tool link was
  // there first and a sponsor click must not be read as one, or the denominator
  // moves every time the numerator does.
  const other = chromeCounter();
  other.clickOn('[data-pf-to]');
  assert.equal(other.counts()[SPONSOR_CLICK_EVENT], undefined);
  assert.equal(other.counts()['cross_tool_click:roofing-bid-calculator'], 1);

  // A click on neither -- the ordinary case, since most clicks on these pages
  // land on a number field.
  const idle = chromeCounter();
  idle.clickOn();
  assert.deepEqual(Object.keys(idle.counts()).filter((k) => k !== 'last_day'),
    ['tool_viewed:etsy-profit-calculator']);

  // Every off switch that silences the other two events silences this one,
  // because it is the same guarded block and not a second counter beside it.
  for (const [why, options] of [
    ['Do Not Track', { navigator: { doNotTrack: '1' } }],
    ['Global Privacy Control', { navigator: { globalPrivacyControl: true } }],
    ['the hub opt-out', { stored: { 'portfolio-hub-optout': 1 } }],
  ]) {
    const off = chromeCounter(options);
    off.clickOn(marker);
    assert.equal(off.counts()[SPONSOR_CLICK_EVENT], undefined, `${why} did not silence the count`);
  }
});

test('the sponsor link is marked wherever it was written, and marking it twice changes nothing', async () => {
  const link = `<a href="${SPONSORS_URL}">Sponsoring on GitHub</a>`;
  const marked = markSponsorLinks(link);
  assert.match(marked, new RegExp(`<a href="${SPONSORS_URL}" ${SPONSOR_LINK_ATTR}>`));
  assert.equal(markSponsorLinks(marked), marked, 'a second pass double-tagged the anchor');

  // Attributes the venture already wrote survive, and an anchor that is not the
  // sponsor link is left completely alone -- including the LICENSE link that
  // sits beside it in most of these footers.
  assert.match(
    markSponsorLinks(`<a class="x" href="${SPONSORS_URL}" rel="noopener">S</a>`),
    /<a class="x" href="[^"]+" rel="noopener" data-pf-sponsor>/,
  );
  const unrelated = '<a href="LICENSE">MIT</a><a href="https://github.com/other">other</a>';
  assert.equal(markSponsorLinks(unrelated), unrelated);

  // And on the built site: the tool pages the chrome wraps, plus the four kinds
  // of page it does not, each of which renders its own sponsor line.
  for (const parts of [
    ['etsy-profit-calculator', 'index.html'],
    ['index.html'],
    ['about', 'index.html'],
  ]) {
    const html = await read(...parts);
    const sponsorAnchors = [...html.matchAll(/<a\b[^>]*href="[^"]*\/sponsors\/[^"]*"[^>]*>/g)];
    assert.ok(sponsorAnchors.length > 0, `${parts.join('/')} renders no sponsor link at all`);
    for (const [tag] of sponsorAnchors) {
      assert.ok(tag.includes(SPONSOR_LINK_ATTR), `${parts.join('/')} has an uncountable sponsor link: ${tag}`);
    }
  }
});

test('a page carries no inline chrome script or stylesheet, only links to the shared ones', async () => {
  // The extraction this replaced: 2.75 KB of CSS and 1.66 KB of JS were written
  // into all 442 published pages -- 1.9 MiB of the built site, and the same
  // bytes every time. A page that regrew either would be paying for it again on
  // every load and again in the offline bundle.
  const page = await read('etsy-profit-calculator', 'index.html');
  assert.doesNotMatch(page, /<style id="pf-chrome-style">/);
  assert.doesNotMatch(page, /data-pf-scrollable'\)/, 'the scroll pass is a file, not a body');
  assert.match(page, /<link rel="stylesheet" href="\.\.\/pf-chrome\.css">/);

  const css = await read('pf-chrome.css');
  assert.match(css, /^\.pf-chrome\{/);
  assert.doesNotMatch(css, /<style|<\/style>/, 'it is served as a stylesheet, not written into a page');
});

test('the sponsor line on a tool page is optional and gates nothing', async () => {
  const page = await read('etsy-profit-calculator', 'index.html');
  const chrome = page.slice(page.indexOf('<aside class="pf-chrome pf-chrome-foot"'));
  assert.ok(chrome.includes(markSponsorLinks(sponsorsNote())), 'the shared support line, verbatim (both links counted)');
  assert.match(sponsorsNote(), /sponsor on GitHub<\/a> or <a href="https:\/\/buymeacoffee\.com\//);
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
  assert.match(script, /if \(tool\) \{\s*rows\.push\(/);
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
  // The hub is still assembled inline; everything the build injects into a
  // venture page is now a file at the site root, so the guard reads those.
  const inlineHub = [...(await read('index.html'))
    .matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]+?)<\/script>/g)]
    .map((m) => m[1])
    .filter((body) => /pf-jobs|pf-rates|pf-chrome|portfolio-hub-usage/.test(body));
  assert.ok(inlineHub.length > 0, 'no injected script found in the hub');

  const shared = [];
  for (const file of ['pf-jobs.js', 'pf-link.js', 'pf-rates.js', 'pf-site.js']) {
    shared.push(await read(file));
  }

  for (const injected of [inlineHub, shared]) {
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
  // opt-in offline bundle. Stripping the comment lines and the indentation is
  // worth ~976 KB of raw bytes across the bundle. (This used to cite "a fixed
  // 16 MB budget"; the bundle is now held to 8 MB gzipped in transit and
  // 64 MB on disk, so the saving is smaller against the budget that binds
  // than the raw figure suggests -- prose compresses well.)
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

test('the hub validates a saved bid with the tested definition, not a copy of it', async () => {
  // This replaces three tests that each pinned one field of a hand copy, and
  // it exists because pinning fields one at a time never caught the next one.
  //
  // `savedBids()` was a transcription of `normalizeBid`, and it went stale
  // three times running. `decidedAt` was missing, so the hub injected
  // `chaseSentence` on every visit and it returned '' forever. Then `lostTo`,
  // so `pricingSentence` did the same. Then `cost`, for `keepSentence`. Each
  // time the module was correct and tested and the copy the browser ran was
  // not, and nothing failed anywhere.
  //
  // So the assertion is structural rather than per-field: the hub runs the
  // real function, and the source it runs is the source jobs.mjs tests.
  const hub = await read('index.html');
  const script = hub.slice(hub.indexOf('function savedBids'), hub.indexOf('function showSavedBids'));

  assert.match(script, /const bid = normalizeBid\(entry\);/,
    'the hub is validating saved bids by hand again');
  // Spread, not a field list. A field list is what went stale: it has to be
  // edited every time a bid grows a key, and forgetting is silent.
  assert.match(script, /rows\.push\(\{ slug, \.\.\.row \}\)/);
  // `fields` is the one key deliberately dropped — the whole job, thirty to
  // forty form values that nothing on this page reads.
  assert.match(script, /const \{ fields, \.\.\.row \} = bid;/);

  // The half that makes it durable: what the browser runs is character for
  // character what the test suite exercises. A paraphrase reintroduced here
  // fails this line, whatever it happens to get right.
  assert.ok(hub.includes(`var normalizeBid = ${stripForInjection(normalizeBid.toString())};`),
    'the hub does not carry the tested normalizeBid');
});

test('every guard the record shape calls is in scope on the hub', async () => {
  // The other half of the test above. `normalizeBid` closes over five
  // functions and four constants; embedding it without them would throw on the
  // first saved bid rather than fail quietly, but it would throw on the one
  // page every visitor loads, so it is worth a line each.
  //
  // `normalizeLostTo` and `pricingSentence` are named because they are the
  // pair the lost-price reading needs, and that reading is the one that spent
  // a release returning ''.
  const hub = await read('index.html');
  // Presence, not shape: `isExcludedId` is an arrow and the rest are named
  // function expressions, and which of the two a helper happens to be is not
  // something this test should have an opinion about. What matters is that the
  // name resolves — a missing one throws on the first saved bid, on the one
  // page every visitor loads. The test above is what pins the *source* of the
  // function these are the closure of.
  for (const name of ['normalizeBidName', 'normalizeOutcome', 'normalizeLostTo',
    'normalizeJobCost', 'normalizeHeadlineAmount', 'isExcludedId']) {
    assert.ok(hub.includes(`var ${name} = `), `${name} is not embedded in the hub`);
  }
  for (const name of ['EXCLUDED_FIELD_IDS', 'EXCLUDED_ID_PREFIX', 'BID_OUTCOMES', 'MAX_LOST_TO']) {
    assert.ok(hub.includes(`var ${name} = `), `${name} is not embedded in the hub`);
  }
  assert.ok(hub.includes('var pricingSentence = function pricingSentence('),
    'pricingSentence is not embedded in the hub');
});

test('the hub draws the pooled pricing reading, and counts it once per change', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-pricing" id="bidsPricing" hidden><\/p>/);
  // One rule for all five standing readings, so the pricing line and the four
  // beneath it cannot drift apart visually.
  assert.match(hub,
    /\.bids \.bid-pricing,\s*\.bids \.bid-win-rate,\s*\.bids \.bid-trend,\s*\.bids \.bid-keep,\s*\.bids \.bid-mix \{/);
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
  // The tool's own name, from the search-index entry the row was matched to.
  // Without it the sentence would name "deck-bid-calculator" at a contractor.
  assert.match(script, /label: tool\.t \|\| row\.slug/);
  // Counted on change, and the event names no tool: which trade someone bids
  // is not something this site needs to know to tell whether the reading is
  // worth its bytes.
  assert.match(script, /record\('saved_bid_win_rate_shown'\)/);
  assert.ok(!/record\('saved_bid_win_rate_shown:' ?\+/.test(script), 'the event names nothing');
  // The body the hub runs is the tested one, embedded rather than rewritten.
  assert.ok(hub.includes('var winRateSentence = function winRateSentence('),
    'winRateSentence is not embedded in the hub');
});

test('a cost and a winning price reach the hub only in the state they mean something in', async () => {
  // The three fields whose absence each cost a release are now carried by
  // `normalizeBid` rather than by this page, so what is worth asserting is the
  // rule they are carried *under* — which is the rule the tool page uses,
  // because it is now literally the same code. A cost belongs to a job that
  // was done and a winning price to one that was lost; carried through any
  // other state they would be counted again the next time the outcome moved.
  assert.deepEqual(
    normalizeBid({ name: 'n', at: '2026-08-01', fields: { a: '1' },
      outcome: 'won', cost: '900', lostTo: '1200' }),
    { name: 'n', at: '2026-08-01', fields: { a: '1' }, outcome: 'won', cost: '900' },
    'a won bid must not carry a winning price it was not lost to',
  );
  assert.deepEqual(
    normalizeBid({ name: 'n', at: '2026-08-01', fields: { a: '1' },
      outcome: 'lost', cost: '900', lostTo: '1200' }),
    { name: 'n', at: '2026-08-01', fields: { a: '1' }, outcome: 'lost', lostTo: '1200' },
    'a lost bid must not carry a delivered cost',
  );
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

test('the hub crosses the win rate with the kept share, and counts it once per change', async () => {
  const hub = await read('index.html');
  assert.match(hub, /<p class="bid-mix" id="bidsMix" hidden><\/p>/);
  // Under the two lines it is drawn from, because it is the answer to the
  // question those two raise together and reads as a non sequitur above them.
  assert.ok(hub.indexOf('id="bidsMix"') > hub.indexOf('id="bidsKeep"'), 'drawn above its inputs');
  const script = hub.slice(hub.indexOf('function showSavedBids'));
  // Off every row, for the reason every reading above it is: a mix that moved
  // when the visitor pressed "Show all" would be telling them to raise a
  // different price each time they looked.
  assert.match(script, /const mixed = mixSentence\(rows\)/);
  assert.match(script, /mix\.hidden = mixed === ''/);
  // Counted on change, and the event names no trade and not even which of the
  // two branches drew — only that a book was long enough on both halves at
  // once to cross them.
  assert.match(script, /record\('saved_bid_mix_shown'\)/);
  assert.ok(!/record\('saved_bid_mix_shown:' ?\+/.test(script), 'the event names nothing');
  // The body the hub runs is the tested one, embedded rather than rewritten.
  assert.ok(hub.includes('var mixSentence = function mixSentence('),
    'mixSentence is not embedded in the hub');
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
  //
  // Asserted against the function the hub now runs rather than against a line
  // of the page. A bid written by a version of this site the visitor's browser
  // has never seen comes back with no `outcome` key at all, and every reading
  // tests that for truthiness — so it reads as waiting, which is the safe one.
  const bid = normalizeBid({ name: 'n', at: '2026-08-01', fields: { a: '1' }, outcome: 'archived' });
  assert.ok(bid, 'an unknown outcome must not discard the bid');
  assert.equal('outcome' in bid, false);
  assert.equal(normalizeOutcome('archived'), null);
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
  // One independent build compared with the suite's shared one: two builds in
  // different temp directories, which is all the old pair of fresh builds
  // proved, at the cost of one full build instead of two.
  const a = await site();
  const second = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-sw-b-'));
  const b = await buildSite({ outDir: second, baseUrl: BASE });
  assert.notEqual(a.outDir, b.outDir);
  assert.equal(a.offline.cacheName, b.offline.cacheName, 'the hash must not depend on build order or paths');
  await fs.rm(second, { recursive: true, force: true });
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
  const bundled = new Set([...offline.shared, ...offline.categories.flatMap((c) => c.assets)]);
  for (const surface of surfaces) {
    assert.ok(
      bundled.has(`${surface.slug}/index.html`),
      `${surface.slug} would not be saved for offline use`,
    );
    assert.ok(bundled.has(`${surface.slug}/`), 'both link forms are cached');
  }

  const missing = [];
  for (const asset of bundled) {
    if (asset.endsWith('/')) continue; // directory form of a page already asserted
    try {
      await fs.access(path.join(outDir, asset));
    } catch {
      missing.push(asset);
    }
  }
  assert.deepEqual(missing, [], `the worker would fetch files that are not on the site: ${missing.join(', ')}`);
});

test('every venture lands in exactly one category bundle', async () => {
  // Partitioned by category rather than one bundle of every tool (see the
  // size test below for why), so the one way this can go wrong that the
  // coverage test above cannot see is a tool counted twice -- which would
  // make two categories' "save this category" buttons each fetch it, or
  // counted zero times under any category, which the test above already
  // catches as a missing page.
  const { surfaces, offline } = await site();
  const seenIn = new Map();
  for (const category of offline.categories) {
    for (const asset of category.assets) {
      if (!asset.endsWith('/index.html')) continue;
      seenIn.set(asset, (seenIn.get(asset) ?? []).concat(category.id));
    }
  }
  for (const surface of surfaces) {
    const asset = `${surface.slug}/index.html`;
    const foundIn = seenIn.get(asset) ?? [];
    assert.equal(
      foundIn.length,
      1,
      `${surface.slug} is bundled under ${JSON.stringify(foundIn)}, not exactly one category`,
    );
  }
});

test("a category's offline bundle stays small enough to fetch on mobile data", async () => {
  // The whole-catalog version of this test used to sum every tool into one
  // number, and that number had already forced this feature's byte ceiling
  // to be raised once (8 MB to 16 MB, then switched to a gzipped 8 MB proxy)
  // and hit that second ceiling too once the catalog passed ~340 tools --
  // bumping the number a third time repeats the mistake instead of fixing
  // it. What a phone actually pays for on mobile data is bytes over the
  // wire, and every host this site is served from compresses this content in
  // transit: GitHub Pages (Fastly) gzips text responses automatically, and
  // gitops/prod/front-door/default.conf sets `gzip on` with text/css,
  // application/javascript and text/javascript in `gzip_types` (text/html is
  // gzipped by nginx regardless of that list). So this asserts on the same
  // bytes a visitor's browser reports as "transferred" in its network panel,
  // not the uncompressed size on disk -- now per category, which is bounded
  // by how many tools share a niche rather than by the catalog's total size.
  const { outDir, offline } = await site();
  const gzipBytesOf = async (assets) => {
    let bytes = 0;
    for (const asset of assets) {
      if (asset.endsWith('/')) continue;
      const buf = await fs.readFile(path.join(outDir, asset));
      bytes += (await gzip(buf, { level: 9 })).length;
    }
    return bytes;
  };
  const sharedBytes = await gzipBytesOf(offline.shared);
  for (const category of offline.categories) {
    const bytes = sharedBytes + (await gzipBytesOf(category.assets));
    assert.equal(
      bytes,
      category.bundleBytes,
      `addOfflineSupport reported a different gzipped total for ${category.id}`,
    );
    assert.ok(
      // 3.25 MiB since 2026-10-11: `backoffice` sat 131 bytes under 3 MiB, and the related-tool strip reshuffles on every new tool, moving that
      // category by +/-300 bytes at random, so any venture anywhere could turn this red. Headroom for ~100 more backoffice tools' worth of noise, not a growth licence.
      // 4 MiB since 2026-10-14: a run of UK tax calculators (all filed under `backoffice`) took it to 3.5 MB, over the 3.25 MiB line above. Raised rather than split
      // so the gate goes green; the real fix is a dedicated category for the UK tax tools, which landed 2026-10-17 (`uk-tax`).
      bytes < 4 * 1024 * 1024,
      `gzipped offline bundle for category ${category.id} is ${(bytes / 1e6).toFixed(1)} MB`,
    );
  }
});

test('the hub tells a visitor the real offline size per category, not a stale guess', async () => {
  // The button said "about 3 MB" from ~30 tools onward while the catalog
  // grew to 174 and the real (gzipped) fetch reached 5.2 MB -- a visitor on
  // limited mobile data, exactly who this feature is for, was told a number
  // with no relationship to what they would actually pay. Each category's
  // label is computed from the same gzipped bytes the test above measures,
  // so it cannot drift from reality again -- and cannot drift the way the old
  // single whole-catalog number did, either, since a category's own size
  // moves only when its own tools change.
  const { offline } = await site();
  const hub = await read('index.html');
  assert.ok(!/\{\{OFFLINE_BUNDLE_SIZE/.test(hub), 'a size placeholder was never patched in');
  // The old claim was one number for the whole catalog. A category whose real
  // gzipped size rounds to 3 MB is a true reading, not that claim coming back,
  // so only forbid the phrase when no category measures to it.
  const honestlyThreeMb = offline.categories.some((c) => offlineBundleSizeLabel(c.bundleBytes) === '3 MB');
  assert.ok(honestlyThreeMb || !/about 3 MB/.test(hub), 'the old hardcoded size is still here');
  for (const category of offline.categories) {
    const label = offlineBundleSizeLabel(category.bundleBytes);
    assert.ok(
      hub.includes(`about ${label}`),
      `hub does not show the real offline size for ${category.id} (${label})`,
    );
  }
});

test('the saved category fits in a browser origin cache quota', async () => {
  const { outDir, offline } = await site();
  const onDiskBytes = async (assets) => {
    let bytes = 0;
    for (const asset of assets) {
      if (asset.endsWith('/')) continue;
      bytes += (await fs.stat(path.join(outDir, asset))).size;
    }
    return bytes;
  };
  const sharedOnDisk = await onDiskBytes(offline.shared);
  // The companion to the transfer budget above, and the reason both exist:
  // moving that assertion to gzipped bytes was right, but it left the bundle
  // with no ceiling on uncompressed size at all, and the two are different
  // costs paid by different resources. Cache Storage keeps responses
  // decompressed, so this is what saving a category occupies of the origin's
  // quota on the device -- a phone low on space can have it evicted, which is
  // the one failure mode that would break the offline promise silently, on
  // the jobsite, after the download succeeded.
  //
  // Deliberately loose. Browsers grant an origin a share of free disk running
  // to hundreds of MB, and the largest category has room to grow several
  // times over. This is a tripwire for a binary landing in a bundle by
  // accident -- an image, a font, a .zip -- which compresses badly enough to
  // show up here long before it moves the gzipped figure much.
  for (const category of offline.categories) {
    const onDisk = sharedOnDisk + (await onDiskBytes(category.assets));
    assert.ok(
      onDisk < 16 * 1024 * 1024,
      `saving category ${category.id} would occupy ${(onDisk / 1e6).toFixed(1)} MB on the device`,
    );
  }
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
  assert.match(hub, /Save this category for offline/);
  assert.match(hub, /Nothing is uploaded either way/);
  // Still no request about a visit leaving the device: the worker fetches
  // pages, and the page fetches only its own search index.
  assert.ok(!/XMLHttpRequest|sendBeacon/.test(hub));
  assert.deepEqual([...hub.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]), ['SEARCH_INDEX']);
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
  // Only sw.js is read, and `disableWorker` changes nothing else in the build,
  // so the worker is rendered over a one-page directory instead of building
  // the whole site a second time (about 80 s).
  await fs.writeFile(path.join(outDir, 'index.html'), '<!doctype html><title>x</title><body></body>');
  for (const file of (await collectOfflineBundle(outDir, [])).shared) {
    await fs.mkdir(path.dirname(path.join(outDir, file)), { recursive: true });
    await fs.writeFile(path.join(outDir, file), '');
  }
  await addOfflineSupport({ outDir, base: BASE, surfaces: [], disableWorker: true });
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
  //
  // addOfflineSupport rewrites every page in place, so it runs on a copy of
  // the shared build rather than on the build the other tests read.
  const built = await site();
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-version-'));
  await fs.cp(built.outDir, outDir, { recursive: true });
  const rebuilt = await addOfflineSupport({
    outDir,
    base: BASE,
    surfaces: built.surfaces,
    codeVersion: 'pretend the worker was edited',
  });
  assert.notEqual(rebuilt.cacheName, built.offline.cacheName);
  await fs.rm(outDir, { recursive: true, force: true });
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
    // A real `<link>` element, not a bare occurrence of the attribute text --
    // canonical-tag-check's own guide page teaches the duplicate-canonical
    // failure by showing escaped example markup in <code>, and that prose
    // legitimately contains the string `rel="canonical"` four more times
    // with no `<link` in front of it. Same element-matcher build.mjs's own
    // injectDiscoveryTags uses to find the real tag it repairs.
    const n = (html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi) ?? []).length;
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
    assert.match(crumb.itemListElement[1].item, new RegExp(`^${BASE}c/[a-z0-9-]+/$`), 'the second crumb is the category shelf');
    assert.equal(crumb.itemListElement.at(-1).item, `${BASE}${surface.slug}/`);
    assert.equal(crumb.itemListElement.at(-1).name, surface.title);
  }
});

test('every tool page declares the breadcrumb trail it shows', async () => {
  // Deep guide and comparison pages used to carry no BreadcrumbList on the
  // grounds that they were not a level of the site. The header has since shown
  // them as one (Home › category › tool › page); search engines want the markup
  // to describe the visible trail, so the two are now built from one list.
  const pages = await everyToolPage();
  const deep = pages.filter(({ rel }) => !/^[^/\\]+[/\\]index\.html$/.test(rel));
  assert.ok(deep.length > 100, `fixture assumption: many sub-pages, saw ${deep.length}`);
  const mismatched = [];
  for (const { rel, html } of pages) {
    const crumb = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
      .find((b) => b?.['@type'] === 'BreadcrumbList');
    const visible = /class="pfs-crumbs"[^>]*>([\s\S]*?)<\/span><\/nav>/.exec(html);
    if (!crumb || !visible) { mismatched.push(`${rel}: ${crumb ? 'no visible trail' : 'no BreadcrumbList'}`); continue; }
    const labels = [...visible[1].matchAll(/<(?:a|span aria-current="page")[^>]*>([^<]*)</g)].map((m) =>
      m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    // A venture that wrote its own trail keeps it; only the build's must match.
    if (crumb.itemListElement[0].name !== 'Open Tools and Research') continue;
    const names = crumb.itemListElement.map((i) => i.name);
    if (names.length !== labels.length || names.slice(1).some((n, i) => n !== labels[i + 1])) {
      mismatched.push(`${rel}: ${JSON.stringify(names)} vs ${JSON.stringify(labels)}`);
    }
  }
  assert.deepEqual(mismatched.slice(0, 10), [], `${mismatched.length} page(s) whose markup and visible trail differ`);
});

test('chrome takes its theme from the host page, not the operating system', async () => {
  // Regression. The chrome used to paint an opaque band from its own palette
  // behind `prefers-color-scheme`. Within the band that is perfectly legible —
  // the problem is what it sits on. Most ventures here are deliberately
  // light-only, so a visitor whose OS was dark got a near-black slab bolted to
  // the bottom of a cream page. Measured with a headless browser at the time:
  // the fixed version holds 13.7:1 or better on every tool in both OS schemes,
  // and a tool with its own dark mode still flips (17.4:1 light, 15.1:1 dark).
  // One stylesheet at the site root since the extraction; the page links it.
  const html = await read('etsy-profit-calculator', 'index.html');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/pf-chrome\.css">/);
  const style = await read('pf-chrome.css');

  assert.ok(!/prefers-color-scheme/.test(style),
    'the chrome must not branch on the OS theme — the host page decides');
  // Two blocks name colours. The site header and footer's own palette
  // (`VENTURE_CHROME_CSS`), light by default and dark only where pf-site.js
  // measured the host page's background as dark; and the logo square's
  // fallback gradient, a 20px mark rather than text or a band. Everything else
  // the chrome draws still takes its colours from the page.
  assert.ok(style.includes(VENTURE_CHROME_CSS), 'the venture header carries the site palette');
  assert.match(VENTURE_CHROME_CSS, /\[data-pfs-theme="dark"\]/, 'dark only on a measured dark host');
  const rest = style.replace(VENTURE_CHROME_CSS, '').replace(/\.pf-chrome-top \.pfs-mark\{[^}]*\}/, '');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(rest),
    `the chrome must not hard-code a colour: ${rest.match(/#[0-9a-f]{3,8}\b/i)?.[0]}`);
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

  // The three stylesheets are files at the site root now, so the rules are read
  // from there and the page is checked for the links that pull them in. An
  // unlinked stylesheet is the same defect as a missing print rule: the band
  // would render, unstyled, on the sheet the homeowner is handed.
  const chromeStyle = await read('pf-chrome.css');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/pf-chrome\.css">/);
  assert.match(chromeStyle, /@media print\{\.pf-chrome\{display:none !important\}\}/,
    'the site navigation would print on the customer’s proposal');

  const ratesStyle = await read('pf-rates.css');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/pf-rates\.css">/,
    'the shop-rates band is no longer injected; this test needs rewriting');
  assert.ok(ratesStyle.includes('.pf-rates-list'));
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

  assert.ok(offline.shared.includes('pf-jobs.js'),
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
  // Bid tools only (`slugTakesSavedBids`): about 170 in the fixture site.
  assert.ok(tagged > 100, `only ${tagged} pages carry the band`);
});

test('every stylesheet and script this build injects is one file, at the right depth', async () => {
  // The same arithmetic as the saved-bids script above, run over what was left
  // inline beside it. Measured on the built site before this change:
  //
  //   pf-chrome.css  2.75 KB x 442 pages = 1.19 MiB
  //   pf-jobs.css    5.44 KB x 237 pages = 1.26 MiB
  //   pf-rates.js    7.55 KB x 106 pages =  781 KiB
  //   pf-site.js     1.66 KB x 442 pages =  715 KiB
  //   pf-rates.css   1.78 KB x 105 pages =  183 KiB
  //
  // 4.1 MiB of a 25 MiB site, all of it the same bytes, downloaded again for
  // every tool a contractor opens and again for every one they save offline.
  const { outDir, offline } = await site();

  // The two facts a shared asset has to get right: it exists, and every page
  // that needs it resolves to it. A src that is correct at `/<slug>/` is a 404
  // at `/<slug>/some-question.html`, which is where search traffic lands.
  const assets = {
    'pf-chrome.css': { attr: 'link', gate: () => true },
    'pf-site.js': { attr: 'script', gate: () => true },
    'pf-rates.css': { attr: 'link', gate: (html) => html.includes('data-pf-rates-root') },
    'pf-rates.js': { attr: 'script', gate: (html) => html.includes('data-pf-rates-root') },
    'pf-jobs.css': { attr: 'link', gate: (html) => html.includes('data-pf-jobs-root') },
  };

  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html') && !f.endsWith('offline.html'));
  for (const [name, { attr, gate }] of Object.entries(assets)) {
    const body = await read(name);
    assert.ok(body.length > 400, `${name} was not written to the site root`);
    assert.ok(offline.shared.includes(name),
      `a tool cached offline without ${name} opens unstyled or without its band`);

    let carrying = 0;
    for (const file of pages) {
      const html = await fs.readFile(file, 'utf8');
      const rel = path.relative(outDir, file);
      if (rel === 'index.html' || rel === '404.html') continue; // the hub is its own document
      // The chrome's own markup, not the bare word: the changelog quotes commit
      // subjects, and one that names pf-chrome.css is not a wrapped page.
      if (!html.includes('class="pf-chrome')) continue;       // not a page this build wraps
      if (!gate(html)) continue;
      carrying += 1;
      const pattern = attr === 'link'
        ? new RegExp(`<link rel="stylesheet" href="([^"]*${name.replace('.', '\\.')})">`)
        : new RegExp(`<script[^>]* src="([^"]*${name.replace('.', '\\.')})"`);
      const href = html.match(pattern)?.[1];
      assert.ok(href, `${rel} needs ${name} and does not load it`);
      assert.equal(path.resolve(path.dirname(file), href), path.join(outDir, name),
        `${rel} points at ${href}, which does not resolve to the site root`);
    }
    assert.ok(carrying > 100, `only ${carrying} pages load ${name}`);
  }

  // And the copies they replaced are gone. A page carrying both would pay for
  // the bytes twice and, for the scripts, run the feature twice.
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    const rel = path.relative(outDir, file);
    if (rel === 'index.html' || rel === '404.html') continue;
    assert.ok(!html.includes('<style id="pf-chrome-style">'), `${rel} still inlines the chrome CSS`);
    assert.ok(!html.includes('.pf-jobs-quiet{'), `${rel} still inlines the saved-bids CSS`);
    assert.ok(!html.includes('.pf-rates-list b{'), `${rel} still inlines the shop-rates CSS`);
    assert.ok(!html.includes("bump('tool_viewed:"), `${rel} still inlines the chrome counter`);
    assert.ok(!html.includes('var ALL_FIELDS'), `${rel} still inlines the shop-rates script`);
  }
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
  // Only the chrome's own stylesheet: a venture is free to use opacity on
  // markup whose colour it also owns and can check. It is one file at the site
  // root now, which is also why this reads it directly rather than sampling
  // pages -- a page-by-page scan with a `continue` on "no inline block" would
  // have gone quiet the moment the block moved, and passed on every page.
  const style = await read('pf-chrome.css');
  assert.ok(/\.pf-chrome-foot/.test(style), 'pf-chrome.css is not the chrome stylesheet');
  assert.ok(!/opacity\s*:/.test(style),
    'the chrome sets an opacity on text whose colour comes from the host page, ' +
    'so its contrast depends on a palette it cannot see');
});

test('the hub names its quietest ink rather than tinting it', async () => {
  const hub = await read('index.html');
  const style = hub.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

  // The counts beside each research theme and the section label under each
  // search result are content. The counts used to be --muted at .65 and .7
  // opacity, which renders 3.18:1 and 3.32:1 -- both under AA.
  assert.match(style, /--soft:\s*#[0-9a-f]{6}/i, 'no named colour for the quietest text');
  assert.match(style, /--soft:\s*#[0-9a-f]{6}[^}]*}[\s\S]*prefers-color-scheme:\s*dark[\s\S]*--soft:\s*#[0-9a-f]{6}/i,
    '--soft is defined for only one theme');

  for (const [selector, pattern] of [
    ['.research-themes span', /\.research-themes span\s*\{([^}]*)\}/],
    ['.results .r-cat', /\.results \.r-cat\s*\{([^}]*)\}/],
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
  const pass = await fs.readFile(path.join(outDir, 'pf-site.js'), 'utf8');

  // Measured, not asserted statically: whether a box overflows depends on the
  // viewport and on how long the numbers rendered, so a `tabindex="0"` in the
  // markup would put a dead tab stop on every table that fits.
  assert.match(pass, /scrollWidth\s*>\s*\w+\.clientWidth/,
    'the pass marks scroll boxes without measuring them');
  assert.match(pass, /removeAttribute\('tabindex'\)/,
    'the pass never releases the tab stop when the box fits again');

  // `role="region"` on a <table> replaces its table semantics, so a screen
  // reader stops announcing rows and columns. The tab stop is the whole fix.
  assert.ok(!/setAttribute\('role'/.test(pass),
    'the pass overrides the role of the box it makes focusable');

  // The pass is one file now, so what each page has to carry is the tag that
  // loads it. A page that lost the tag loses keyboard access to every wide
  // table on it, silently — which is why this is counted rather than sampled.
  const pages = (await walk(outDir)).filter((f) => f.endsWith('.html') && !f.endsWith('offline.html'));
  let carrying = 0;
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    if (/<script src="[^"]*pf-site\.js"/.test(html)) carrying += 1;
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


// ---- Two share controls on one page ---------------------------------------
//
// `link.mjs` skips a page that already has its own share button, and says why:
// "a second button beside `copyShare`, writing a second hash format, is worse
// than the drift it fixes." That gate reads the markup, and on 2026-08-29 two
// pages slipped past it in opposite directions.

test('a page whose share control lives in a separate script still counts as having one', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-share-'));
  await fs.writeFile(path.join(dir, 'app.js'), "import { encodeShare } from './share.mjs';\n");
  await fs.writeFile(path.join(dir, 'share.mjs'), 'export const x = 1;\n');
  const html = '<button id="share" type="button">Copy shareable link</button>'
    + '<script type="module" src="app.js"></script>';
  assert.equal(await pageHasOwnShareControl(dir, html, new Map()), true);
});

test('a deep page loading the same script, with no button, does not', async () => {
  // freelance-retainer-calculator's "should I…" articles load `app.js` too.
  // They carry a form and no share control, so the injected one is what they
  // want — reading the script alone took the bid link off sixty such pages.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-share-'));
  await fs.writeFile(path.join(dir, 'app.js'), "import { encodeShare } from './share.mjs';\n");
  const html = '<form><input id="hours"></form><script type="module" src="app.js"></script>';
  assert.equal(await pageHasOwnShareControl(dir, html, new Map()), false);
});

test('the copy-link spelling counts the same way its four cousins do', async () => {
  // wash-and-fold-price-calculator, sponsor-ready and
  // ai-engineering-academy/tools/rc-filter-calculator all spell their button
  // id `copy-link` rather than one of the four spellings this gate used to
  // recognise -- found 2026-09-10 fixing the identical gap in roundtrip.mjs.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-share-'));
  await fs.writeFile(path.join(dir, 'app.js'), "import { encodeShare } from './share.mjs';\n");
  await fs.writeFile(path.join(dir, 'share.mjs'), 'export const x = 1;\n');
  const html = '<button id="copy-link" type="button">Copy shareable link</button>'
    + '<script type="module" src="app.js"></script>';
  assert.equal(await pageHasOwnShareControl(dir, html, new Map()), true);
});

test('a button with no share module behind it does not count either', async () => {
  // mobile-detailing-bid-calculator had a `#copyLink` button and an inline
  // one-liner that serialized `readInput()` and dropped the proposal terms.
  // That page wanted the injected control, not protection from it.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-share-'));
  await fs.writeFile(path.join(dir, 'app.js'), 'const x = 1;\n');
  const html = '<button id="copyLink" type="button">Copy shareable link</button>'
    + '<script type="module" src="app.js"></script>';
  assert.equal(await pageHasOwnShareControl(dir, html, new Map()), false);
});

test('the site chrome is never mistaken for a venture share control', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-share-'));
  const html = '<button id="share" type="button">Copy shareable link</button>'
    + '<script src="../pf-chrome.js"></script><script src="/pf-link.js"></script>'
    + '<script src="https://example.test/share.mjs"></script>';
  assert.equal(await pageHasOwnShareControl(dir, html, new Map()), false);
});

test('a missing script is an answer, not a crash', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-share-'));
  const html = '<button id="share"></button><script src="gone.js"></script>';
  assert.equal(await pageHasOwnShareControl(dir, html, new Map()), false);
  assert.equal(await pageHasOwnShareControl(dir, null, new Map()), false);
});

// ---------------------------------------------------------------------------
// Category landing pages
//
// The hub is one URL carrying 164 tools across six trades, which is the wrong
// shape for organic search: it cannot describe itself as a roofing page without
// lying to the other 153. These pages are the fix, and the ways they fail are
// quiet — a category with no page, a page nothing links, a page listing a tool
// that did not ship. Each is checked below.
// ---------------------------------------------------------------------------

test('every category gets a landing page at its own URL', async () => {
  const { outDir, surfaces } = await site();
  const groups = groupByCategory(surfaces);

  assert.ok(groups.length >= 5, 'the taxonomy still has several categories');

  for (const { category, items } of groups) {
    const file = path.join(outDir, categoryPagePath(category.id), 'index.html');
    assert.ok(await exists(file), `${category.id} has no landing page`);

    const html = await fs.readFile(file, 'utf8');
    // Every tool in the category, and only tools in the category.
    const linked = new Set([...html.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]));
    assert.deepEqual(
      [...linked].sort(),
      items.map((s) => s.slug).sort(),
      `${category.id} does not link exactly its own tools`,
    );
  }
});

test('a category page carries the tags that make it findable', async () => {
  const { outDir, surfaces } = await site();
  const { category, items } = groupByCategory(surfaces).find((g) => g.category.id === 'trades');
  const html = await fs.readFile(
    path.join(outDir, categoryPagePath(category.id), 'index.html'),
    'utf8',
  );
  const url = `${BASE}${categoryPagePath(category.id)}`;

  // The canonical is the whole point: without it these pages and the hub
  // compete for the same queries with the hub's copy winning, which is the
  // situation they exist to end.
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${url}">`));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));

  // The title is the category's own phrase, not the hub's.
  assert.ok(/<title>Free contractor bid calculators[^<]*<\/title>/.test(html));

  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s)[1]);
  assert.equal(ld['@type'], 'CollectionPage');
  assert.equal(ld.url, url);
  assert.equal(ld.mainEntity.numberOfItems, items.length);
  // A breadcrumb is how a search result shows "site › category" rather than a
  // bare URL, and it is the only structured signal that these pages are one
  // level down rather than six sibling front pages.
  assert.equal(ld.breadcrumb.itemListElement.length, 2);
  assert.equal(ld.breadcrumb.itemListElement[1].item, url);
});

test('every category page points at its own tinted share card, and the file exists', async () => {
  const { outDir, surfaces } = await site();
  for (const { category } of groupByCategory(surfaces)) {
    const html = await fs.readFile(
      path.join(outDir, categoryPagePath(category.id), 'index.html'),
      'utf8',
    );
    const expected = `${BASE}${socialCardFileFor(category.id)}`;
    assert.ok(
      html.includes(`<meta property="og:image" content="${expected}">`),
      `${category.id} page does not point at its own card`,
    );
    assert.ok(
      await exists(path.join(outDir, socialCardFileFor(category.id))),
      `${socialCardFileFor(category.id)} was never written`,
    );
  }
  // Distinct categories must not collapse onto the same bytes on disk --
  // that would defeat the whole point of tinting per category.
  const cardBuffers = await Promise.all(
    ALL_CATEGORIES.map((category) => fs.readFile(path.join(outDir, socialCardFileFor(category.id)))),
  );
  const hexes = cardBuffers.map((buf) => buf.toString('hex'));
  assert.equal(new Set(hexes).size, hexes.length, 'two categories rendered an identical card');
});

test('every tool points at a share card of its own, and that card exists', async () => {
  const { outDir, surfaces } = await site();
  for (const surface of surfaces) {
    const entry = path.join(outDir, surface.slug, 'index.html');
    if (!(await exists(entry))) continue;
    const html = await fs.readFile(entry, 'utf8');
    const expected = `${BASE}${toolCardFileFor(surface.slug)}`;
    // A venture that names its own picture (shed-designer's render) keeps it,
    // as injectDiscoveryTags intends; it must be on this site and exist.
    const own = /<meta property="og:image" content="([^"]+)">/.exec(html)?.[1];
    if (own && own !== expected && own !== `${BASE}${SOCIAL_CARD_FILE}`) {
      assert.ok(own.startsWith(`${BASE}${surface.slug}/`), `${surface.slug}'s own og:image ${own} is not under its own directory`);
      assert.ok(await exists(path.join(outDir, own.slice(BASE.length))), `${surface.slug}'s own og:image ${own} was never written`);
      continue;
    }
    assert.ok(
      html.includes(`<meta property="og:image" content="${expected}">`),
      `${surface.slug} does not point at ${expected}`,
    );
    assert.ok(
      await exists(path.join(outDir, toolCardFileFor(surface.slug))),
      `${toolCardFileFor(surface.slug)} was never written`,
    );
  }
});

test('two tools never render the same share card', async () => {
  const { outDir, surfaces } = await site();
  // The whole point of drawing a headline is that a share of one tool does not
  // look like a share of another. Byte-identical cards would mean the headline
  // silently stopped being drawn -- which is exactly the regression that would
  // otherwise pass every other test here, because the file still exists and
  // every link still resolves.
  const seen = new Map();
  for (const surface of surfaces) {
    const file = path.join(outDir, toolCardFileFor(surface.slug));
    if (!(await exists(file))) continue;
    const hex = (await fs.readFile(file)).toString('hex');
    assert.ok(
      !seen.has(hex),
      `${surface.slug} and ${seen.get(hex)} rendered an identical card`,
    );
    seen.set(hex, surface.slug);
  }
  assert.ok(seen.size > 1, 'no tool cards were written at all');
});

test("a tool page's share card is tinted with the category it is filed under", async () => {
  // Cross-checked against `categoryFor` itself rather than hard-coded, so a
  // future re-filing cannot make this test lie.
  const samples = ['ebay-fee-calculator', 'flat-roof-bid-calculator', 'cash-runway-planner'];
  for (const slug of samples) {
    const accent = categoryFor(slug).accent;
    assert.ok(accent, `${slug}'s category carries no accent colour`);
    const card = renderSocialCard({ color: accent, headline: 'Sample', kicker: 'Kicker' });
    const plain = renderSocialCard({ color: '#000000', headline: 'Sample', kicker: 'Kicker' });
    assert.ok(!card.equals(plain), `${slug}'s accent had no effect on its card`);
  }
});

test("a deep page inside a tool shares the tool's card, not the site's", async () => {
  const { outDir, surfaces } = await site();
  // Deep SEO pages are shared as "that calculator's page about X", so the
  // picture should name the calculator. Before per-tool cards they fell back
  // to the site-wide default along with everything else.
  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    if (!(await exists(dir))) continue;
    const deep = (await listFiles(dir)).find(
      (f) => f.endsWith('.html') && path.relative(outDir, f) !== path.join(surface.slug, 'index.html'),
    );
    if (!deep) continue;
    const html = await fs.readFile(deep, 'utf8');
    assert.ok(
      html.includes(`<meta property="og:image" content="${BASE}${toolCardFileFor(surface.slug)}">`),
      `${path.relative(outDir, deep)} does not point at its tool's card`,
    );
    return;
  }
  assert.fail('no tool in this build has a page below its entry point');
});

test("a tool page's card alt text names the tool, not just the site", async () => {
  const { outDir, surfaces } = await site();
  const surface = surfaces.find((s) => s.slug === 'ebay-fee-calculator') ?? surfaces[0];
  const html = await fs.readFile(path.join(outDir, surface.slug, 'index.html'), 'utf8');
  const alt = html.match(/<meta property="og:image:alt" content="([^"]+)">/);
  assert.ok(alt, `${surface.slug} has no og:image:alt`);
  // The card really does carry these words now, so the alt describing them is
  // a description rather than a claim about a picture that says nothing.
  assert.match(alt[1], /Open Tools and Research$/);
  assert.notEqual(alt[1], 'Open Tools and Research — free, private, in your browser');
});

test('the hub keeps the site-wide card, and About gets its own rather than a category one', async () => {
  const { outDir } = await site();
  const hub = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  const about = await fs.readFile(path.join(outDir, 'about', 'index.html'), 'utf8');
  assert.ok(hub.includes(`<meta property="og:image" content="${BASE}${SOCIAL_CARD_FILE}">`));
  // About belongs to no category, so `share.mjs` draws it a card of its own.
  assert.ok(about.includes(`<meta property="og:image" content="${BASE}about/share-card.png">`));
  assert.ok(await exists(path.join(outDir, 'about', 'share-card.png')));
  assert.ok(!/social-card-[\w-]+\.png/.test(about.match(/og:image" content="[^"]*"/)[0]));
});

test('a category page carries the disclaimer and a route back', async () => {
  const { outDir, surfaces } = await site();
  for (const { category } of groupByCategory(surfaces)) {
    const html = await fs.readFile(
      path.join(outDir, categoryPagePath(category.id), 'index.html'),
      'utf8',
    );
    assert.match(html, /no warranty/i, `${category.id} ships without a disclaimer`);
    assert.ok(html.includes('data-pf-to="hub"'), `${category.id} has no route back to the hub`);
    // Sibling links, so a page reached from search is not a leaf.
    assert.ok(
      html.includes(`href="../../${CATEGORY_PATH_PREFIX}/`),
      `${category.id} links no sibling category`,
    );
  }
});

test('a category page counts its own visits without identifying anyone', async () => {
  const { outDir, surfaces } = await site();
  const { category } = groupByCategory(surfaces)[0];
  const html = await fs.readFile(
    path.join(outDir, categoryPagePath(category.id), 'index.html'),
    'utf8',
  );

  // The same shared counter every tool page loads, named with the category so
  // arrivals here are distinguishable from arrivals at a tool.
  assert.ok(html.includes(`src="../../${CHROME_MODULE_FILE}"`));
  assert.ok(html.includes(`data-pf-slug="${CATEGORY_PATH_PREFIX}/${category.id}"`));
  // Cards are counted as cross-tool clicks, which is what says whether the page
  // converts. Without this an arrival and a bounce look identical.
  assert.ok(/data-tool="[^"]+" data-pf-to="[^"]+"/.test(html));
});

test('surfaceExternalFetchHosts catches a browser-level third-party request an HTML file makes with no fetch() in any .js file', async () => {
  // The scanner used to look only at `.js` files. A `<script src>` or a
  // `<link rel="stylesheet">` pointing off-site is a real request the
  // browser makes on page load -- exactly the thing the About and category
  // pages' "nothing you type is uploaded" / "no third-party scripts" claims
  // are about -- and it never appears as a `fetch(` call anywhere, so the
  // old .js-only scan would silently miss it and the privacy claim would go
  // uncaught-false for that page.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-fetch-scan-'));
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head>
      <link rel="canonical" href="https://example.test/site/should-not-count/">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
      <script src="https://cdn.example.com/widget.js"></script>
    </head><body></body></html>`,
  );
  const hosts = await surfaceExternalFetchHosts(dir);
  assert.deepEqual(hosts, ['cdn.example.com', 'fonts.googleapis.com']);
});

test('surfaceExternalFetchHosts ignores an HTML file with no off-origin request', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-fetch-scan-clean-'));
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head>
      <link rel="canonical" href="https://example.test/site/">
      <link rel="alternate" type="application/atom+xml" href="https://example.test/feed.xml">
      <link rel="icon" href="../favicon.svg">
    </head><body><script>fetch('/local-only');</script></body></html>`,
  );
  assert.deepEqual(await surfaceExternalFetchHosts(dir), []);
});

test('surfaceExternalFetchHosts reads .mjs files, and catches a fetch-shaped call whose URL comes from an object field, not a literal or a top-level const', async () => {
  // dns-configuration-evidence calls a public DoH resolver as
  // `fetchImpl(\`${resolver.endpoint}?name=...\`)`, where `fetchImpl` is an
  // injectable default parameter and `resolver.endpoint` is a field on an
  // array literal, not a top-level `const` this scanner's precise checks can
  // trace. That call sat in a `.mjs` file, which the scanner used to skip
  // outright. Both gaps together meant this tool's real third-party calls to
  // Cloudflare/Google/Quad9 went undisclosed on /about/ and on its own card.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-fetch-scan-mjs-'));
  await fs.writeFile(
    path.join(dir, 'lookup.mjs'),
    `export const RESOLVERS = Object.freeze([
      { id: 'cloudflare', endpoint: 'https://cloudflare-dns.com/dns-query' },
      { id: 'google', endpoint: 'https://dns.google/resolve' },
    ]);
    export async function queryResolver(name, resolver, { fetchImpl = globalThis.fetch } = {}) {
      const url = \`\${resolver.endpoint}?name=\${encodeURIComponent(name)}\`;
      return fetchImpl(url);
    }`,
  );
  assert.deepEqual(await surfaceExternalFetchHosts(dir), ['cloudflare-dns.com', 'dns.google']);
});

test('surfaceExternalFetchHosts does not flag a .mjs file that fetches only a same-origin relative path', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-fetch-scan-mjs-local-'));
  await fs.writeFile(
    path.join(dir, 'load-example.mjs'),
    `export async function loadExample() {
      const res = await fetch('examples/before.json');
      return res.json();
    }`,
  );
  assert.deepEqual(await surfaceExternalFetchHosts(dir), []);
});

test('surfaceExternalFetchHosts does not treat the word "fetch(" inside a comment as a real fetch-shaped call', async () => {
  // cors-misconfig-check/probe.mjs explains, in its header comment, why it
  // deliberately does NOT use fetch() -- and says so using the literal text
  // "fetch()" twice. That alone used to satisfy the scanner's `/fetch\w*\(/`
  // trigger, turning on the catch-all rule ("grab every https:// literal in
  // this file") for a file that makes no fetch call anywhere in its real
  // code. The catch-all then published the un-resolved half of this file's
  // own template-literal test fixtures -- `cors-probe-${randomBytes(6)...}`,
  // `evil-${hostname}` -- on /about/, llms.txt and every guide page's
  // "except on..." sentence, mixed in with genuine hosts like dns.google.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-fetch-scan-comment-'));
  await fs.writeFile(
    path.join(dir, 'probe.mjs'),
    `// Uses Node's http/https clients deliberately, not fetch(): fetch()
    // cannot set a spoofed Origin header, which is the whole point here.
    import { randomBytes } from 'node:crypto';
    export function buildProbeSet(targetUrl, { randomOrigin } = {}) {
      const hostname = new URL(targetUrl).hostname;
      const nonce = randomOrigin ?? \`https://cors-probe-\${randomBytes(6).toString('hex')}.invalid\`;
      return [
        { label: 'reflect', requestOrigin: nonce },
        { label: 'suffix-match', requestOrigin: \`https://evil-\${hostname}\` },
      ];
    }`,
  );
  assert.deepEqual(await surfaceExternalFetchHosts(dir), []);
});

test('surfaceExternalFetchHosts skips a doc comment\'s illustrative example host even when the file makes a real fetch call elsewhere', async () => {
  // A `//` comment explaining what an attack-style Origin header looks like
  // ("https://evil-target.example.com") is documentation, not a network
  // target -- but the catch-all rule read raw source text, so once a file's
  // real fetch() call turned it on, an example host mentioned only in a
  // comment was indistinguishable from one actually requested.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-fetch-scan-doc-example-'));
  await fs.writeFile(
    path.join(dir, 'lookup.mjs'),
    `// e.g. a suffix match: "https://evil-target.example.com" is not the
    // real target and must never be requested or reported as one.
    export async function lookup(name) {
      return fetch(\`https://dns.google/resolve?name=\${encodeURIComponent(name)}\`);
    }`,
  );
  assert.deepEqual(await surfaceExternalFetchHosts(dir), ['dns.google']);
});

test('surfaceExternalFetchHosts does not report an un-resolved template placeholder as a host', async () => {
  // ai-crawler-access-check/cli.mjs genuinely calls fetch() -- against
  // whatever domain the CLI's own user names, via `fetch(\`https://${input}\`
  // )\`. The catch-all's blind quoted-string scan grabbed that literal
  // template text whole, and `new URL('https://${input}').host` happily
  // returns the string `${input}` -- a WHATWG URL parse succeeding is not
  // proof the text names a real host.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-fetch-scan-placeholder-'));
  await fs.writeFile(
    path.join(dir, 'cli.mjs'),
    `export async function fetchText(input) {
      const res = await fetch(\`https://\${input}\`, { redirect: 'follow' });
      return res.text();
    }`,
  );
  assert.deepEqual(await surfaceExternalFetchHosts(dir), []);
});

test('a category holding a documented external-call exception says so, not "nothing you type is uploaded" unconditionally', async () => {
  // A category's "nothing you type is uploaded" line is a privacy claim, not
  // decoration -- and it is false for a category that files a tool like
  // Sponsor Ready, whose whole job is a live lookup. This is computed from
  // `externalCallExceptions`, the same function the About page already
  // trusts for its own version of this claim, rather than hand-written per
  // category, so a future exception cannot leave one category's copy stale.
  const { surfaces } = await site();
  const exceptionSlugs = externalCallExceptions(surfaces).map((x) => x.slug);
  assert.ok(exceptionSlugs.length > 0, 'expected at least one externalCallExceptions entry to exercise this test');

  for (const { category, items } of groupByCategory(surfaces)) {
    const html = await read(CATEGORY_PATH_PREFIX, category.id, 'index.html');
    const [, count] = html.match(/<p class="count">([^<]+)<\/p>/) ?? [];
    assert.ok(count, `${category.id} has no .count paragraph to check`);
    const exceptions = externalCallExceptions(items);
    if (exceptions.length) {
      assert.ok(
        count.includes('except on'),
        `${category.id} files ${exceptions.map((x) => x.title).join(', ')} but its count line reads "${count}"`,
      );
      // A long list is folded into the <details> right under the count line
      // (privacyClaimParts); the line itself then counts them.
      const [, folded] = html.match(/<\/p>\s*<details class="count-exceptions">[\s\S]*?<p>([\s\S]*?)<\/p><\/details>/) ?? [];
      if (exceptions.length > 3) {
        assert.ok(count.includes(`except on the ${exceptions.length} lookup tools listed below`), `${category.id}: "${count}"`);
        assert.ok(folded, `${category.id} counts ${exceptions.length} exceptions but lists none under the count line`);
      }
      const named = exceptions.length > 3 ? folded : count;
      for (const x of exceptions) {
        // The *prose* name, not the raw title: eight catalogue titles carry an
        // em-dash tagline that would swallow the conjunction in this list. See
        // `toolProseName`. The claim being pinned is unchanged — every
        // exception is still named on the line that makes the privacy claim.
        const name = toolProseName(x.title);
        assert.ok(named.includes(name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')), `${category.id}'s exception list omits ${name}`);
      }
    } else {
      assert.equal(
        count,
        `${items.length} free tool${items.length === 1 ? '' : 's'} · no account · nothing you type is uploaded`,
        `${category.id} holds no exception, so its count line should make the unconditional claim`,
      );
    }
  }
});

test('a tool or category with a documented external-call exception gets the exception footer on its share card', async () => {
  // `CARD_FOOTER` ("nothing you type is uploaded") is baked into a raster
  // image -- these are the two lines every share card carries besides its
  // headline -- so a card for Sponsor Ready or for the category that files it
  // must not draw that claim. Regression target: before this test existed,
  // both cards silently carried the default footer.
  const { outDir, surfaces } = await site();
  const exceptions = externalCallExceptions(surfaces);
  assert.ok(exceptions.length > 0, 'expected at least one externalCallExceptions entry to exercise this test');

  for (const ex of exceptions) {
    const surface = surfaces.find((s) => s.slug === ex.slug);
    const options = toolCardOptions(surface, { baseUrl: BASE });
    assert.equal(options.footer, CARD_FOOTER_EXCEPTION);
    const withExceptionFooter = renderCard(options);
    const withDefaultFooter = renderCard({ ...options, footer: CARD_FOOTER });
    const actual = await fs.readFile(path.join(outDir, toolCardFileFor(surface.slug)));
    assert.ok(
      actual.equals(withExceptionFooter),
      `${surface.slug}'s share card should carry the exception footer`,
    );
    assert.ok(
      !actual.equals(withDefaultFooter),
      `${surface.slug}'s share card must not claim "nothing you type is uploaded"`,
    );
  }

  for (const { category, items } of groupByCategory(surfaces)) {
    const expectedFooter = externalCallExceptions(items).length ? CARD_FOOTER_EXCEPTION : CARD_FOOTER;
    const expected = renderCard(categoryCardOptions(category, { footer: expectedFooter, baseUrl: BASE }));
    const actual = await fs.readFile(path.join(outDir, socialCardFileFor(category.id)));
    assert.ok(actual.equals(expected), `${category.id}'s share card footer does not match its exceptions`);
  }
});

test('the manifest description matches whether the site has a documented external-call exception', async () => {
  const { outDir, surfaces } = await site();
  const manifest = JSON.parse(await fs.readFile(path.join(outDir, 'manifest.webmanifest'), 'utf8'));
  if (externalCallExceptions(surfaces).length) {
    assert.ok(
      !manifest.description.includes('nothing you type is uploaded'),
      `manifest description makes the unconditional claim: "${manifest.description}"`,
    );
  } else {
    assert.match(manifest.description, /nothing you type is uploaded/);
  }
});

test('the hub links every category page, and the sitemap lists them', async () => {
  const { outDir, surfaces } = await site();
  const ids = groupByCategory(surfaces).map(({ category }) => category.id);

  const hub = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  for (const id of ids) {
    assert.ok(hub.includes(`data-category="${id}"`), `the hub does not link ${id}`);
  }

  const listed = await sitemapUrlPaths();
  for (const id of ids) {
    assert.ok(
      listed.has(`${pathOf(BASE)}${categoryPagePath(id)}`),
      `${id} is in no sitemap, so it is built and never found`,
    );
  }
});

test('llms.txt links a product\'s own LLM docs only when it ships them', () => {
  const surfaces = [
    { slug: 'with-docs', title: 'With docs', description: 'Has a brief.', llmsDoc: true },
    { slug: 'without-docs', title: 'Without docs', description: 'Has none.' },
  ];
  const llms = renderLlmsTxt(surfaces, BASE, [], [], { full: true });
  assert.match(llms, new RegExp(`\\[With docs\\]\\(${BASE}with-docs/\\): Has a brief\\. LLM docs: ${BASE}with-docs/llms\\.txt`));
  assert.ok(!llms.includes(`${BASE}without-docs/llms.txt`));
});

test('llms.txt and catalog.json name the category pages', async () => {
  const { surfaces } = await site();
  const llms = renderLlmsTxt(surfaces, BASE);
  const catalog = JSON.parse(renderCatalog(surfaces, BASE));

  for (const { category, items } of groupByCategory(surfaces)) {
    assert.ok(
      llms.includes(`Category page: ${BASE}${categoryPagePath(category.id)}`),
      `llms.txt does not name the ${category.id} page`,
    );
    const row = catalog.categories.find((c) => c.id === category.id);
    assert.ok(row, `catalog.json has no ${category.id} row`);
    assert.equal(row.url, `${BASE}${categoryPagePath(category.id)}`);
    assert.equal(row.tool_count, items.length);
  }

  // The bare-URL form matters: `check.mjs` reads markdown links in llms.txt as
  // product slugs, so a `[…](…/c/trades/)` link would be reported as a product
  // that did not ship.
  assert.ok(!/\]\([^)]*\/c\/[^)]+\/\)/.test(llms));
});

// ---- About / press page ---------------------------------------------------
//
// The page carries two claims nothing else on the site makes in one place: the
// privacy statement a visitor reads before typing their costs into a stranger's
// calculator, and the boilerplate somebody copies when they link to it. Both
// fail silently — a wrong tool count in the press blurb is a claim that is
// simply untrue, and a page nothing links is a page nobody reads.

test('the About page ships, carries the disclaimer, and states the real catalogue size', async () => {
  const { surfaces } = await site();
  const about = await read('about', 'index.html');

  assert.match(about, /no warranty/i, 'About must carry the liability disclaimer like every page');
  assert.match(about, new RegExp(`${surfaces.length} free calculators`));
  // The copy-paste boilerplate: its numbers come from `surfaces`, so they
  // cannot drift from the catalogue the way hand-written blurbs do.
  assert.match(about, new RegExp(`${surfaces.length} free, private calculators`));
  assert.ok(
    about.includes(`<link rel="canonical" href="${BASE}about/">`),
    'About needs its own canonical, not the hub\'s',
  );
});

test('the About page lede states the device-privacy claim honestly, with any documented exception named', async () => {
  // Every other privacy claim on this page (the "What data..." panel, the
  // copy-paste boilerplate) already runs through `externalCallExceptions`.
  // The lede paragraph -- the very first sentence a visitor reads -- used to
  // make the unconditional claim regardless, which is the drift this guards.
  const { surfaces } = await site();
  const about = await read('about', 'index.html');
  const [, ledeOnly] = about.match(/<p class="lede">([^<]+)<\/p>/) ?? [];
  assert.ok(ledeOnly, 'About page has no .lede paragraph to check');
  // The lede itself stays short; the named exceptions sit directly under it,
  // in the hero, in a disclosure the lede points at. Both are read together:
  // the claim and its exceptions must still be in the first thing a visitor sees.
  const [, disclosure = ''] = about.match(/<details class="exceptions">([\s\S]*?)<\/details>/) ?? [];
  const lede = `${ledeOnly} ${disclosure}`;

  const exceptions = externalCallExceptions(surfaces);
  assert.ok(!lede.includes('nothing you type into them is uploaded anywhere'), 'lede still makes the old unconditional claim');
  if (exceptions.length) {
    for (const x of exceptions) {
      // Prose name rather than raw title, for the reason in `toolProseName`:
      // the lede is a sentence, and a title carrying its own em-dash tagline
      // makes a two-tool exception list unreadable as two tools.
      const name = toolProseName(x.title);
      assert.ok(lede.includes(name), `lede has an exception but does not name ${name}: "${lede}"`);
    }
  } else {
    assert.match(lede, /never leave their device/);
  }
});

test('the About page privacy panel counts its exceptions instead of assuming one', async () => {
  // Regression target: the panel heading, the "Nothing you enter is
  // transmitted" clause, and the "third-party scripts" clause each hardcoded
  // "one documented exception" / a singular verb. That was silently correct
  // while Sponsor Ready was the only externalCallExceptions entry, and went
  // quietly false the day a second one (DNS Change Evidence) existed
  // alongside it -- exactly the kind of drift this page exists to prevent
  // everywhere else. This asserts the wording tracks the real count, not a
  // number frozen at write time.
  const { surfaces } = await site();
  const about = await read('about', 'index.html');
  const exceptions = externalCallExceptions(surfaces);

  if (exceptions.length === 0) {
    assert.match(about, /Nothing\. There is no server that could receive it\./);
    assert.ok(!about.includes('documented exception'));
  } else if (exceptions.length === 1) {
    assert.match(about, /Nothing, with one documented exception below\./);
    assert.match(about, /Nothing you enter is transmitted, with one documented exception\./);
  } else {
    assert.match(
      about,
      new RegExp(`Nothing, with ${exceptions.length} documented exceptions below\\.`),
      `panel heading should count all ${exceptions.length} exceptions, not say "one"`,
    );
    assert.match(
      about,
      new RegExp(`Nothing you enter is transmitted, with ${exceptions.length} documented exceptions\\.`),
    );
    assert.ok(
      !about.includes('one documented exception'),
      `About page has ${exceptions.length} exceptions but still says "one documented exception" somewhere`,
    );
    assert.match(
      about,
      /Besides the live API calls .+ make, above, the/,
      'plural exceptions need "calls ... make", not the singular "call ... makes"',
    );
  }
});

test('the About page is reachable from the hub, the categories and every tool page', async () => {
  const { outDir, surfaces } = await site();

  assert.match(await read('index.html'), /href="about\/"/, 'the hub footer links About');
  assert.match(
    await read(CATEGORY_PATH_PREFIX, 'trades', 'index.html'),
    /href="\.\.\/\.\.\/about\/"/,
    'a category page links About at the right depth',
  );

  // The shared chrome is what puts the link on all 164 tool pages; without it
  // the privacy statement is unreachable from the pages that collect input.
  const tool = surfaces[0].slug;
  const toolHtml = await fs.readFile(path.join(outDir, tool, 'index.html'), 'utf8');
  assert.match(toolHtml, /href="\.\.\/about\/"/, `${tool} links About from its chrome footer`);
});

test('every link the About page makes resolves', async () => {
  const { outDir } = await site();
  const file = path.join(outDir, 'about', 'index.html');
  const html = await fs.readFile(file, 'utf8');
  const hrefs = [...html.matchAll(/href="([^"#]+)"/g)]
    .map((m) => m[1])
    .filter((href) => !/^(https?:|mailto:|data:)/.test(href))
    // Sections publish-branch.sh writes after this build (see LATE_NAV_DIRS).
    .filter((href) => !LATE_NAV_DIRS.includes(href.replace(/^\.\.\//, '').split(/[/?]/)[0]));

  for (const href of hrefs) {
    assert.ok(await exists(hrefTarget(href, file, outDir)), `About links ${href}, which is not there`);
  }
});

test('the About page makes no off-origin request, which is the claim it makes', async () => {
  // The page tells the reader there is no third-party script on this site. A
  // page that itself pulled a font or an analytics tag would make that a lie,
  // and it is the one page where the lie would be load-bearing.
  assert.deepEqual(offOriginResources(await read('about', 'index.html')), []);
});

test('the About page documents the embed feature that #2561 shipped, not just the per-tool box', async () => {
  // The embed offer itself only exists on a tool's own footer (`embed.mjs`,
  // `injectEmbedWidget`) -- nobody browsing the hub or About ever scrolls to
  // one to discover the feature exists at all. This is the site-level surface
  // for it: no snippet to copy (that one is already generated correctly, per
  // tool, with that tool's own title and URL), just the fact that every tool
  // supports it and the one shape the snippet always takes.
  const { surfaces } = await site();
  const about = await read('about', 'index.html');

  assert.match(about, /Embedding a tool on your own page/);
  assert.match(about, new RegExp(`Every one of the ${surfaces.length} tools here can be framed`));
  // The illustrated snippet uses the real query param and default height the
  // shipped feature uses, not numbers written by hand that could drift from it.
  assert.match(about, new RegExp(`\\?${EMBED_QUERY_PARAM}=1`));
  assert.match(about, new RegExp(`min-height:${DEFAULT_EMBED_HEIGHT}px`));
});

test('the hub sitemap holds the hub, the Tools index, the categories, About, Ask, custom development, /compare/, /research/, Stories, updates, the changelog and /guides/, and nothing else', () => {
  const xml = renderHubSitemap(BASE, ['marketplace', 'trades']);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // About, the comparison index and the guides index are hub-level pages
  // belonging to no venture, so this sitemap is the only one that can carry
  // any of them.
  assert.deepEqual(locs, [
    BASE,
    `${BASE}c/`,
    `${BASE}c/marketplace/`,
    `${BASE}c/trades/`,
    `${BASE}about/`,
    `${BASE}ask/`,
    `${BASE}custom-development/`,
    `${BASE}${COMPARE_PATH}`,
    `${BASE}${RESEARCH_PATH}`,
    `${BASE}stories/`,
    `${BASE}updates/`,
    `${BASE}changelog/`,
    `${BASE}${GUIDES_PATH}`,
  ]);

  // Called with no categories it still emits a valid urlset naming the hub —
  // the shape every caller before this change relied on.
  assert.ok(renderHubSitemap(BASE).includes(`<loc>${BASE}</loc>`));

  // Each research project's home page is listed under /research/.
  assert.ok(renderHubSitemap(BASE, [], [], ['accel-kws']).includes(`<loc>${BASE}${RESEARCH_PATH}accel-kws/</loc>`));
  // And each research topic page, which the build passes in the same list.
  assert.ok(renderHubSitemap(BASE, [], [], ['topics/accel']).includes(`<loc>${BASE}${RESEARCH_PATH}topics/accel/</loc>`));

  // The writing index and each post, and neither when there are no posts.
  const withPosts = renderHubSitemap(BASE, [], [], [], ['a-post']);
  assert.ok(withPosts.includes(`<loc>${BASE}writing/</loc>`));
  assert.ok(withPosts.includes(`<loc>${BASE}writing/a-post/</loc>`));
  assert.ok(!renderHubSitemap(BASE).includes('writing/'));
});

test('tools whose audience browses a section are filed in it', async () => {
  // Each of these sat in the catch-all while the section its buyer reads was
  // right there. The tool existed, the visitor was browsing the correct
  // heading, and it was not under it — the quietest way a catalogue loses a
  // product, because nothing 404s and every check still passes.
  const placements = {
    'cleaning-dilution-calculator': ['trades', 'trades-cleaning'],
    'hvac-maintenance-contract-calculator': ['trades', 'trades-mep'],
    'appliance-repair-quote-calculator': ['trades', 'trades-mep'],
    // Airbnb vs Vrbo is two marketplaces' fee schedules on one booking, which
    // is the marketplace section's job, not a service quote.
    'str-host-payout-calculator': ['marketplace', null],
    // Whatnot livestream payout is the same marketplace-seller job; slug starts
    // with the storefront name the marketplace rule now catches.
    'whatnot-seller-payout': ['marketplace', null],
    'notary-trip-quote': ['services', null],
    'booth-rent-vs-commission': ['services', null],
    'translator-project-quote': ['services', null],
  };

  for (const [slug, [category, subcategory]] of Object.entries(placements)) {
    assert.equal(categoryFor(slug).id, category, `${slug} is not in ${category}`);
    const sub = subcategoryFor(slug);
    assert.equal(sub ? sub.id : null, subcategory, `${slug} is in the wrong sub-group`);
  }
});

test('the catch-all holds only what no section claims', async () => {
  const { surfaces } = await site();
  const more = groupByCategory(surfaces).find((g) => g.category.id === 'more');

  // Not a fixed list — new ventures land here until a rule claims them, which
  // is the fallback working. The bound is what matters: a catch-all that grows
  // back past a screenful means the taxonomy has stopped keeping up, which is
  // exactly the state this change found it in (14 tools, six of them one
  // coherent category).
  //
  // Raised 8 -> 9 on 2026-09-07/08 when two independent sessions each
  // graduated a venture that fits none of the six named categories in the
  // same window: `menu-engineering-calculator` (a restaurant-menu pricing
  // classifier — not a trade bid, not a marketplace fee, not a service
  // quote, not logistics/evidence/backoffice/CI) and `ats-resume-checker` (a
  // job-seeker resume format checker — a different audience from every
  // other category, which is all small-business or developer-facing).
  // Neither is a coherent cluster on its own yet, so this is the fallback
  // working as designed rather than a taxonomy gap to close today; lower it
  // back if either niche grows a sibling that lets both leave the catch-all.
  //
  // Lowered 9 -> 5 on 2026-09-08, which is what those two raises were waiting
  // for. The bound was one arrival from firing again and this time the answer
  // was the category rather than another raise: enumerating the catch-all
  // instead of judging one arrival at a time showed that five of its nine
  // members already shared an axis no named section had -- an individual
  // pricing their own labour or audience, rather than a business or a
  // developer. They are now `solo-earner` in build.mjs, and the four left
  // here really are unrelated to each other.
  //
  // Note the shape of the mistake this corrects: each raise was locally
  // correct ("my venture is not a cluster on its own") and the aggregate was
  // wrong, because nobody was looking at the aggregate. Prefer listing the
  // catch-all to reasoning about the one venture in front of you.
  //
  // Fired again 2026-09-13 at 6, and the bound was not raised then either.
  // Two sessions answered it in the same window, differently, and both landed
  // — so the record here is worth keeping straight, because the two halves
  // are easy to mistake for one decision:
  //
  //   - #4677 restored the bound, by filing `caption-quality-check` (the
  //     arrival that tripped it) under `ci` rather than leaving it here. That
  //     alone took the catch-all back to 5.
  //   - `food-service` in build.mjs came out of listing the six rather than
  //     judging the arrival, and is NOT what fixed the bound. Two of the six
  //     (`menu-engineering-calculator`, `food-truck-event-margin-calculator`)
  //     shared an axis with `pour-cost-calculator`, which had been sitting in
  //     `services` for want of anywhere better: food and drink priced per item
  //     or per event.
  //
  // So this guard is not the argument for that section — a reader checking
  // later should weigh it on the axis and on `pour-cost-calculator` having a
  // home that fits, not on a bound that something else had already restored.
  // What the guard did do is make someone enumerate, which is the whole point
  // of it and is how the cluster was found at all.
  //
  // Between them the catch-all was 3: electronics teaching calculators,
  // daycare tuition, a security deposit refund.
  //
  // It is 1 as merged, and the difference is a third session in the same
  // window. #4680 also enumerated, and filed the other two out from under
  // this branch while it was in flight — daycare tuition to `services` (a
  // small operator pricing a booking from its own ratio and overhead), the
  // security deposit refund to `backoffice` (a reconciliation after the
  // tenancy ended, the same axis as `card-processing-fee-audit`). Both are
  // right, neither overlaps `food-service`, and this branch was merged onto
  // them rather than around them.
  //
  // So the catch-all now holds `ai-engineering-academy` alone — a hub of
  // electronics teaching calculators, which is genuinely unlike every named
  // section here. Four free slots under the bound, which is the most headroom
  // it has had, and the right state for it: the fallback exists so a new
  // venture can land without an argument about taxonomy on its first commit.
  //
  // Worth noting what three concurrent sessions did NOT do. None raised the
  // bound. Each enumerated, found a different true thing, and the aggregate
  // came out coherent — which is the behaviour the paragraph above asks for,
  // arrived at independently three times.
  assert.ok(
    more.items.length <= 5,
    `the catch-all has grown to ${more.items.length} tools — time for another category`,
  );
});

test('no link to a published venture is repaired out to the private repository', async () => {
  // `repairLinks` decides "inside the site" by whether the target exists on
  // disk. It used to run inside the copy loop, so a link to a sibling venture
  // that sorts later alphabetically was tested before that sibling had been
  // copied, judged to escape the site, and repointed at GitHub. This repository
  // is private, so every one of those was a 404 for every visitor -- and
  // `check.mjs` never saw it, because by then the link is absolute and it does
  // not follow those.
  //
  // Ten links were affected and all seven distinct targets were live pages:
  // no-show-fee-calculator, where-to-sell-calculator,
  // walmart-marketplace-calculator, tiktok-shop-fee-calculator,
  // shopify-fee-calculator, quote-margin-check, and one
  // invoice-payment-terms-calculator page.
  //
  // Asserted over the whole built site rather than over those seven, so the
  // same mistake cannot return through a venture nobody was watching.
  const { surfaces, outDir } = await site();
  const published = new Set(surfaces.map((s) => s.slug));
  const offenders = [];

  for (const file of await listFiles(outDir)) {
    if (!file.endsWith('.html')) continue;
    const html = await fs.readFile(file, 'utf8');
    for (const [, target] of html.matchAll(
      new RegExp(`${SOURCE_URL_PREFIX.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}ventures/([^"'\\s>]+)`, 'g'),
    )) {
      const [slug, ...rest] = target.split('/');
      if (!published.has(slug)) continue;
      // A link into a published venture is only legitimate when it names a file
      // that venture does not publish -- its README or LICENCE, say.
      const asPublished = path.join(outDir, slug, ...rest);
      const candidates = rest.length ? [asPublished] : [path.join(outDir, slug, 'index.html')];
      for (const candidate of candidates) {
        try {
          await fs.access(candidate);
          offenders.push(`${path.relative(outDir, file)} -> ventures/${target}`);
        } catch { /* genuinely unpublished: the repair is correct */ }
      }
    }
  }

  assert.deepEqual(offenders, [], `links sent off-site to a private repo: ${offenders.slice(0, 8).join(', ')}`);
});

test('every DOWNLOADABLE_CLI_FILES entry is published, and no page still links off-site for it', async () => {
  // `.py` is a NON_WEB_EXTENSIONS extension, so `copyTree` never publishes it;
  // 18 ventures offer a specific `.py` CLI as a same-origin download anyway,
  // and `DOWNLOADABLE_CLI_FILES` is what makes that file the one exception.
  // Both halves of the fix are asserted here: the file actually ships, and no
  // page was left pointing at the private-repo blob URL for it (the previous
  // test above only catches an accidental off-site link to something that
  // WAS published -- a link to something genuinely unpublished, like these
  // files used to be, reads as "correct" to that test).
  const { outDir } = await site();

  for (const [slug, files] of Object.entries(DOWNLOADABLE_CLI_FILES)) {
    for (const name of files) {
      await fs.access(path.join(outDir, slug, name));

      for (const file of await listFiles(path.join(outDir, slug))) {
        if (!file.endsWith('.html')) continue;
        const html = await fs.readFile(file, 'utf8');
        assert.ok(
          !html.includes(`${SOURCE_URL_PREFIX}ventures/${slug}/${name}`),
          `${path.relative(outDir, file)} still links ${name} off-site to the private repo`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// The comparison index (`/compare/`)
//
// It exists because the catalogue's 167 `vs-<product>.html` pages were each
// reachable from exactly one place — their own tool's entry page — with no
// cross-venture link between any two of them and no page on either host
// collecting them (measured 2026-09-05). These tests pin the three things that
// would silently undo that: the index going empty, the index naming a product
// no venture author wrote, and the index shipping unreachable.
// ---------------------------------------------------------------------------

test('comparisonSubject reads the product out of the page, not the filename', () => {
  assert.equal(
    comparisonSubject('<h1>This calculator vs. Jobber</h1>'),
    'Jobber',
    'the plain heading form',
  );
  assert.equal(
    comparisonSubject('<h1>Cash Runway Planner vs. QuickBooks Online&#39;s Cash Flow Planner</h1>'),
    "QuickBooks Online's Cash Flow Planner",
    'entities decoded, multi-word product kept whole',
  );
  assert.equal(
    comparisonSubject('<h1>\n  This calculator\n  vs.\n  LMN by Granum\n</h1>'),
    'LMN by Granum',
    'a heading broken across lines',
  );
  assert.equal(
    comparisonSubject('<h1>An intro heading</h1><title>Tool vs. Widget Co | Site</title>'),
    'Widget Co',
    'falls back to the title, minus the site-name suffix',
  );
  assert.equal(
    comparisonSubject('<h1>Nothing to see</h1>'),
    null,
    'a page naming no product yields null rather than a guess',
  );
});

test('comparisonSubjectKey merges articles and casing but not possessives', () => {
  assert.equal(
    comparisonSubjectKey('the AWS Pricing Calculator'),
    comparisonSubjectKey('AWS Pricing Calculator'),
  );
  assert.notEqual(
    comparisonSubjectKey("Etsy's own Profit Calculator"),
    comparisonSubjectKey('Etsy'),
    "a possessive names a different product and must not be folded into the brand",
  );
});

test('groupComparisons puts the most-compared product first', () => {
  const entry = (subject, title) => ({
    subject,
    subjectKey: comparisonSubjectKey(subject),
    title,
    slug: title.toLowerCase().replaceAll(' ', '-'),
    file: 'vs-x.html',
    description: '',
  });
  const groups = groupComparisons([
    entry('Zebra', 'A tool'),
    entry('Jobber', 'C tool'),
    entry('Jobber', 'B tool'),
    entry('the Jobber', 'A tool'),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.subject, g.items.length]),
    [['Jobber', 3], ['Zebra', 1]],
  );
  assert.deepEqual(
    groups[0].items.map((i) => i.title),
    ['A tool', 'B tool', 'C tool'],
    'alphabetical inside a product',
  );
});

test('COMPARISON_FILE_PATTERN matches the convention and nothing beside it', () => {
  assert.ok(COMPARISON_FILE_PATTERN.test('vs-jobber.html'));
  assert.ok(COMPARISON_FILE_PATTERN.test('vs-quickbooks-cash-flow-planner.html'));
  assert.ok(!COMPARISON_FILE_PATTERN.test('vs-jobber.test.mjs'));
  assert.ok(!COMPARISON_FILE_PATTERN.test('index.html'));
  assert.ok(!COMPARISON_FILE_PATTERN.test('versus-jobber.html'));
});

test('the venture tree still has comparison pages, and every one names a product', async () => {
  // The gap this guards is `discoverComparisons` going quiet: a change to the
  // filename convention or to `sourceDir` resolution would render an index with
  // a headline, a disclaimer and nothing in it — valid HTML that passes every
  // structural check and is worthless. It also enforces the mandate's absolute
  // limit at the source: every product name the index prints must be text the
  // page it links to actually contains.
  const surfaces = (await discoverSurfaces(path.join(REPO_ROOT, 'ventures'))).map((surface) => ({
    ...surface,
    title: surface.slug,
    description: '',
  }));
  const entries = await discoverComparisons(surfaces);
  assert.ok(entries.length > 100, `only ${entries.length} comparison pages discovered`);
  for (const entry of entries) {
    const surface = surfaces.find((s) => s.slug === entry.slug);
    const html = await fs.readFile(path.join(surface.sourceDir, entry.file), 'utf8');
    // Normalised on both sides — see `comparisonText`. `entry.subject` has
    // already had its entities decoded, so `html.includes` was asking the page
    // to carry the heading a second time in raw form.
    assert.ok(
      comparisonText(html).includes(entry.subject),
      `"${entry.subject}" is not text ${entry.slug}/${entry.file} contains`,
    );
  }
});

test('renderComparePage links every entry, disclaims, and counts itself honestly', () => {
  const entry = (subject, slug, title) => ({
    subject,
    subjectKey: comparisonSubjectKey(subject),
    slug,
    file: `vs-${subject.toLowerCase()}.html`,
    title,
    description: 'Does the arithmetic for a job.',
  });
  const groups = groupComparisons([
    entry('Jobber', 'a-calculator', 'A Calculator'),
    entry('Jobber', 'b-calculator', 'B Calculator'),
    entry('Widget', 'c-calculator', 'C Calculator'),
  ]);
  const surfaces = [
    { slug: 'a-calculator', title: 'A Calculator' },
    { slug: 'b-calculator', title: 'B Calculator' },
    { slug: 'c-calculator', title: 'C Calculator' },
  ];
  const html = renderComparePage({
    groups,
    surfaces,
    categoryGroups: [],
    baseUrl: 'https://example.test/',
  });

  for (const group of groups) {
    for (const item of group.items) {
      assert.ok(
        html.includes(`href="../${item.slug}/${item.file}"`),
        `${item.slug}/${item.file} is not linked`,
      );
    }
  }
  // The multi-product band and the one-each band both render, and the counts in
  // the copy are derived rather than written down.
  assert.match(html, /3 comparison pages across 2 products/);
  assert.match(html, /1 more products, each compared by a single tool here\./);
  assert.match(html, /No warranty/);
  assert.ok(html.includes('<link rel="canonical" href="https://example.test/compare/">'));
  assert.ok(
    html.includes('trademark of its owner'),
    'a page naming other companies’ products must say so',
  );
  // Usage tracking, on the same terms as every other page here.
  assert.ok(html.includes('data-pf-slug="compare"'));
  // And no third-party anything: /about/ promises there are none.
  assert.ok(!/src="https?:\/\//.test(html));
  assert.ok(!/href="https?:\/\/fonts\./.test(html));
  // The index links each product's own page. A spoke the hub does not link is
  // reachable only from the sitemap: it renders, it deploys, it 200s, and no
  // reader arrives.
  assert.ok(html.includes('href="../compare/jobber/"'), 'Jobber’s own page is not linked');
  // And only for the products that have one. `Widget` is compared by a single
  // tool, so no page is generated for it and a link would be a 404.
  assert.ok(!html.includes('compare/widget/'), 'a single-tool product must not be linked a page');
});

test('isGuidePage lists the pages beside a tool and nothing already indexed elsewhere', () => {
  assert.ok(isGuidePage('how-much-to-charge-to-replace-a-boiler.html'));
  assert.ok(isGuidePage('sensitivity.html'));
  // The tool's own entry page is on the hub, its category page and llms.txt.
  assert.ok(!isGuidePage('index.html'));
  // A nested `index.html` is a second *tool*, not a guide —
  // `ai-engineering-academy/555-timer-calculator/` is an entry point.
  assert.ok(!isGuidePage('555-timer-calculator/index.html'));
  // A comparison page has `/compare/`, which is about the product it names and
  // does that job better than a trade-grouped list would.
  assert.ok(!isGuidePage('vs-jobber.html'));
  assert.ok(!isGuidePage('sitemap.xml'));
  // ...but a page that merely starts with the letters is not a comparison.
  assert.ok(isGuidePage('vsat-link-budget.html'));
});

test('guidePageMeta takes a guide’s label from the page’s own words, or drops it', () => {
  const withH1 = guidePageMeta(
    '<title>How much to charge to replace a boiler | Site</title>' +
      '<meta name="description" content="Worked example, in pounds.">' +
      '<h1>How much to charge to replace a boiler</h1>',
  );
  assert.equal(withH1.label, 'How much to charge to replace a boiler');
  assert.equal(withH1.description, 'Worked example, in pounds.');
  // The site-name suffix the build appends is not part of the answer.
  assert.equal(
    guidePageMeta('<title>Deadhead miles | Open Tools and Research</title>').label,
    'Deadhead miles',
  );
  // Entities are decoded, so an index entry reads as the author wrote it.
  assert.equal(guidePageMeta('<h1>Airbnb&rsquo;s host fee</h1>').label, 'Airbnb’s host fee');
  // A page with neither is dropped rather than labelled from its filename.
  assert.equal(guidePageMeta('<p>nothing here</p>'), null);
});

test('discoverGuides reads what shipped, and groupGuidesByCategory puts the deepest tool first', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-guides-'));
  const page = (h1, description) =>
    `<html><head><title>${h1} | Site</title><meta name="description" content="${description}"></head><body><h1>${h1}</h1></body></html>`;

  await fs.mkdir(path.join(outDir, 'ebay-fee-calculator'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'ebay-fee-calculator', 'index.html'), page('Tool', 'x'));
  await fs.writeFile(path.join(outDir, 'ebay-fee-calculator', 'vs-x.html'), page('vs X', 'x'));
  await fs.writeFile(path.join(outDir, 'ebay-fee-calculator', 'b.html'), page('B question', 'Bee.'));
  await fs.writeFile(path.join(outDir, 'ebay-fee-calculator', 'a.html'), page('A question', 'Ay.'));
  await fs.mkdir(path.join(outDir, 'deck-bid-calculator'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'deck-bid-calculator', 'index.html'), page('Tool', 'x'));
  await fs.writeFile(path.join(outDir, 'deck-bid-calculator', 'c.html'), page('C question', 'See.'));
  // A tool with no guide page contributes no empty block.
  await fs.mkdir(path.join(outDir, 'shop-rate-calculator'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'shop-rate-calculator', 'index.html'), page('Tool', 'x'));

  const surfaces = [
    { slug: 'deck-bid-calculator', title: 'Deck Bid Calculator', description: 'Decks.' },
    { slug: 'ebay-fee-calculator', title: 'eBay Fee Calculator', description: 'Fees.' },
    { slug: 'shop-rate-calculator', title: 'Shop Rate Calculator', description: 'Rates.' },
    // A surface with no directory in the artifact must not throw.
    { slug: 'never-published', title: 'Never Published', description: '' },
  ];
  const groups = await discoverGuides(surfaces, outDir);

  assert.deepEqual(
    groups.map((g) => [g.slug, g.items.map((i) => i.file)]),
    [
      ['deck-bid-calculator', ['c.html']],
      ['ebay-fee-calculator', ['a.html', 'b.html']],
    ],
    'entry pages, comparison pages and guide-less tools are all excluded',
  );
  assert.equal(groups[1].items[0].label, 'A question');
  assert.equal(groups[1].items[0].description, 'Ay.');

  const byCategory = groupGuidesByCategory(groups);
  const marketplace = byCategory.find((s) => s.category.id === 'marketplace');
  const trades = byCategory.find((s) => s.category.id === 'trades');
  assert.ok(marketplace && trades, 'both categories present');
  assert.deepEqual(marketplace.tools.map((t) => t.slug), ['ebay-fee-calculator']);
  assert.deepEqual(trades.tools.map((t) => t.slug), ['deck-bid-calculator']);
});

test('the built tree still has guide pages, and every label is text its own page carries', async () => {
  // The gap this guards is `discoverGuides` going quiet — the same failure
  // `discoverComparisons` has its own test for. It also enforces the mandate's
  // absolute limit at the source: every word the index prints has to be text
  // the page it links to actually contains, because an index may restate what
  // a venture author wrote and may not add a claim of its own.
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-guides-real-'));
  const surfaces = (await discoverSurfaces(path.join(REPO_ROOT, 'ventures'))).slice(0, 6);
  for (const surface of surfaces) {
    await fs.cp(surface.sourceDir, path.join(outDir, surface.slug), { recursive: true });
  }
  const groups = await discoverGuides(
    surfaces.map((s) => ({ ...s, title: s.slug, description: '' })),
    outDir,
  );
  assert.ok(groups.length > 0, 'no guide pages discovered in the first six ventures');
  for (const group of groups) {
    for (const item of group.items) {
      const html = await fs.readFile(path.join(outDir, group.slug, item.file), 'utf8');
      assert.ok(
        decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').includes(item.label),
        `"${item.label}" is not text ${group.slug}/${item.file} contains`,
      );
    }
  }
});

test('renderGuidesPage links every guide, disclaims, and counts itself honestly', () => {
  const item = (file, label) => ({ slug: 'ebay-fee-calculator', file, label, title: label, description: 'Short.' });
  const groups = [
    {
      slug: 'ebay-fee-calculator',
      title: 'eBay Fee Calculator',
      description: 'Fees.',
      category: categoryFor('ebay-fee-calculator'),
      items: [item('a.html', 'A question'), item('b.html', 'B question')],
    },
    {
      slug: 'deck-bid-calculator',
      title: 'Deck Bid Calculator',
      description: 'Decks.',
      category: categoryFor('deck-bid-calculator'),
      items: [{ ...item('c.html', 'C question'), slug: 'deck-bid-calculator' }],
    },
  ];
  const surfaces = [
    { slug: 'ebay-fee-calculator', title: 'eBay Fee Calculator' },
    { slug: 'deck-bid-calculator', title: 'Deck Bid Calculator' },
  ];
  const html = renderGuidesPage({ groups, surfaces, categoryGroups: [], baseUrl: 'https://example.test/' });

  for (const group of groups) {
    for (const entry of group.items) {
      assert.ok(
        html.includes(`href="../${entry.slug}/${entry.file}"`),
        `${entry.slug}/${entry.file} is not linked`,
      );
    }
    // And the tool itself, so the guide sits next to the calculator that
    // answers the same question with the reader's own numbers.
    assert.ok(html.includes(`href="../${group.slug}/"`), `${group.slug} is not linked`);
  }
  // Counts derived rather than written down.
  assert.match(html, /3 pages across 2 tools/);
  assert.match(html, /No warranty/);
  assert.ok(html.includes(`<link rel="canonical" href="https://example.test/${GUIDES_PATH}">`));
  // Usage tracking, on the same terms as every other page here.
  assert.ok(html.includes('data-pf-slug="guides"'));
  // And no third-party anything: /about/ promises there are none.
  assert.ok(!/src="https?:\/\//.test(html));
  assert.ok(!/href="https?:\/\/fonts\./.test(html));
  // The index says only what the pages it links already say.
  assert.ok(html.includes('adds no'), 'the index must say it adds nothing of its own');
});

test('renderGuidesPage names an external-call exception by its prose name, not its raw tagline', () => {
  // The same regression `toolProseName` exists to fix, on the sixth site that
  // splices a title into running prose: this page spans the whole catalogue
  // (see its own header comment), so its privacy claim carries the same
  // "except on <tools>" exception list as the About page and llms.txt, and it
  // is built from the same `externalCallExceptions` helper.
  const item = (file, label) => ({ slug: 'dns-change-evidence', file, label, title: label, description: 'Short.' });
  const groups = [
    {
      slug: 'dns-change-evidence',
      title: 'DNS Change Evidence — prove what a DNS change actually did',
      description: 'DNS.',
      category: categoryFor('dns-change-evidence'),
      items: [item('a.html', 'A question')],
    },
  ];
  const surfaces = [
    {
      slug: 'dns-change-evidence',
      title: 'DNS Change Evidence — prove what a DNS change actually did',
      externalFetchHosts: ['dns.google'],
    },
  ];
  const html = renderGuidesPage({ groups, surfaces, categoryGroups: [], baseUrl: 'https://example.test/' });
  const [sentence] = html.match(/nothing you type is uploaded[^<]*/) ?? [];
  assert.ok(sentence, 'the privacy sentence is missing entirely');
  assert.ok(sentence.includes('except on DNS Change Evidence'), `the exception is not named: "${sentence}"`);
  assert.ok(
    !sentence.includes('prove what a DNS change actually did'),
    `the raw tagline survived into the privacy sentence: "${sentence}"`,
  );
  // The tool's own heading is unaffected — full title there is correct, same
  // as disclaimerHtml's <a> per toolProseName's own doc comment.
  assert.ok(html.includes('<h3><a href="../dns-change-evidence/"'), 'the guide heading itself must keep the full title');
});

test('the guides index is in the hub sitemap and named in llms.txt', () => {
  // Both halves of "found at all": a page in no sitemap is built, deployed and
  // never crawled, and a surface missing from llms.txt is invisible to an
  // assistant. Measured 2026-09-07, before this page existed: 0 of the 173
  // question-shaped guide pages appeared anywhere in llms.txt.
  assert.ok(renderHubSitemap(BASE, ['marketplace']).includes(`${BASE}${GUIDES_PATH}`));

  const surfaces = [
    { slug: 'ebay-fee-calculator', title: 'eBay Fee Calculator', description: 'Fees.', fullDescription: 'Fees.' },
  ];
  const groups = [
    {
      slug: 'ebay-fee-calculator',
      title: 'eBay Fee Calculator',
      description: 'Fees.',
      category: categoryFor('ebay-fee-calculator'),
      items: [{ slug: 'ebay-fee-calculator', file: 'a.html', label: 'A question', title: 'A', description: '' }],
    },
  ];
  assert.match(renderLlmsTxt(surfaces, BASE, [], groups), /- \[Guides\]/);
  assert.match(renderLlmsTxt(surfaces, BASE, [], groups), /1 plain-English pages/);
  // A build with no guide pages must not advertise an empty index.
  assert.ok(!renderLlmsTxt(surfaces, BASE, [], []).includes('[Guides]'));
});

test('a product slug is URL-safe and matches what the apex nginx capture allows', () => {
  // The two ends of one contract: `comparisonProductSlug` decides the URL on
  // this host *and* (through `compareProductKey`) the ConfigMap key on the
  // apex, whose `^/compare/(?<vs>[a-z0-9][a-z0-9-]*)/?$` location can only ask
  // for keys of that shape. A slug outside it is a page nginx never requests.
  const capture = /^[a-z0-9][a-z0-9-]*$/;
  for (const subject of ['Jobber', 'Housecall Pro', "Amazon's own Revenue Calculator", 'GovWin IQ']) {
    const slug = comparisonProductSlug(comparisonSubjectKey(subject));
    assert.match(slug, capture, `"${subject}" produces a slug nginx cannot capture`);
  }
  // Injective: the key alphabet is lowercase alphanumerics and single spaces,
  // so no key can already contain the hyphen that spaces become. Two products
  // sharing a slug would silently overwrite each other's page.
  const keys = ['housecall pro', 'housecall-pro'].map(comparisonSubjectKey);
  assert.equal(new Set(keys.map(comparisonProductSlug)).size, new Set(keys).size);
});

test('renderCompareProductPage is about one product and claims nothing about it', () => {
  const entry = (subject, slug, title) => ({
    subject,
    subjectKey: comparisonSubjectKey(subject),
    slug,
    file: `vs-${subject.toLowerCase()}.html`,
    title,
    description: 'Does the arithmetic for a job.',
  });
  const groups = groupComparisons([
    entry('Jobber', 'a-calculator', 'A Calculator'),
    entry('Jobber', 'b-calculator', 'B Calculator'),
    entry('Aspire', 'c-calculator', 'C Calculator'),
    entry('Aspire', 'd-calculator', 'D Calculator'),
    entry('Widget', 'e-calculator', 'E Calculator'),
  ]);
  const products = comparisonProductGroups(groups);
  // Two products, not three: `Widget` has a single comparison, so it stays in
  // the index's one-each band and gets no page. See `COMPARE_PRODUCT_MIN_TOOLS`.
  assert.deepEqual(products.map((g) => g.subject).sort(), ['Aspire', 'Jobber']);

  const jobber = products.find((g) => g.subject === 'Jobber');
  const html = renderCompareProductPage({
    group: jobber,
    groups,
    surfaces: [
      { slug: 'a-calculator', title: 'A Calculator' },
      { slug: 'b-calculator', title: 'B Calculator' },
    ],
    categoryGroups: [],
    baseUrl: 'https://example.test/',
  });

  for (const item of jobber.items) {
    assert.ok(
      html.includes(`href="../../${item.slug}/${item.file}"`),
      `${item.slug}/${item.file} is not linked`,
    );
  }
  assert.ok(html.includes('<link rel="canonical" href="https://example.test/compare/jobber/">'));
  // Two segments deep, so every relative reference needs `../../` — a page
  // built with the index's own `../` resolves its stylesheet and its crumbs
  // one directory above where they live.
  assert.ok(!/href="\.\.\/(?!\.\.\/)/.test(html), 'a spoke must resolve against ../../');
  // The searcher's phrase is in the title, where it describes the question the
  // page answers; the heading states only what the linked pages are.
  assert.match(html, /<title>Jobber alternatives: 2 free tools/);
  assert.match(html, /<title>Jobber alternatives: 2 free tools( \| [^<]+)?<\/title>/, 'no trailing phrase that pushes the title past a results page');
  assert.ok(
    !/better than/i.test(html),
    'this page indexes comparisons; it does not make one',
  );
  // The notices every surface naming another company's product carries here.
  assert.match(html, /No warranty/);
  assert.ok(html.includes('trademark of its owner'));
  assert.match(html, /not\s+affiliated with, endorsed by, or reviewed by/i);
  // Cross-linked to its siblings, which is the internal linking the catalogue
  // measured zero of on 2026-09-05 — and not to itself.
  assert.ok(html.includes('href="../../compare/aspire/"'), 'the sibling spoke is not linked');
  assert.ok(!html.includes('href="../../compare/jobber/"'), 'a spoke must not link itself');
  // Its own usage row, so "did a product page earn what the index could not"
  // stays answerable.
  assert.ok(html.includes('data-pf-slug="compare/jobber"'));
  assert.ok(!/src="https?:\/\//.test(html));
});

test('the hub sitemap lists every product page the build writes', () => {
  const xml = renderHubSitemap('https://example.test/', ['trades'], ['jobber', 'housecall pro']);
  assert.ok(xml.includes('<loc>https://example.test/compare/</loc>'));
  assert.ok(xml.includes('<loc>https://example.test/compare/jobber/</loc>'));
  // The space in the key becomes a hyphen in the URL, via `comparisonProductSlug`
  // rather than a second normalisation written here.
  assert.ok(xml.includes('<loc>https://example.test/compare/housecall-pro/</loc>'));
});

test('the built site publishes /compare/, links it, and lists it in the sitemap', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'compare-'));
  const ventures = path.join(out, 'ventures');
  const mk = async (slug, files) => {
    await fs.mkdir(path.join(ventures, slug), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await fs.writeFile(path.join(ventures, slug, name), body);
    }
  };
  const page = (title, body) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
    `<meta name="description" content="A free calculator that does arithmetic in your browser."></head>` +
    `<body>${body}<p>No warranty: this is an estimate, not advice.</p></body></html>`;
  await mk('alpha-calculator', {
    'index.html': page('Alpha Calculator', '<h1>Alpha Calculator</h1>'),
    'vs-jobber.html': page('This calculator vs. Jobber', '<h1>This calculator vs. Jobber</h1>'),
  });
  await mk('beta-calculator', {
    'index.html': page('Beta Calculator', '<h1>Beta Calculator</h1>'),
    'vs-jobber.html': page('This calculator vs. Jobber', '<h1>This calculator vs. Jobber</h1>'),
  });

  const result = await buildSite({
    venturesDir: ventures,
    outDir: path.join(out, 'dist'),
    baseUrl: 'https://example.test/',
    log: () => {},
    disableWorker: true,
  });
  assert.equal(result.comparisons.length, 1, 'both tools compare with one product');
  assert.equal(result.comparisons[0].subject, 'Jobber');

  const compare = await fs.readFile(path.join(out, 'dist', COMPARE_PATH, 'index.html'), 'utf8');
  assert.ok(compare.includes('href="../alpha-calculator/vs-jobber.html"'));
  assert.ok(compare.includes('href="../beta-calculator/vs-jobber.html"'));

  const hub = await fs.readFile(path.join(out, 'dist', 'index.html'), 'utf8');
  assert.ok(hub.includes(`href="${COMPARE_PATH}"`), 'the hub must link /compare/');

  const hubSitemap = await fs.readFile(path.join(out, 'dist', 'sitemap-hub.xml'), 'utf8');
  assert.ok(hubSitemap.includes(`<loc>https://example.test/${COMPARE_PATH}</loc>`));

  const llms = await fs.readFile(path.join(out, 'dist', 'llms.txt'), 'utf8');
  assert.ok(llms.includes(`https://example.test/${COMPARE_PATH}`), 'llms.txt must name /compare/');

  await fs.rm(out, { recursive: true, force: true });
});

test('the built site publishes /guides/, links it, and lists it in the sitemap', async () => {
  // The end-to-end half of the guides index: the three places a page has to
  // appear before anyone reaches it — a link a visitor can click, a sitemap
  // entry a crawler follows, and an llms.txt line an assistant reads. Before
  // this page existed the guide pages had none of the three, only their own
  // tool's entry page.
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'guides-'));
  const ventures = path.join(out, 'ventures');
  const mk = async (slug, files) => {
    await fs.mkdir(path.join(ventures, slug), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      await fs.writeFile(path.join(ventures, slug, name), body);
    }
  };
  const page = (title, body) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
    `<meta name="description" content="A free calculator that does arithmetic in your browser."></head>` +
    `<body>${body}<p>No warranty: this is an estimate, not advice.</p></body></html>`;
  await mk('alpha-calculator', {
    'index.html': page(
      'Alpha Calculator',
      '<h1>Alpha Calculator</h1><a href="how-much-to-charge.html">How much to charge</a>',
    ),
    'how-much-to-charge.html': page('How much to charge', '<h1>How much to charge</h1>'),
    // A comparison page belongs to /compare/, not here.
    'vs-jobber.html': page('This calculator vs. Jobber', '<h1>This calculator vs. Jobber</h1>'),
  });

  const dist = path.join(out, 'dist');
  await buildSite({
    venturesDir: ventures,
    outDir: dist,
    baseUrl: 'https://example.test/',
    log: () => {},
    disableWorker: true,
  });

  const guides = await fs.readFile(path.join(dist, GUIDES_PATH, 'index.html'), 'utf8');
  assert.ok(guides.includes('href="../alpha-calculator/how-much-to-charge.html"'));
  assert.ok(guides.includes('How much to charge'), 'the page’s own heading is the entry');
  assert.ok(
    !guides.includes('vs-jobber.html'),
    'a comparison page has /compare/ and must not be listed twice',
  );

  const hub = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  assert.ok(hub.includes(`href="${GUIDES_PATH}"`), 'the hub must link /guides/');

  const hubSitemap = await fs.readFile(path.join(dist, 'sitemap-hub.xml'), 'utf8');
  assert.ok(hubSitemap.includes(`<loc>https://example.test/${GUIDES_PATH}</loc>`));

  const llms = await fs.readFile(path.join(dist, 'llms.txt'), 'utf8');
  assert.ok(llms.includes(`https://example.test/${GUIDES_PATH}`), 'llms.txt must name /guides/');

  await fs.rm(out, { recursive: true, force: true });
});

// The hub pages are where a stranger from a search query lands first, and until
// 2026-09-06 they were the only user-facing pages on the published site with no
// sponsors line: 698 of 721 pages carried one, and the 23 that did not were
// `404.html`, `offline.html`, the six category hubs and the fifteen comparison
// pages. That is backwards — a visitor could read a whole "vs ServiceTitan"
// comparison and never learn the tools are free and supportable.
//
// `portfolio/DIRECTION.md` names keeping every product's own half of the
// donation ask correct as the agent-doable part of `funding-sponsors-live`,
// while the owner decision it waits on stays owner-only.
test('every hub page carries the optional-support line', () => {
  const surfaces = [
    { slug: 'a-calculator', title: 'A Calculator' },
    { slug: 'b-calculator', title: 'B Calculator' },
  ];
  const entry = (subject, slug, title) => ({
    subject,
    subjectKey: comparisonSubjectKey(subject),
    slug,
    file: `vs-${subject.toLowerCase()}.html`,
    title,
    description: 'Does the arithmetic for a job.',
  });
  const groups = groupComparisons([
    entry('Jobber', 'a-calculator', 'A Calculator'),
    entry('Jobber', 'b-calculator', 'B Calculator'),
  ]);
  const baseUrl = 'https://example.test/';

  const category = categoryFor('a-calculator');
  const categoryItems = surfaces.map((s) => ({ ...s, description: 'Does the arithmetic.' }));
  const categoryGroups = [{ category, items: categoryItems }];

  const pages = {
    'compare hub': renderComparePage({ groups, surfaces, categoryGroups: [], baseUrl }),
    'compare product page': renderCompareProductPage({
      group: groups[0],
      surfaces,
      baseUrl,
    }),
    'category hub': renderCategoryPage({
      category,
      items: categoryItems,
      groups: categoryGroups,
      baseUrl,
    }),
  };

  for (const [name, html] of Object.entries(pages)) {
    assert.ok(
      html.includes(SPONSORS_URL),
      `${name} does not link the Sponsors profile`,
    );
    assert.ok(
      html.includes(sponsorsNote()),
      `${name} does not carry the optional-support line verbatim`,
    );
    // PRODUCT_PLAYBOOK.md §6: the ask lives in the footer, never in front of a
    // feature. If it ever renders outside the footer that is a product defect,
    // not a copy tweak.
    const footer = html.slice(html.lastIndexOf('<footer'));
    assert.ok(
      footer.includes(sponsorsNote()),
      `${name} carries the line outside its footer`,
    );
  }
});

test('the sponsors line is honest about what refusing costs', () => {
  // The one claim this sentence makes is that declining changes nothing about
  // the product. That has to stay true of the copy as well as the code: a
  // donation ask that overstates itself is worse than none at all.
  assert.match(sponsorsNote(), /optional and changes nothing/);
  assert.ok(!/must|required|unlock|premium|pro\b/i.test(sponsorsNote()));
});

test('toolProseName drops a trailing tagline so a name reads as one item in a sentence', () => {
  // The eight catalogue titles that use the `Name — what it does` convention.
  assert.equal(
    toolProseName('DNS Change Evidence — prove what a DNS change actually did'),
    'DNS Change Evidence',
  );
  assert.equal(toolProseName('Which Job First? — rank your job list'), 'Which Job First?');
  // An en dash is the same convention.
  assert.equal(toolProseName('Cut List Optimizer – compare sheet sizes'), 'Cut List Optimizer');

  // A title with no tagline is returned unchanged.
  assert.equal(toolProseName('Sponsor Ready'), 'Sponsor Ready');

  // A hyphen is NOT this pattern: tool names legitimately contain one, and
  // trimming there would rename the tool rather than unwrap it.
  assert.equal(toolProseName('Before/After DNS - Record Report'), 'Before/After DNS - Record Report');
  assert.equal(toolProseName('Break-Even Calculator'), 'Break-Even Calculator');

  // Degenerate input must not produce an empty name in the middle of a sentence.
  assert.equal(toolProseName('— tagline only'), '— tagline only');
  assert.equal(toolProseName(''), '');
  assert.equal(toolProseName(null), '');
});

test('the privacy exception sentence names each tool as a distinct list item', () => {
  // The regression this guards: `listProse` joined two titles with "and", and
  // the first title carried an em-dash tagline, so the sentence read
  // "except on DNS Change Evidence — prove what a DNS change actually did and
  // Sponsor Ready" -- in which a reader cannot tell where the first tool ends.
  // This is the portfolio's central claim about a visitor's data, so it has to
  // be unambiguous on the About page, in llms.txt, and in the per-page
  // disclaimer that ships on all 765 pages.
  const named = [
    toolProseName('DNS Change Evidence — prove what a DNS change actually did'),
    toolProseName('Sponsor Ready'),
  ];
  const prose = listProse(named);
  assert.equal(prose, 'DNS Change Evidence and Sponsor Ready');
  assert.ok(!prose.includes('—'), 'no tagline may survive into the exception list');
});

// A developer-tool cache must never reach the artifact, and the reason this is
// pinned by *shape* rather than by name is that the name list already lost this
// race twice. `EXCLUDED_DIRS` learned `__pycache__` and still did not know
// `.ruff_cache`, which appears inside a venture the moment a session runs that
// venture's Python suite — which CLAUDE.md's pre-merge checklist instructs.
//
// The consequence was measured on 2026-09-09, and it is a publish outage rather
// than clutter: `publish-branch.sh` runs `check.mjs` fail-closed, and check.mjs
// rejects `CACHEDIR.TAG` because nothing tells nginx how to type `.tag`. So
// following the checklist and then publishing blocked the live catalogue's only
// working deploy route. `.well-known` is the one dot-directory that must still
// survive, so it is asserted here rather than left to be rediscovered.
test('copyTree drops dot-directory tool caches but keeps .well-known', async () => {
  const from = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-src-'));
  const to = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-out-'));

  await fs.writeFile(path.join(from, 'index.html'), '<!doctype html><p>tool</p>');
  for (const dir of ['.ruff_cache', '.pytest_cache', '.mypy_cache', '__pycache__']) {
    await fs.mkdir(path.join(from, dir), { recursive: true });
    await fs.writeFile(path.join(from, dir, 'CACHEDIR.TAG'), 'Signature: 8a477f597d28d172');
    await fs.writeFile(path.join(from, dir, 'leak.html'), '<!doctype html><p>cache</p>');
  }
  await fs.mkdir(path.join(from, '.well-known'), { recursive: true });
  await fs.writeFile(path.join(from, '.well-known', 'security.txt'), 'Contact: mailto:x@y.z');

  await copyTree(from, to, 'https://example.test/');
  const landed = await fs.readdir(to);

  assert.ok(landed.includes('index.html'), 'the page itself must still be published');
  for (const dir of ['.ruff_cache', '.pytest_cache', '.mypy_cache', '__pycache__']) {
    assert.ok(
      !landed.includes(dir),
      `${dir} reached the artifact; check.mjs is fail-closed on CACHEDIR.TAG, so this blocks publish-branch.sh`,
    );
  }
  assert.ok(
    landed.includes('.well-known'),
    '.well-known is the one dot-directory a static site serves on purpose',
  );
});

// P019: the home page is a home for everything, not a calculator list. These
// pin the sections, so the framing cannot drift back one venture at a time.
test('the hub is a home for everything: apps, CLIs, research and self-deploy have their own place', () => {
  const surfaces = [
    { slug: 'ebay-fee-calculator', title: 'eBay fee calculator', description: 'Fees.', kind: 'browser' },
    { slug: 'dunning-engine', title: 'Dunning engine', description: 'Failed-payment recovery.', kind: 'app' },
    { slug: 'pinned-actions-check', title: 'Pinned actions check', description: 'CI check.', kind: 'cli' },
  ];
  const hub = renderHub(surfaces, 'https://example.test/', { researchCount: 461 });
  assert.match(hub, /<dl class="stats" id="overview">/);
  assert.match(hub, /<dt>Browser tools<\/dt><dd><a href="c\/">1<\/a>/);
  assert.match(hub, /<dt>Self-hostable apps<\/dt><dd><a href="c\/apps\/">1<\/a>/);
  assert.match(hub, /<dt>Command-line tools<\/dt><dd><a href="c\/cli\/">1<\/a>/);
  assert.match(hub, /<dt>Research projects<\/dt><dd><a href="research\/">461<\/a>/);
  // A front door, in order: what it is and the search over everything, then
  // the browse grid by job and by type, then research and self-deploy.
  const at = (re) => hub.search(re);
  assert.ok(at(/<h1>/) < at(/id="q"/), 'the search sits in the hero');
  assert.ok(at(/id="q"/) < at(/id="browse"/));
  assert.ok(at(/id="browse"/) < at(/id="types"/));
  assert.ok(at(/id="types"/) < at(/id="research"/));
  assert.match(hub, /href="c\/apps\/" data-category="apps"[\s\S]*Dunning engine/);
  assert.match(hub, /href="c\/cli\/" data-category="cli"[\s\S]*Pinned actions check/);
  assert.match(hub, /href="deploy\/"/);
  assert.ok(!/<h1>[^<]*Calculators/.test(hub), 'the headline names more than calculators');
  // The site header, with no second top bar.
  assert.equal(hub.match(/<nav\b[^>]*aria-label="Site"/g).length, 1);
  assert.ok(hub.includes(HEADER_MARKER));
});

test('the browse-by-type pages list each app and command-line tool, filed by the job it serves', () => {
  const surfaces = [
    { slug: 'dunning-engine', title: 'Dunning engine', description: 'Failed-payment recovery.', kind: 'app' },
    { slug: 'ebay-fee-calculator', title: 'eBay fee calculator', description: 'Fees.', kind: 'browser' },
  ];
  const apps = KIND_PAGES.find((k) => k.id === 'apps');
  const { items } = kindPageGroups(apps, surfaces);
  assert.deepEqual(items.map((s) => s.slug), ['dunning-engine']);
  const page = renderCategoryPage({ category: apps, items, groups: groupByCategory(surfaces), baseUrl: BASE, deployable: true });
  assert.match(page, /data-tool="dunning-engine"/);
  assert.match(page, /href="\.\.\/\.\.\/deploy\/\?app=dunning-engine">Deploy your own copy/);
  assert.doesNotMatch(page, /data-tool="ebay-fee-calculator"/);
});

test('surfaceKind reads the files a venture ships', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kind-'));
  const make = async (slug, files) => {
    await fs.mkdir(path.join(dir, slug));
    for (const f of files) await fs.writeFile(path.join(dir, slug, f), '');
    return path.join(dir, slug);
  };
  assert.equal(surfaceKind(await make('a', ['index.html', 'Dockerfile', 'render.yaml'])), 'app');
  assert.equal(surfaceKind(await make('b', ['index.html', 'Dockerfile'])), 'browser');
  assert.equal(surfaceKind(await make('c', ['index.html', 'cli.mjs'])), 'cli');
  assert.equal(surfaceKind(await make('d', ['index.html'])), 'browser');
  assert.equal(surfaceKind(path.join(dir, 'pinned-actions-check'), 'pinned-actions-check'), 'cli');
});

test('clampMetaDescription ends long descriptions at a sentence, leaves short ones alone', () => {
  const sentence = 'This checker reads one header and reports what the browser enforces. ';
  const long = sentence.repeat(8).trim();
  const html = `<head><meta name="description" content="${long}"><meta property="og:description" content="${long}"></head>`;
  const out = clampMetaDescription(html);
  const got = out.match(/name="description" content="([^"]*)"/)[1];
  assert.ok(got.length <= 320);
  assert.ok(got.endsWith('.'));
  assert.ok(long.startsWith(got));
  assert.ok(out.includes(`og:description" content="${long}"`), 'og:description is untouched');
  const short = '<meta name="description" content="Short and fine.">';
  assert.equal(clampMetaDescription(short), short);
});

test('clampMetaDescription cuts at a word with an ellipsis when no sentence fits', () => {
  const long = 'word '.repeat(100).trim();
  const out = clampMetaDescription(`<meta name="description" content="${long}">`);
  const got = out.match(/content="([^"]*)"/)[1];
  assert.ok(got.length <= 320 && got.endsWith('word\u2026'));
});

// Ranking by page count alone put a day-count adder with ten explainer pages
// at the front of the featured row (2026-10-21). Flagships lead it now.
test('the featured row leads with the flagships, then fills by page count', () => {
  const surfaces = [
    { slug: 'state-residency-day-counter', title: 'State residency day counter', description: 'Days.', kind: 'browser', pageCount: 11 },
    { slug: 'changepoint-detector', title: 'Changepoint detector', description: 'PELT.', kind: 'browser', pageCount: 2 },
    { slug: 'einvoice-preflight', title: 'E-invoice preflight', description: 'EN 16931.', kind: 'browser', pageCount: 19 },
  ];
  const featuredRow = (hub) => hub.slice(hub.indexOf('id="featured"')).match(/data-tool="([^"]+)"/g).map((m) => m.slice(11, -1));
  const hub = renderHub(surfaces, 'https://example.test/', { flagships: ['changepoint-detector', 'einvoice-preflight', 'not-a-surface'] });
  const row = featuredRow(hub);
  assert.deepEqual(row.slice(0, 2), ['changepoint-detector', 'einvoice-preflight']);
  assert.equal(new Set(row).size, row.length, 'no tool twice');
  assert.ok(row.includes('state-residency-day-counter'), 'room left is filled by page count');
  assert.ok(flagshipSlugs().includes('changepoint-detector'), 'the real file parses');
});
