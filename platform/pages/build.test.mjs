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
  buildSite,
  categoryFor,
  discoverSurfaces,
  injectChrome,
  listFiles,
  relatedTools,
  upToRoot,
  isPublishable,
  readMeta,
  renderHub,
  pageUrlPath,
  renderFavicon,
  renderRobots,
  renderSitemapIndex,
  renderVentureSitemap,
  truncate,
  REPO_ROOT,
  SOURCE_URL_PREFIX,
} from './build.mjs';

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
  ];
}

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
  return paths;
}

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

  const leaked = files.filter(
    (f) =>
      /\.test\.(mjs|js|py)$/.test(f) ||
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

test('every discovered tool has a landing page in the output', async () => {
  const { outDir, surfaces } = await site();
  for (const surface of surfaces) {
    const entry = path.join(outDir, surface.slug, 'index.html');
    await fs.access(entry); // throws if the tool did not make it into the site
  }
});

test('every hub link resolves to a file that exists', async () => {
  const { outDir } = await site();
  const hub = await read('index.html');

  const hrefs = [...hub.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('http'));
  assert.ok(hrefs.length > 20, 'the hub should link to every tool');

  for (const href of hrefs) {
    const target = href.endsWith('/') ? path.join(outDir, href, 'index.html') : path.join(outDir, href);
    await fs.access(target);
  }
});

test('relative links inside each tool resolve', async () => {
  const { outDir, surfaces } = await site();
  const broken = [];

  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    for (const file of (await walk(dir)).filter((f) => f.endsWith('.html'))) {
      const html = await fs.readFile(file, 'utf8');
      const refs = [...html.matchAll(/(?:href|src)="([^"#?]+)"/g)]
        .map((m) => m[1])
        .filter((r) => !/^(https?:|mailto:|data:|\/\/|#)/.test(r) && r !== '');

      for (const ref of refs) {
        const target = path.resolve(path.dirname(file), ref);
        const check = ref.endsWith('/') ? path.join(target, 'index.html') : target;
        try {
          await fs.access(check);
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
  assert.ok(!/subscribe|upgrade to|paid plan|free trial/i.test(hub), 'no paywall language');
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

test('.nojekyll is emitted so Pages serves the tree verbatim', async () => {
  await read('.nojekyll');
});

test('a 404 page routes visitors back to the index', async () => {
  const notFound = await read('404.html');
  assert.ok(notFound.includes(BASE));
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
  });
});

test('readMeta falls back through title, then slug', () => {
  assert.equal(readMeta('<title>Tool | Extra</title>', 'x').title, 'Tool');
  assert.equal(readMeta('<html></html>', 'walk-in-tub-bid-calculator').title, 'Walk In Tub Bid Calculator');
});

test('readMeta decodes entities rather than showing them raw', () => {
  const meta = readMeta('<meta property="og:title" content="Fees &amp; Margin">', 'x');
  assert.equal(meta.title, 'Fees & Margin');
});

// An apostrophe is ordinary English, not an edge case: three shipped ventures
// carried one in the description a crawler reads. Reading only to the next
// quote of either kind cut "last night's archive shrank" down to "last night".
test('readMeta keeps an apostrophe inside a double-quoted attribute', () => {
  const html = `<meta name="description" content="See whether last night's archive shrank.">`;
  assert.equal(readMeta(html, 'x').description, "See whether last night's archive shrank.");
});

test('readMeta keeps an apostrophe in og:title and og:description', () => {
  const html = `<meta property="og:title" content="Ohm's Law Calculator">
    <meta property="og:description" content="Resistor codes and Ohm's law.">`;
  const meta = readMeta(html, 'x');
  assert.equal(meta.title, "Ohm's Law Calculator");
  assert.equal(meta.description, "Resistor codes and Ohm's law.");
});

test('readMeta still reads a single-quoted attribute, quotes and all', () => {
  const html = `<meta name='description' content='He said "go" before the run.'>`;
  assert.equal(readMeta(html, 'x').description, 'He said "go" before the run.');
});

test('readMeta reads content written before the identifying attribute', () => {
  const html = `<meta content="Last night's run." name="description">`;
  assert.equal(readMeta(html, 'x').description, "Last night's run.");
});

test('truncate cuts on a word boundary', () => {
  assert.equal(truncate('short', 20), 'short');
  const long = truncate('a'.repeat(30) + ' tail words here that go on', 40);
  assert.ok(long.endsWith('…'));
  assert.ok(long.length <= 41);
});

test('categories route each slug shape somewhere sensible', () => {
  assert.equal(categoryFor('ebay-fee-calculator').id, 'marketplace');
  assert.equal(categoryFor('walk-in-tub-bid-calculator').id, 'trades');
  assert.equal(categoryFor('janitorial-bid-calculator').id, 'trades');
  assert.equal(categoryFor('freight-accessorial-auditor').id, 'logistics');
  assert.equal(categoryFor('einvoice-preflight').id, 'evidence');
  assert.equal(categoryFor('something-brand-new').id, 'more');
});

test('every discovered tool lands in exactly one rendered group', async () => {
  const { surfaces } = await site();
  const hub = renderHub(surfaces, BASE);
  for (const surface of surfaces) {
    const occurrences = hub.split(`href="${surface.slug}/"`).length - 1;
    assert.equal(occurrences, 1, `${surface.slug} appears ${occurrences} times`);
  }
});

test('isPublishable keeps web assets and drops the rest', () => {
  assert.ok(isPublishable('calc.mjs'));
  assert.ok(isPublishable('index.html'));
  assert.ok(isPublishable('LICENSE'));
  assert.ok(!isPublishable('calc.test.mjs'));
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

test('injected head tags do not disturb the page they land in', async () => {
  const html = await read('ebay-fee-calculator', 'index.html');
  assert.equal((html.match(/<\/head>/gi) ?? []).length, 1);
  assert.equal((html.match(/<body[^>]*>/gi) ?? []).length, 1);
  assert.ok(html.includes('calc.mjs'), 'the calculator still loads its own module');
});

test('the required no-SLA clause reaches a visitor even when the venture omits it', () => {
  // PRODUCT_PLAYBOOK.md 5b requires it on every hosted surface. Ventures write
  // it by hand and keep shipping the no-warranty paragraph without it, because
  // each new calculator copies a sibling footer that was already missing it —
  // which has turned `main` red four times. Detecting it after the merge is what
  // kept failing, so the footer supplies it.
  const bare = '<html><head></head><body><p>No warranty.</p></body></html>';
  const wrapped = injectChrome(bare, {
    slug: 'tool', toRoot: '../', total: 40, canonical: 'https://x.test/tool/',
  });
  assert.match(wrapped, /no SLA/i);
  assert.match(wrapped, /taken offline without notice/i);
});

test('a venture that words its own availability clause is not given a second', () => {
  // Several phrase it in their own voice; duplicating the paragraph on a correct
  // page would be a regression, not a fix.
  const own = '<html><head></head><body><p>Hosted URLs carry no availability SLA.</p></body></html>';
  const wrapped = injectChrome(own, {
    slug: 'tool', toRoot: '../', total: 40, canonical: 'https://x.test/tool/',
  });
  assert.ok(!/Best-effort hosting/i.test(wrapped), 'the venture already said it');
  assert.equal((wrapped.match(/no availability SLA/gi) ?? []).length, 1);
});
