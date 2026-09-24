import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculatePourCost } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, accounting, insurance, alcohol-service, or financial advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no spreadsheet application or vendor', () => {
  // Generic-method comparison -- against "a spreadsheet" in the abstract,
  // not any named product -- so this page is exempt from the trademark
  // disclaimer clauses.mjs requires for a vs-<competitor> page (see
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT). That
  // exemption only holds while the page truly names no vendor.
  assert.doesNotMatch(html, /Google Sheets|Excel|Microsoft|Airtable/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
});

test('has Open Graph title/description tags in this venture\'s tag style', () => {
  assert.match(html, /<meta property="og:title" content="[^"]+">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
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

test('the comparison page links back to the calculator and to the how-to walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-calculate-pour-cost\.html"/);
});

// The worked example is the page's central claim. Recomputed here against
// the module the calculator itself runs, rather than restated as hand-typed
// constants, so a change to the shipped arithmetic makes this page's claim
// false (and this test red) instead of merely stale.
test('the worked example matches what the shipped calculator computes', () => {
  const r = calculatePourCost({
    primaryBottleCost: 22,
    primaryBottleSizeOz: 25.4,
    primaryOzUsed: 1.5,
    mixerBottleCost: 4,
    mixerBottleSizeOz: 33.8,
    mixerOzUsed: 5,
    menuPrice: 7,
    targetPourCostPercent: 20,
    drinksPerWeek: 400,
    overPourOzPerDrink: 0.25,
  });

  assert.ok(r.ok);
  assert.equal(r.pourCostPercent.toFixed(1), '27.0');
  assert.equal(r.targetMenuPrice.toFixed(2), '9.45');
  assert.equal(r.pourCostPercentWithOverpour.toFixed(1), '30.1');
  assert.equal(r.overPourCostPerWeek.toFixed(2), '86.61');
  assert.equal(Math.round(r.overPourCostPerYear), 4504);

  for (const value of ['27.0%', '$9.45', '30.1%', '$86.61 a week', '$4,504 a year']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
