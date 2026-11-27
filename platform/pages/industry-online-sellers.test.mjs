// The online sellers industry page: the problems, the product stated as in
// development, sourced facts only, real tool slugs, and the honesty lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ONLINE_SELLERS_PATH,
  ONLINE_SELLERS_TOOLS,
  ONLINE_SELLERS_PROBLEMS,
  ONLINE_SELLERS_AUDIENCES,
  ONLINE_SELLERS_FAQ,
  ONLINE_SELLERS_PRODUCT,
  onlineSellersTools,
  renderOnlineSellersPage,
} from './industry-online-sellers.mjs';
import { AUDIENCES } from './audiences.mjs';
import { renderOnlineSellersIndustryPage, renderHubSitemap } from './build.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'https://example.test/';
const shell = {
  head: ({ title, extraHead }) => `<!doctype html><html><head><title>${title}</title>${extraHead}</head>`,
  disclaimer: '<p>No warranty.</p>',
  tail: '<script src="x.js"></script>',
};
const all = [...ONLINE_SELLERS_TOOLS.map((t) => ({ slug: t.slug })), { slug: ONLINE_SELLERS_PRODUCT.freeSlug }];

test('every tool, problem link and the free product are real ventures', () => {
  for (const t of ONLINE_SELLERS_TOOLS) assert.ok(existsSync(path.join(repo, 'ventures', t.slug, 'index.html')), t.slug);
  assert.ok(existsSync(path.join(repo, 'ventures', ONLINE_SELLERS_PRODUCT.freeSlug, 'index.html')));
  const slugs = new Set(ONLINE_SELLERS_TOOLS.map((t) => t.slug));
  for (const p of ONLINE_SELLERS_PROBLEMS) for (const s of p.tools) assert.ok(slugs.has(s), `${p.id}: ${s}`);
});

test('a curated set, not every seller tool', () => {
  assert.ok(ONLINE_SELLERS_TOOLS.length >= 8 && ONLINE_SELLERS_TOOLS.length <= 16, String(ONLINE_SELLERS_TOOLS.length));
  assert.equal(new Set(ONLINE_SELLERS_TOOLS.map((t) => t.slug)).size, ONLINE_SELLERS_TOOLS.length);
});

test('linked audience pages exist in audiences.mjs', () => {
  const ids = new Set(AUDIENCES.map((a) => a.id));
  for (const a of ONLINE_SELLERS_AUDIENCES) assert.ok(ids.has(a.id), a.id);
});

test('covers the problems the brief names', () => {
  const ids = ONLINE_SELLERS_PROBLEMS.map((p) => p.id);
  for (const id of ['true-profit', 'payouts', 'cogs', 'mileage', 'schedule-c', 'thresholds']) assert.ok(ids.includes(id), id);
});

test('says Free is open with the app\'s own limits, takes no money, and is not tax advice', () => {
  // Seller Books opened its Free plan on 2026-11-27 (seller-books-deploy run 45973427499).
  const html = renderOnlineSellersPage({ baseUrl: base, surfaces: all, shell });
  assert.match(html, /Open · free on one platform/);
  assert.match(html, /href="https:\/\/seller-books\.marisstella\.app\/signup\?from=industries%2Fonline-sellers">Start free in Seller Books/);
  assert.match(html, /up to 25 orders a month, with no card/);
  assert.match(html, /not on sale yet/);
  assert.doesNotMatch(html, /early access|In development/i);
  assert.match(html, /Not tax advice/);
  assert.doesNotMatch(html, /\$\d+(\.\d\d)?\s*(\/|per )\s*mo/i, 'no price is set, so none is shown');
  assert.match(html, /No warranty/);
  assert.match(html, /x\.js/);
});

test('1099-K: the $20,000 and 200 federal threshold, cited to irs.gov, with no fear copy', () => {
  const html = renderOnlineSellersPage({ baseUrl: base, surfaces: all, shell });
  assert.match(html, /\$20,000 and 200 transactions/);
  assert.match(html, /href="https:\/\/irs\.gov\/newsroom\/irs-issues-faqs-on-form-1099-k-threshold/);
  assert.doesNotMatch(html, /\$600 (federal|threshold)|crackdown|the IRS is coming|don.t get caught|penalt/i);
});

test('tools the build did not publish are left out, never linked dead', () => {
  const some = [{ slug: 'ebay-fee-calculator' }];
  assert.deepEqual(onlineSellersTools(some).map((t) => t.slug), ['ebay-fee-calculator']);
  const html = renderOnlineSellersPage({ baseUrl: base, surfaces: some, shell });
  assert.ok(!html.includes('href="../../poshmark-fee-calculator/"'));
  assert.ok(!html.includes('Try the in-browser tool, no account'));
});

test('FAQ data matches the page, escaped and parseable', () => {
  const html = renderOnlineSellersPage({ baseUrl: base, surfaces: all, shell });
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal(ld.mainEntity.length, ONLINE_SELLERS_FAQ.length);
  for (const [q] of ONLINE_SELLERS_FAQ) assert.ok(html.includes(`<dt>${q.replace(/'/g, '&#39;')}</dt>`), q);
});

test('build wiring: real head and chrome script; the sitemap lists it as an industry page', () => {
  const html = renderOnlineSellersIndustryPage({ surfaces: all, baseUrl: base });
  assert.match(html, new RegExp(`<link rel="canonical" href="${base}${ONLINE_SELLERS_PATH}">`));
  assert.match(html, /data-pf-slug="industry-online-sellers"/);
  assert.match(html, /href="\.\.\/\.\.\/reseller-books\/"/);
  assert.ok(!/content="noindex"/.test(html));
  assert.match(renderHubSitemap(base, [], [], [], [], [ONLINE_SELLERS_PATH]), new RegExp(`${base}${ONLINE_SELLERS_PATH}`));
});
