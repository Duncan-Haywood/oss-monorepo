import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COUNTER_ATTR, COUNTER_SCRIPT, CUSTOM_DEV_PATH, INDUSTRIES_PATH, PRODUCTS_PATH, buildProducts, industryPath, productSitemapPaths,
  renderIndustriesPage, renderIndustryPage, renderProductCard, renderProductsPage,
} from './products.mjs';
import { INDUSTRIES, PRODUCT_LINES, hardwareLines, industriesWithoutProducts } from './business.mjs';
import { SITE_NAV } from './site-nav.mjs';
import { CUSTOM_DEV_PATH as BUILD_CUSTOM_DEV_PATH, renderHub, renderHubSitemap } from './build.mjs';
import { badSelectors, styleBlocks } from './css-lint.mjs';

const BASE = 'https://example.test/';
const HERE = path.dirname(fileURLToPath(import.meta.url));

test('Products comes first in the top navigation, then Industries', () => {
  assert.deepEqual(SITE_NAV.slice(0, 2).map((i) => [i.id, i.href]), [['products', PRODUCTS_PATH], ['industries', INDUSTRIES_PATH]]);
});

test('the counter script names match build.mjs', () => {
  const src = readFileSync(path.join(HERE, 'build.mjs'), 'utf8');
  assert.ok(src.includes(`CHROME_MODULE_FILE = '${COUNTER_SCRIPT}'`));
  assert.ok(src.includes(`CHROME_SLUG_ATTR = '${COUNTER_ATTR}'`));
});

test('/products/ lists every line and the hardware, with disclaimer, counter and canonical', () => {
  const html = renderProductsPage({ baseUrl: BASE });
  for (const l of PRODUCT_LINES) assert.ok(html.includes(`id="${l.id}"`), l.id);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/products\/">/);
  assert.match(html, /data-pfs-nav="products" href="..\/products\/" aria-current="page"/);
  assert.match(html, /no warranty/i);
  assert.match(html, /<script src="..\/pf-site.js" data-pf-slug="products" defer><\/script>/);
  assert.match(html, /id="hardware"/);
  assert.match(html, /Nothing has been physically built/);
  // The live product links to itself; the rest ask for early access.
  assert.match(html, /<a class="pl-go" data-status="live" href="..\/grants\/"/);
  // An app on its own origin keeps its https link and says what Free does (2026-11-27).
  assert.match(html, /<a class="pl-go" data-status="live" href="https:\/\/seller-books\.marisstella\.app\/signup\?from=products" data-pf-to="seller-books">Start free in Seller Books<\/a>/);
  assert.match(html, /<p class="pl-plan">Free on one job, no card/);
  assert.equal((html.match(/Ask for early access/g) ?? []).length, PRODUCT_LINES.filter((l) => l.status === 'early-access').length);
  assert.equal((html.match(/data-status="long-term"/g) ?? []).length, hardwareLines().length);
  assert.match(html, /For CNC machine shops/);
  assert.match(html, /For small nonprofits/);
});

test('a card drops a free tool the build did not publish, and uses its short name when it did', () => {
  const line = PRODUCT_LINES.find((l) => l.id === 'contractor-billing');
  const html = renderProductCard(line, { toRoot: '../', published: new Map([['lien-waiver-checker', 'Lien waiver checker']]) });
  assert.match(html, /<a href="..\/lien-waiver-checker\/" data-pf-to="lien-waiver-checker">Lien waiver checker<\/a>/);
  assert.doesNotMatch(html, /pay-application-generator/);
  const none = renderProductCard(line, { published: new Set() });
  assert.doesNotMatch(none, /pl-tools/);
});

test('/industries/ links each industry page, and each industry page lists its lines', () => {
  const index = renderIndustriesPage({ baseUrl: BASE });
  assert.match(index, /data-pfs-nav="industries" href="..\/industries\/" aria-current="page"/);
  assert.match(index, /no warranty/i);
  for (const i of INDUSTRIES) {
    assert.ok(index.includes(`href="../${industryPath(i.slug)}"`), i.slug);
    const page = renderIndustryPage(i, { baseUrl: BASE });
    assert.ok(page.includes(`<link rel="canonical" href="${BASE}${industryPath(i.slug)}">`), i.slug);
    assert.match(page, /no warranty/i);
    assert.ok(page.includes(`data-pf-slug="industries/${i.slug}"`), i.slug);
    for (const l of PRODUCT_LINES.filter((x) => x.industry === i.slug)) assert.ok(page.includes(`id="${l.id}"`), `${i.slug}: ${l.id}`);
    assert.match(page, /aria-label="Breadcrumb"/);
  }
});

