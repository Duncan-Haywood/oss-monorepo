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
  collectPageTitles,
  faviconHref,
  injectFavicon,
  discoverSurfaces,
  injectChrome,
  isPublishable,
  listFiles,
  readMeta,
  relatedTools,
  upToRoot,
  renderHub,
  renderRobots,
  renderSitemapIndex,
  searchTokens,
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

  const hub_ = path.join(outDir, 'index.html');
  for (const href of hrefs) {
    await fs.access(hrefTarget(href, hub_, outDir));
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
  // Links a visitor clicks are fine; a resource the page loads is not.
  const loaded = [...hub.matchAll(/src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(loaded, [], `the hub loads off-origin resources: ${loaded.join(', ')}`);
  assert.ok(external.every((url) => url.startsWith('https://')), 'no plaintext http links');
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

test('a tool without its own sitemap is still listed', async () => {
  const surfaces = [
    { slug: 'has-one', hasSitemap: true },
    { slug: 'has-none', hasSitemap: false },
  ];
  const index = renderSitemapIndex(surfaces, BASE);
  assert.ok(index.includes(`${BASE}has-one/sitemap.xml`));
  assert.ok(!index.includes('has-none/sitemap.xml'), 'do not point at a sitemap that is not there');
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

test('the site root serves a favicon every page can fall back to', async () => {
  // Browsers request /favicon.ico from the origin root with or without a link
  // tag, so its absence was a 404 and a console error on all 35 pages. The
  // tools are other ventures' markup, which this build does not edit — one file
  // at the root is what covers them.
  const icon = await fs.readFile(path.join((await site()).outDir, 'favicon.ico'));

  assert.equal(icon.readUInt16LE(0), 0, 'ICO reserved field');
  assert.equal(icon.readUInt16LE(2), 1, 'ICO type must be icon, not cursor');
  assert.equal(icon.readUInt16LE(4), 1, 'one image');

  const width = icon[6];
  const height = icon[7];
  const declaredSize = icon.readUInt32LE(14);
  const offset = icon.readUInt32LE(18);
  assert.equal(width, 32);
  assert.equal(height, 32);
  // A byte count that disagrees with the file is the failure that makes a
  // browser quietly show a blank tab rather than error.
  assert.equal(
    offset + declaredSize,
    icon.length,
    'declared image size must account for the whole file',
  );
  assert.equal(icon.readUInt32LE(offset), 40, 'BITMAPINFOHEADER size');
  assert.equal(icon.readInt32LE(offset + 8), 64, 'height field counts image plus AND mask');
});

test('every published page points at that favicon', async () => {
  // The href is root-absolute because pages sit at several depths, and it
  // carries the site's path prefix because a project site is not at the origin
  // root. Getting either wrong is a broken icon on every page, silently.
  assert.equal(faviconHref('https://example.test/site/'), '/site/favicon.ico');
  assert.equal(faviconHref('https://example.test'), '/favicon.ico');

  const expected = faviconHref(BASE);
  const { outDir, surfaces } = await site();

  const hub = await read('index.html');
  assert.ok(
    hub.includes(`<link rel="icon" href="${expected}"`),
    'the hub declares no icon',
  );

  const pages = (await listFiles(outDir)).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > surfaces.length, 'expected article pages as well as landing pages');
  const missing = [];
  for (const file of pages) {
    const html = await fs.readFile(file, 'utf8');
    if (!/<link[^>]+rel=["'][^"']*icon/i.test(html)) missing.push(path.relative(outDir, file));
  }
  assert.deepEqual(missing, [], 'pages served without an icon');
});

test('a venture that declares its own icon keeps it', () => {
  const own = '<head><link rel="icon" href="mine.png"></head>';
  assert.equal(injectFavicon(own, BASE), own);

  const injected = injectFavicon('<head>\n<title>t</title></head>', BASE);
  assert.equal((injected.match(/rel="icon"/g) ?? []).length, 1);
  assert.ok(injected.includes(faviconHref(BASE)));

  // The charset declaration has to stay the first thing in the head.
  const withCharset = injectFavicon('<head><meta charset="utf-8"><title>t</title></head>', BASE);
  assert.ok(
    withCharset.indexOf('charset') < withCharset.indexOf('rel="icon"'),
    'the icon must not displace the charset declaration',
  );

  // A fragment with no <head> must be left exactly as it was, not corrupted.
  assert.equal(injectFavicon('<p>no head here</p>', BASE), '<p>no head here</p>');
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
