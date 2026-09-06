import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-atm-depot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the best-effort hosting and licence/support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /Free and open source/);
  assert.match(html, /href="LICENSE"/);
});

test('states it is not affiliated with ATM Depot', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by ATM Depot/);
});

test('no unverifiable price is claimed for ATM Depot', () => {
  // ATM Depot's own profit-calculator page publishes no dollar figure
  // reachable from this session's WebSearch access (WebFetch on the live
  // page is blocked by the network egress proxy) -- only well-documented,
  // non-numeric facts (email-gated quote, single-machine framing, no
  // commission/vault-cash/travel fields) are stated here, the same
  // discipline vs-photobooth-supply-co.html and vs-vendr.html use for their
  // own competitors.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-atm-depot\.html">/);
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
  assert.match(indexHtml, /href="vs-atm-depot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-atm-depot\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