test('the custom development path matches build.mjs', () => {
  assert.equal(CUSTOM_DEV_PATH, BUILD_CUSTOM_DEV_PATH);
});

test('an industry with no product says so, lists its jobs and tools, and asks what to build first', () => {
  const index = renderIndustriesPage();
  assert.ok(index.indexOf('Products in development') < index.indexOf('Free tools today, products next'));
  for (const i of industriesWithoutProducts()) {
    const page = renderIndustryPage(i, { baseUrl: BASE });
    assert.match(page, /There is no paid product for you yet/, i.slug);
    const main = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
    assert.doesNotMatch(main, /early access|class="pl-card"/i, `${i.slug}: no product card or early-access offer`);
    for (const p of i.problems) assert.ok(page.includes(p.replace(/&/g, '&amp;')), `${i.slug}: ${p}`);
    for (const slug of i.tools) assert.ok(page.includes(`href="../../${slug}/"`), `${i.slug}: ${slug}`);
    assert.ok(page.includes(`mailto:hello@marisstella.app?subject=Build%20first%20for%20`), i.slug);
    assert.ok(page.includes(`href="../../${CUSTOM_DEV_PATH}"`), i.slug);
    const desc = page.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(desc.length <= 160, `${i.slug}: description ${desc.length}`);
  }
  // A tool the build did not publish is left out rather than linked to a 404.
  const [first] = industriesWithoutProducts();
  const page = renderIndustryPage(first, { published: new Set([first.tools[0]]) });
  assert.ok(page.includes(`href="../../${first.tools[0]}/"`));
  assert.ok(!page.includes(`href="../../${first.tools[1]}/"`));
});

test('the pages carry both colour schemes and valid CSS', () => {
  for (const html of [renderProductsPage(), renderIndustriesPage(), renderIndustryPage(INDUSTRIES[0]), renderIndustryPage(industriesWithoutProducts()[0])]) {
    assert.match(html, /prefers-color-scheme: dark/);
    for (const block of styleBlocks(html)) assert.deepEqual(badSelectors(block), []);
  }
});

test('buildProducts writes every page the sitemap lists, and the hub sitemap lists them', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'products-'));
  try {
    await buildProducts(out, BASE);
    for (const p of productSitemapPaths()) assert.ok((await readFile(path.join(out, p, 'index.html'), 'utf8')).length > 1000, p);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  const sitemap = renderHubSitemap(BASE);
  for (const p of productSitemapPaths()) assert.ok(sitemap.includes(`<loc>${BASE}${p}</loc>`), p);
});

test('the hub leads with the finder and the products, then frames the tools as free tools for the same businesses', () => {
  const surfaces = [{ slug: 'roofing-bid-calculator', title: 'Roofing bid', description: 'Price a roof.', pageCount: 1 }];
  const html = renderHub(surfaces, BASE);
  const hero = html.slice(html.indexOf('<header class="hero">'), html.indexOf('</header>', html.indexOf('<header class="hero">')));
  assert.match(hero, /Software for small businesses/);
  assert.match(hero, /PayApps, Seller Books and Grant Autopilot are live/);
  assert.match(hero, /What kind of business do you run\?/);
  assert.match(hero, /href="industries\/construction\/#contractor-billing"/);
  assert.doesNotMatch(hero, /role="search"/, 'the search is not the front door any more');
  const at = (needle) => html.indexOf(needle);
  assert.ok(at('id="products"') > 0 && at('id="products"') < at('id="free-tools"'), 'products before the free tools');
  // The roofing tool is published, so the takeoff card links it; unpublished tools drop out.
  assert.match(html, /href="roofing-bid-calculator\/" data-pf-to="roofing-bid-calculator">Roofing bid</);
  assert.doesNotMatch(html.slice(at('id="products"'), at('id="free-tools"')), /href="wall-framing-takeoff\//);
  // Never "live" for anything else.
  assert.doesNotMatch(html, /Job shop quoting (is|are) live|Job shop quoting · live|Takeoff and material lists · live/);
});

