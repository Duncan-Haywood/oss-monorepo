import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-tracking-it-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('names no vendor or competing tracker product', () => {
  // Generic-method page (tracking thresholds in a spreadsheet), not a named
  // product, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- same discipline as the sibling
  // vs-paid-nexus-monitoring-software.html, which does name Avalara/TaxJar
  // and does carry that clause.
  assert.doesNotMatch(html, /Avalara|TaxJar/i);
});

test('the canonical tag names this file, relative to the venture root', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-tracking-it-in-a-spreadsheet\.html">/);
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

test('the comparison page is linked from the tracker page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-tracking-it-in-a-spreadsheet\.html"|href="vs-tracking-it-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tracking-it-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the tracker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('names no state twice with conflicting logic and correctly names the AND states', () => {
  assert.match(html, /Connecticut and New York require both/);
});
