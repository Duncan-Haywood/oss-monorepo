import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateQuote, DEFAULTS } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('makes no dollar-figure claim about a named vendor', () => {
  // This is a generic-method comparison (a spreadsheet), so it is exempt
  // from the not-affiliated clause -- see COMPARISON_DISCLAIMER_EXEMPT in
  // platform/pages/clauses.mjs. It links to the venture's own vs-jobber.html
  // by name, which is a cross-link, not a comparison claim -- so pin the
  // absence of a dollar figure near that mention instead of the word itself.
  assert.doesNotMatch(html, /Jobber[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/dumpster-rental-margin-calculator\/vs-a-spreadsheet\.html">/,
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
  assert.match(indexHtml, /href="\.\/vs-a-spreadsheet\.html"|href="vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator, the overage guide, and the Jobber comparison', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="why-your-overage-fee-might-be-losing-you-money\.html"/);
  assert.match(html, /href="vs-jobber\.html"/);
});

test('the worked overage-loss example matches calc.mjs for the same inputs', () => {
  const input = { ...DEFAULTS, overageRatePerTon: 55, expectedWeightTons: 5 };
  const result = calculateQuote(input);
  assert.equal(result.overageRateCoversDisposal, false);
  assert.equal(Math.round(result.expectedOverageProfit), -30);
  assert.equal(Math.round(result.baseProfit * 100) / 100, 105.30);
  assert.equal(Math.round(result.expectedProfit * 100) / 100, 75.30);
  assert.equal(Math.round(result.maxOverageTonsBeforeLoss * 100) / 100, 10.53);
  assert.match(html, /\$105\.30/);
  assert.match(html, /\$75\.30/);
  assert.match(html, /10\.53 tons/);
});
