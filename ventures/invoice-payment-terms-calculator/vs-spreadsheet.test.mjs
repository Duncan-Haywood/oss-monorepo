import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('names no specific competing product', () => {
  // Generic-method comparison (spreadsheet / doing it by hand), not a named
  // product -- same discipline the surface-budget angle check relies on to
  // tell this page apart from vs-quickbooks-online-invoicing.html.
  assert.doesNotMatch(html, /quickbooks|freshbooks|xero|wave|intuit/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-spreadsheet\.html">/);
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
  assert.match(indexHtml, /href="vs-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to the early-pay/factoring comparisons', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="should-i-offer-2-10-net-30\.html"/);
  assert.match(html, /href="should-i-factor-this-invoice\.html"/);
});

test('it reports facts, not a recommendation to abandon spreadsheets', () => {
  assert.doesNotMatch(html, /you should switch|replace your spreadsheet|better than a spreadsheet/i);
});
