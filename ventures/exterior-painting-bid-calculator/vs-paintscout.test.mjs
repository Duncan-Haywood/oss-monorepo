import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-paintscout.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not construction, painting, lead-paint, building-code, legal, tax, or financial advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with PaintScout', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by PaintScout/);
});

test('no unverifiable price is claimed for PaintScout', () => {
  // paintscout.com is not reachable from this session -- WebFetch to
  // www.paintscout.com/pricing returned EGRESS_BLOCKED, confirmed live. A web
  // search (a separate tool from WebFetch, not blocked) surfaced third-party
  // aggregated figures (Capterra, MyQuoteIQ) for a Sales-plan seat price plus
  // an Operations add-on, but none of them are PaintScout's own current
  // pricing page and none is repeated as fact here. Same discipline
  // vs-moraware.html uses for Moraware and vs-marketsharp.html uses for
  // MarketSharp. Only well-documented, non-numeric identity facts (product
  // category, painting-specific estimating/proposal/follow-up focus,
  // per-seat subscription model, the separate production add-on) are
  // stated; no dollar figure for PaintScout appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-paintscout\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-paintscout\.html"|href="vs-paintscout\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-paintscout\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-paint-the-exterior-of-a-house\.html"/);
});
