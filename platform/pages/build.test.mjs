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
  renderHub,
  renderRobots,
  renderSitemapIndex,
  renderToolNav,
  hubPrefix,
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
// Cross-tool navigation
// ---------------------------------------------------------------------------
//
// The failure these prevent: a tool page that is reachable from a search
// result but is a dead end -- no way to the hub, no sibling tool. That costs
// every second page view the portfolio could have had, and nothing turns red.

const CATEGORY = { id: 'marketplace', title: 'Marketplace seller tools' };

test('hub prefix climbs out of any page depth', () => {
  assert.equal(hubPrefix(path.join('etsy-profit-calculator', 'index.html')), '../');
  assert.equal(hubPrefix(path.join('a', 'b', 'page.html')), '../../');
  assert.equal(hubPrefix('index.html'), './');
});

test('nav names the hub and the tool category', () => {
  const { header } = renderToolNav({
    slug: 'etsy-profit-calculator', category: CATEGORY, siblings: [], totalTools: 35, prefix: '../',
  });
  assert.ok(header.includes('href="../"'));
  assert.ok(header.includes('All 35 free tools'));
  assert.ok(header.includes('Marketplace seller tools'));
});

test('nav lists siblings and caps the strip', () => {
  const siblings = Array.from({ length: 9 }, (_, i) => ({ slug: `t${i}`, title: `Tool ${i}` }));
  const { footer } = renderToolNav({
    slug: 'self', category: CATEGORY, siblings, totalTools: 35, prefix: '../',
  });
  const links = footer.match(/<li>/g) ?? [];
  assert.equal(links.length, 6, 'five siblings plus the all-tools link');
  assert.ok(footer.includes('href="../t0/"'));
  assert.ok(!footer.includes('href="../t8/"'));
});

test('nav still offers the hub when a tool has no siblings', () => {
  const { footer } = renderToolNav({
    slug: 'only', category: CATEGORY, siblings: [], totalTools: 35, prefix: '../',
  });
  assert.ok(footer.includes('href="../"'));
  assert.ok(footer.includes('Browse all 35 tools'));
});

test('nav escapes sibling titles', () => {
  const { footer } = renderToolNav({
    slug: 'self',
    category: { id: 'x', title: '<script>alert(1)</script>' },
    siblings: [{ slug: 'y', title: '<img src=x onerror=1>' }],
    totalTools: 2,
    prefix: '../',
  });
  assert.ok(!footer.includes('<script>alert(1)</script>'));
  assert.ok(!footer.includes('<img src=x'));
  assert.ok(footer.includes('&lt;'));
});

test('every published page carries the nav exactly once', async () => {
  const { outDir, surfaces } = await site();
  const pages = [];
  for (const surface of surfaces) {
    const dir = path.join(outDir, surface.slug);
    for (const file of await fs.readdir(dir, { recursive: true })) {
      if (file.endsWith('.html')) pages.push(path.join(dir, file));
    }
  }
  assert.ok(pages.length > 100, `expected the whole portfolio, saw ${pages.length}`);

  for (const page of pages) {
    const html = await fs.readFile(page, 'utf8');
    const bars = html.match(/<nav class="pf-bar"/g) ?? [];
    assert.equal(bars.length, 1, `${path.relative(outDir, page)} should carry one nav bar`);
    assert.ok(html.includes('class="pf-more"'), `${path.relative(outDir, page)} has no sibling strip`);
  }
});

test('nav is inserted inside body, after the tool own head', async () => {
  const html = await read('etsy-profit-calculator', 'index.html');
  const body = html.search(/<body[^>]*>/i);
  assert.ok(body !== -1);
  assert.ok(html.indexOf('pf-bar') > body, 'nav must not be hoisted above <body>');
  assert.ok(html.indexOf('</head>') < html.indexOf('pf-bar'), "the tool's own styles load first");
  assert.ok(html.lastIndexOf('pf-more') < html.lastIndexOf('</body>'));
});

test('a rebuild over an existing tree does not stack nav bars', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-rebuild-'));
  await buildSite({ outDir, baseUrl: BASE });
  await buildSite({ outDir, baseUrl: BASE });
  const html = await fs.readFile(path.join(outDir, 'etsy-profit-calculator', 'index.html'), 'utf8');
  assert.equal((html.match(/<nav class="pf-bar"/g) ?? []).length, 1);
});

test('no venture ships its package manifest to visitors', async () => {
  const { outDir } = await site();
  const leaked = [];
  for (const file of await fs.readdir(outDir, { recursive: true })) {
    if (path.basename(file) === 'package.json') leaked.push(file);
  }
  assert.deepEqual(leaked, [], 'package.json exposes internal scripts and deps for no visitor benefit');
});
