import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculate, computeRouteProfit, incomeGap, DEFAULTS } from './calc.mjs';

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
  // platform/pages/clauses.mjs. It links to the venture's own vs-atm-depot.html
  // by name, which is a cross-link, not a comparison claim -- so pin the
  // absence of a dollar figure near that mention instead of the word itself.
  assert.doesNotMatch(html, /ATM Depot[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/atm-route-margin\/vs-a-spreadsheet\.html">/,
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

test('the comparison page links back to the calculator, the placement-offer guide, and the ATM Depot comparison', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="is-this-atm-placement-worth-it\.html"/);
  assert.match(html, /href="vs-atm-depot\.html"/);
});

test('the worked vault-cash-cost example matches calc.mjs for the same inputs', () => {
  const input = { ...DEFAULTS, averageCashLoad: 8000, cashCostAnnualRatePct: 18 };
  const withCashCost = calculate(input);
  const withoutCashCost = calculate({ ...input, cashCostAnnualRatePct: 0 });

  assert.equal(Math.round(withCashCost.cashCost * 100) / 100, 120);
  assert.equal(Math.round(withoutCashCost.netProfit * 100) / 100, 143.53);
  assert.equal(Math.round(withCashCost.netProfit * 100) / 100, 23.53);
  assert.equal(Math.round(withoutCashCost.profitMarginPct * 100) / 100, 23.72);
  assert.equal(Math.round(withCashCost.profitMarginPct * 100) / 100, 3.89);

  assert.match(html, /\$605\.00/);
  assert.match(html, /\$143\.53/);
  assert.match(html, /\$120\.00/);
  assert.match(html, /\$23\.53/);
  assert.match(html, /23\.72%/);
  assert.match(html, /3\.89%/);
});

test('the worked route income-gap example matches calc.mjs for the same inputs', () => {
  const locations = [{ monthlyProfit: 185 }, { monthlyProfit: 60 }, { monthlyProfit: -10 }, { monthlyProfit: 40 }];
  const route = computeRouteProfit(locations);
  const gap = incomeGap(1200, route.totalMonthlyProfit, route.averageProfitPerLocation);

  assert.equal(route.totalMonthlyProfit, 275);
  assert.equal(route.averageProfitPerLocation, 68.75);
  assert.equal(gap.gap, 925);
  assert.equal(gap.additionalLocationsNeeded, 14);

  assert.match(html, /\$275/);
  assert.match(html, /\$68\.75/);
  assert.match(html, /\$925/);
  assert.match(html, /14 more locations/);
});
