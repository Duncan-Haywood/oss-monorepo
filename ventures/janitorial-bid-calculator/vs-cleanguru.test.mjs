import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-cleanguru.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with CleanGuru', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by CleanGuru/);
});

test('no unverifiable price is claimed for CleanGuru', () => {
  // www.cleanguru.com is not reachable from this session -- WebFetch to it
  // returned EGRESS_BLOCKED, confirmed live, the same signature recorded
  // against www.moraware.com, www.homelight.com, docs.github.com and
  // en.wikipedia.org in this session and against sell.amazon.com,
  // sellercentral.amazon.com, www.ebay.com, docs.aws.amazon.com and
  // en.wikipedia.org in the session that shipped vs-amazon-revenue-
  // calculator.html. A web search (a separate tool from WebFetch, not
  // blocked) surfaced CleanGuru's own public product pages -- it is real,
  // account-based janitorial bidding, work-loading, and mobile-checklist
  // software with a mobile app -- but no plan name or dollar figure, so
  // none is repeated as fact here. Same discipline vs-moraware.html uses
  // for Moraware/CounterGo and vs-pestpac.html uses for PestPac: only
  // well-documented, non-numeric identity facts (product category, the
  // bidding-calculator and work-loading focus, the mobile app, the
  // account-based model) are stated; no dollar figure for CleanGuru
  // appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-cleanguru\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-cleanguru\.html"|href="vs-cleanguru\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-cleanguru\.html/);
});

test('the comparison page links back to the calculator and to the three renewal-question pages', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="5x-vs-3x-cleaning-price\.html"/);
  assert.match(html, /href="should-i-let-them-buy-the-paper\.html"/);
  assert.match(html, /href="should-i-throw-in-the-initial-clean\.html"/);
});

test('carries no third-party script or stylesheet', () => {
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["'][^>]*href=["']https?:\/\//i);
});
