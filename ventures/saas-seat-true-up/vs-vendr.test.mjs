import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-vendr.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not financial or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /GitHub Sponsors/);
});

test('states it is not affiliated with Vendr', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Vendr/);
});

test('no unverifiable price is claimed for Vendr', () => {
  // Vendr prices by quote and a percentage-of-savings fee, neither a fixed
  // dollar figure -- same discipline vs-zylo.html uses for its own
  // competitor, whose own pricing pages are also not reachable from this
  // session to confirm.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-vendr\.html">/);
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

test('distinguishes Vendr (a negotiation/buying service) from Zylo (a discovery platform), not a repeat of the same pitch', () => {
  // Two competitor pages that both just say "generic SaaS platform vs our
  // free calculator" would be thin, near-duplicate content. Vendr's own job
  // is negotiating price; the page must say so rather than reusing Zylo's
  // "discovers your portfolio" framing.
  assert.match(html, /negotiat/i);
  assert.doesNotMatch(html, /discovers your organization's entire SaaS portfolio/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-vendr\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-vendr\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
