import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-aspire.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not landscaping, horticultural, irrigation, construction, legal, tax, or financial advice/i);
});

test('carries the best-effort hosting notice', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('states it is not affiliated with Aspire or ServiceTitan', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Aspire Software or ServiceTitan/);
});

test('no unverifiable price is claimed for Aspire', () => {
  // Aspire's own site is not reachable from this session (network egress in
  // this environment is proxied and blocks fetching arbitrary vendor sites)
  // -- same discipline every other vs-aspire.html in this repo uses. Only
  // well-documented, non-numeric identity facts (product category, market
  // focus, the 2021 ServiceTitan acquisition, revenue-tiered plans with no
  // published price) are stated; no dollar figure for Aspire appears
  // anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-aspire\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-aspire\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-aspire\.html/);
});

test('the comparison page links back to the calculator and to the pricing article', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-install-sod\.html"/);
});
