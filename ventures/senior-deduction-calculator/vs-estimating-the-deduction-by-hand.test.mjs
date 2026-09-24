import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-estimating-the-deduction-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('carries the nothing-leaves-your-browser clause', () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

test('names no vendor or competing product', () => {
  // Generic-method page (estimating by hand), not a named product, so it is
  // listed in platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // rather than carrying a "not affiliated" clause -- same discipline as its
  // siblings' vs-estimating-the-deduction-by-hand.html pages.
  assert.doesNotMatch(html, /not affiliated/i);
});

test('the canonical tag names this file, relative to the venture root', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-estimating-the-deduction-by-hand\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the comparison page is linked from the calculator page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-estimating-the-deduction-by-hand\.html"|href="vs-estimating-the-deduction-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-estimating-the-deduction-by-hand\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('names the correct MFS treatment, not the auto-loan sibling\'s', () => {
  assert.match(html, /MFS.*eligible|MFS is eligible/i);
  assert.match(html, /excludes MFS entirely/);
});
