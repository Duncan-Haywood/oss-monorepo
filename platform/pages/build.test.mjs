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
  isPublishable,
  readMeta,
  renderCrossLinks,
  renderHub,
  renderRobots,
  renderSitemapIndex,
  siblingsFor,
  truncate,
  REPO_ROOT,
  SIBLING_COUNT,
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
// Cross-links
//
// Every venture was written as a standalone site, so nothing in one links to
// anything outside itself. Under one origin that leaves the hub reachable only
// from the front door, while search engines land people on the deep pages that
// were written to rank — so the visitor finds one calculator and never learns
// the other 35 exist. These tests are about that path staying open.
// ---------------------------------------------------------------------------

test('every published page links back to the hub', async () => {
  const { outDir, surfaces } = await site();
  for (const surface of surfaces) {
    const page = await fs.readFile(path.join(outDir, surface.slug, 'index.html'), 'utf8');
    assert.ok(
      page.includes('See all free calculators'),
      `${surface.slug} has no route back to the hub`,
    );
  }
});

test('a deep page links back to the hub too, not only the landing page', async () => {
  // The pages written to rank are the deep ones ("should I offer free shipping
  // on Etsy"), which is exactly where a visitor arrives from a search result.
  const deep = await read('etsy-profit-calculator', 'should-i-offer-free-shipping-on-etsy.html');
  assert.ok(deep.includes('portfolio-crosslinks'));
  assert.ok(deep.includes('See all free calculators'));
});

test('cross-links resolve from whatever depth the page sits at', async () => {
  const { outDir, surfaces } = await site();
  const slugs = new Set(surfaces.map((s) => s.slug));

  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    const pages = (await fs.readdir(dir, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.html'))
      .map((e) => path.join(e.parentPath ?? e.path, e.name));

    for (const file of pages) {
      const html = await fs.readFile(file, 'utf8');
      const nav = html.match(/<nav class="portfolio-crosslinks"[\s\S]*?<\/nav>/);
      assert.ok(nav, `${path.relative(outDir, file)} carries no cross-link nav`);

      for (const href of [...nav[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
        const resolved = path.resolve(path.dirname(file), href);
        const target = href.endsWith('/') ? path.join(resolved, 'index.html') : resolved;
        assert.ok(
          await fs.stat(target).then(() => true, () => false),
          `${path.relative(outDir, file)} -> ${href} does not exist`,
        );
        if (href !== '../'.repeat(path.relative(outDir, path.dirname(file)).split(path.sep).length)) {
          const slug = path.basename(path.dirname(target));
          assert.ok(slugs.has(slug) || slug === path.basename(outDir), `${href} is not a published tool`);
        }
      }
    }
  }
});

test('a tool is never offered as its own sibling', async () => {
  const { surfaces } = await site();
  for (const surface of surfaces) {
    const siblings = siblingsFor(surface.slug, surfaces);
    assert.ok(!siblings.some((s) => s.slug === surface.slug), `${surface.slug} links to itself`);
    assert.equal(new Set(siblings.map((s) => s.slug)).size, siblings.length, 'duplicate siblings');
  }
});

test('siblings prefer the same category, and top up when it is small', async () => {
  const { surfaces } = await site();
  const siblings = siblingsFor('etsy-profit-calculator', surfaces);
  assert.equal(siblings.length, SIBLING_COUNT);
  assert.ok(
    siblings.every((s) => categoryFor(s.slug).id === 'marketplace'),
    'a large category should fill entirely from itself',
  );

  // A category of one still gets a full set, from the rest of the site.
  const lonely = [
    { slug: 'only-bid-calculator', title: 'Only' },
    { slug: 'amazon-fba-calculator', title: 'Amazon' },
    { slug: 'ebay-fee-calculator', title: 'eBay' },
  ];
  assert.equal(siblingsFor('only-bid-calculator', lonely).length, 2);
});

test('siblings rotate, so links spread across the site instead of pooling', async () => {
  // Always taking the first N would funnel every internal link on 36 tools
  // into whichever four sort first, and offer a returning visitor the same
  // four every time.
  const { surfaces } = await site();
  const first = siblingsFor(surfaces[0].slug, surfaces).map((s) => s.slug).join();
  const later = siblingsFor(surfaces[surfaces.length - 1].slug, surfaces).map((s) => s.slug).join();
  assert.notEqual(first, later);
});

test('a single tool gets no cross-link block rather than an empty one', () => {
  assert.deepEqual(siblingsFor('only-one', [{ slug: 'only-one', title: 'Only' }]), []);
});

test('cross-link markup escapes venture copy', () => {
  const block = renderCrossLinks({
    siblings: [{ slug: 'x', title: '<script>alert(1)</script>' }],
    depth: 1,
  });
  assert.ok(!block.includes('<script>alert(1)</script>'));
  assert.ok(block.includes('&lt;script&gt;'));
});

test('the cross-link block makes no off-origin request', () => {
  const block = renderCrossLinks({ siblings: [{ slug: 'x', title: 'X' }], depth: 1 });
  assert.ok(!/https?:\/\//.test(block), 'links must stay relative so the site moves as one');
});

test('rebuilding over an existing tree does not stack two footers', async () => {
  const { outDir } = await site();
  const page = await fs.readFile(path.join(outDir, 'ebay-fee-calculator', 'index.html'), 'utf8');
  assert.equal(page.split('class="portfolio-crosslinks"').length - 1, 1);
});
