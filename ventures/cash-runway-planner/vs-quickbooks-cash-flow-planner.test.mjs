import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-quickbooks-cash-flow-planner.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, tax, or legal advice/i);
});

test('states it is not affiliated with Intuit', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Intuit/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-quickbooks-cash-flow-planner\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('does not claim the competitor lacks one-off/dated items, since it has them', () => {
  // QuickBooks' own Cash Flow Planner documentation describes a one-time
  // "event" (name, amount, direction, date) -- the same shape as this
  // calculator's one-off rows. A page that claimed otherwise would be false.
  assert.doesNotMatch(html, /QuickBooks[^.]*\bcannot\b[^.]*one-off/i);
  assert.doesNotMatch(html, /QuickBooks[^.]*\bno\b[^.]*one-time/i);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-quickbooks-cash-flow-planner\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-quickbooks-cash-flow-planner\.html/);
});
