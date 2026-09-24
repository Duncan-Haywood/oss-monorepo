import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-urable.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not business, tax, financial, or professional advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with Urable', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Urable/);
});

test('no unverifiable price is claimed for Urable', () => {
  // urable.com is not reachable from this session (no WebFetch was attempted
  // against the competitor's own domain, same discipline as
  // vs-mobiletechrx.html). A web search (a separate tool from WebFetch)
  // surfaced Urable's identity and feature set corroborated across multiple
  // independent sources (urable.com itself, and third-party detailing-software
  // comparison write-ups from getdetaild.com, detailpilot.com, myquoteiq.com,
  // arrively.app, and roxohub.com): account-based work management software for
  // automotive detailing, PPF, vinyl wrap, tint, and ceramic coating
  // businesses, with VIN scanning, two-way Carfax service-history reporting,
  // before/after photo documentation, a 3D PPF/vinyl visualizer, and unlimited
  // users on every plan. No dollar figure for Urable could be verified against
  // its own current pricing, so none is repeated as fact here. Only
  // well-documented, non-numeric identity facts are stated; no dollar figure
  // appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-urable\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-urable\.html"|href="vs-urable\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-urable\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
