import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-package-names-by-eye.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = fs.readFileSync(new URL('./what-is-slopsquatting.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not a malware scanner/i);
});

test('carries the support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no company or product being compared against', () => {
  assert.doesNotMatch(html, /not\s+affiliated\s+with/i, 'this page compares against a generic method, not a named product');
});

test('makes no network call of its own', () => {
  assert.doesNotMatch(html, /\bfetch\s*\(/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-package-names-by-eye\.html">/);
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

test('the comparison page is linked from the tool page', () => {
  assert.match(indexHtml, /href="\.\/vs-checking-package-names-by-eye\.html"|href="vs-checking-package-names-by-eye\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-checking-package-names-by-eye\.html/);
});

test('the comparison page links back to the tool and the guide page', () => {
  assert.match(html, /href="\.\/"/);
});

test('the guide page links to the comparison page too', () => {
  assert.match(guideHtml, /href="\.\/vs-checking-package-names-by-eye\.html"|href="vs-checking-package-names-by-eye\.html"/);
});
