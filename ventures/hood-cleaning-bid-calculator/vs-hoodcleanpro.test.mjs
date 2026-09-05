import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-hoodcleanpro.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, fire-code, or business advice/i);
});

test('carries the nothing-leaves-your-browser notice and the licence link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /href="LICENSE"/);
});

test('states it is not affiliated with HoodClean Pro', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by HoodClean Pro/);
});

test('no unverifiable price is claimed for HoodClean Pro', () => {
  // hoodcleanpro.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary
  // vendor sites) -- same discipline vs-coatingos.html uses for CoatingOS
  // and vs-paintscout.html uses for PaintScout. A web search (a separate
  // tool from WebFetch, not blocked) surfaced HoodClean Pro's product
  // category (an all-in-one field platform for commercial kitchen exhaust
  // and fire-protection professionals covering NFPA 96 and NFPA 17A) and
  // that its pricing is not publicly listed, so no dollar figure for it is
  // stated anywhere on this page.
  assert.doesNotMatch(html, /HoodClean Pro[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/hood-cleaning-bid-calculator\/vs-hoodcleanpro\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-hoodcleanpro\.html"|href="vs-hoodcleanpro\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-hoodcleanpro\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
