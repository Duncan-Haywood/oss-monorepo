import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-vehicle-tint-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, safety, or automotive advice/i);
});

// The page prices the pane/film/removal scope the user picks; it must never
// read as certifying tint-darkness legality, the same discipline the
// calculator's own footer already applies.
test('does not claim it checks tint darkness (VLT%) law', () => {
  assert.match(html, /judgment call for the installer on site/);
});

// This page compares against a generic pricing method (a flat per-vehicle
// price), not a named competitor, so it names no company and carries no
// affiliation disclaimer.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /3M|Llumar|XPEL|Ceramic Pro|Tintworld/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-per-vehicle-tint-price\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-per-vehicle-tint-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-vehicle-tint-price\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
