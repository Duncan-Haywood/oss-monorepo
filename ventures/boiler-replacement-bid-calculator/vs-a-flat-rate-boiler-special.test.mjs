import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-boiler-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not heat-loss, fuel-gas-code, chimney-design, legal, tax, or financial advice/i);
});

// The page prices the plant the user picks; it must never read as sizing or
// certifying the flue, the gas piping, or the combustion venting -- same
// discipline vs-servicetitan.test.mjs applies to its sibling page.
test('does not claim it checks fuel-gas code or chimney safety', () => {
  assert.match(html, /judgment call for the licensed tech on site/);
});

// This page compares against a generic pricing method (a flat special),
// not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-servicetitan.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /ServiceTitan|Housecall|Jobber|Workiz|FieldEdge/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-boiler-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-rate-boiler-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-boiler-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
