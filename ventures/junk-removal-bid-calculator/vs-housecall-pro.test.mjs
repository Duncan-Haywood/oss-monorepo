import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-housecall-pro.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('states it is not affiliated with Housecall Pro', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Housecall Pro\./);
});

test('no unverifiable price is claimed for Housecall Pro', () => {
  // housecallpro.com is not reachable from this session (network egress in
  // this environment is proxied and does not permit fetching arbitrary
  // vendor sites), so no current plan name or dollar figure could be
  // confirmed against a primary source -- same discipline
  // locksmith-bid-calculator/vs-housecall-pro.html and
  // junk-removal-bid-calculator/vs-workiz.html use for the same reason.
  // Only the well-documented, non-numeric "200,000 field service
  // professionals" usage figure is stated; no dollar figure for Housecall
  // Pro appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/junk-removal-bid-calculator\/vs-housecall-pro\.html">/,
  );
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
  assert.match(indexHtml, /href="\.\/vs-housecall-pro\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-housecall-pro\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-price-junk-removal\.html"/);
});
