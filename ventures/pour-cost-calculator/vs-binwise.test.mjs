import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-binwise.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, accounting, insurance, alcohol-service, or financial advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('states it is not affiliated with BinWise', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by BinWise/);
});

test('no unverifiable price is claimed for BinWise', () => {
  // binwise.com is not reachable from this session with WebFetch (the egress
  // proxy blocks it), but a web search (a separate tool, not blocked)
  // surfaced BinWise's own marketing pages describing it as bar/beverage
  // inventory software that links to a POS and tracks pour cost and variance
  // automatically -- a well-documented identity and category, but no plan
  // name or dollar figure this session could treat as BinWise's own current
  // pricing. None is stated here, the same discipline
  // quote-margin-check/site/vs-bonsai.html uses for Bonsai.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-binwise\.html">/);
});

test('has Open Graph title/description tags in this venture\'s tag style', () => {
  assert.match(html, /<meta property="og:title" content="[^"]+">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
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
  assert.match(indexHtml, /href="\.\/vs-binwise\.html"|href="vs-binwise\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-binwise\.html/);
});

test('the comparison page links back to the calculator and to the how-to walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-calculate-pour-cost\.html"/);
});
