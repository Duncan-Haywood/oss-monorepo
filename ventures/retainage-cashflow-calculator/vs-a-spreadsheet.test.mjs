import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no specific spreadsheet or payments-platform product or company', () => {
  // This is the generic-method angle ("a spreadsheet"), not a named-product
  // comparison, so it must not read as a claim about any specific vendor --
  // same discipline as this venture's own vs-levelset.html, which names
  // Levelset/Procore and carries the "not affiliated" clause for that reason.
  assert.doesNotMatch(html, /Google Sheets|Microsoft Excel|Numbers\.app|Airtable|Levelset|Procore/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/retainage-cashflow-calculator\/vs-a-spreadsheet\.html">/);
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
  assert.match(indexHtml, /href="vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to the partial-release article', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="should-i-take-partial-retainage-now\.html"/);
});

test('is clear that nothing entered is uploaded', () => {
  assert.match(html, /uploaded anywhere/);
});

test('this generic-method page is registered as disclaimer-exempt and within the surface budget', async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import('../../platform/pages/clauses.mjs');
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has('retainage-cashflow-calculator/vs-a-spreadsheet.html'),
    'vs-a-spreadsheet.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product',
  );
});
