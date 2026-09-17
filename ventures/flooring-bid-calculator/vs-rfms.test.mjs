import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-rfms.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with RFMS', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by RFMS/);
});

test('no unverifiable price is claimed for RFMS', () => {
  // www.rfms.com is not reachable from this session -- WebFetch to
  // www.rfms.com returned EGRESS_BLOCKED, confirmed live. A web search (a
  // separate tool from WebFetch, not blocked) surfaced RFMS's own founding
  // year (1984), company name (Resource & Financial Management Systems),
  // parent company (Cyncly), dealer/location count (3,000+ dealers, 7,000+
  // locations), and product line (Core ERP, Measure takeoff) from RFMS's own
  // and Cyncly's marketing pages, but no dollar figure for RFMS from RFMS's
  // own current pricing page -- it is quote-based and not publicly listed --
  // so none is repeated as fact here. Same discipline vs-paintscout.html
  // uses for PaintScout and vs-moraware.html uses for Moraware. Only
  // well-documented, non-numeric identity facts (product category, ERP plus
  // separate takeoff-product focus, dealer-account subscription model,
  // founding year, dealer/location count) are stated; no dollar figure for
  // RFMS appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-rfms\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-rfms\.html"|href="vs-rfms\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-rfms\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
