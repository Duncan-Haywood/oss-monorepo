import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-tracking-it-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, fire-code, or business advice/i);
});

test('names no vendor, competing calculator, or estimating platform', () => {
  // This page compares against a generic method (tracking a bid in a
  // spreadsheet), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest, the same discipline this venture's own
  // vs-hoodcleanpro.html and vs-hoodcleaningdispatch.html use.
  assert.doesNotMatch(html, /HoodClean ?Pro|Hood Cleaning Dispatch|ServiceTitan|Jobber/i);
});

test('the canonical tag names this file, relative to the venture root', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-tracking-it-in-a-spreadsheet\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-tracking-it-in-a-spreadsheet\.html"|href="vs-tracking-it-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-tracking-it-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
