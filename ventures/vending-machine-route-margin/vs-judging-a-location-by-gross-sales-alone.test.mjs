import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculate } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-judging-a-location-by-gross-sales-alone.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /MIT licensed/);
  assert.match(html, /GitHub Sponsors/);
});

test('names no specific competing product or company', () => {
  // This is the generic-method comparison (gross sales alone) rather than a
  // named-competitor page, so it carries no trademark/affiliation
  // disclaimer and is registered in clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT set instead -- see this venture's
  // vs-cantaloupe.html and vs-vendsoft.html for the named-product class.
  assert.doesNotMatch(html, /not\s+affiliated\s+with/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-judging-a-location-by-gross-sales-alone\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-judging-a-location-by-gross-sales-alone\.html"|href="vs-judging-a-location-by-gross-sales-alone\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-judging-a-location-by-gross-sales-alone\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the anchors this page links to actually exist on the tool page', () => {
  assert.match(indexHtml, /id="profit"/);
  assert.match(indexHtml, /id="routeTotal"/);
});

test('the worked example figures match calc.mjs\'s own arithmetic', () => {
  const A = { unitsSold: 60, pricePerUnit: 1.75, costPerUnit: 0.55, commissionPct: 25, cardFeePct: 2.6, shrinkPct: 5, restockMinutes: 12, driveMinutes: 35, mileage: 18, mileageRate: 0.67, targetHourlyRate: 22, machineMonthlyCost: 15, visitsPerMonth: 4 };
  const B = { unitsSold: 38, pricePerUnit: 1.75, costPerUnit: 0.55, commissionPct: 10, cardFeePct: 2.6, shrinkPct: 2, restockMinutes: 10, driveMinutes: 8, mileage: 3, mileageRate: 0.67, targetHourlyRate: 22, machineMonthlyCost: 15, visitsPerMonth: 4 };
  const rA = calculate(A);
  const rB = calculate(B);

  assert.equal(rA.grossRevenue.toFixed(2), '105.00');
  assert.equal(rB.grossRevenue.toFixed(2), '66.50');
  assert.equal(rA.totalCost.toFixed(2), '96.67');
  assert.equal(rB.totalCost.toFixed(2), '42.06');
  assert.equal(rA.netProfit.toFixed(2), '8.33');
  assert.equal(rB.netProfit.toFixed(2), '24.44');
  assert.equal(rA.monthlyProfit.toFixed(2), '33.31');
  assert.equal(rB.monthlyProfit.toFixed(2), '97.77');

  // The page's own claims: A has 58% more gross sales than B, and B nets
  // nearly 3x A's monthly profit.
  assert.ok(rB.monthlyProfit / rA.monthlyProfit > 2.9);
  assert.ok((rA.grossRevenue / rB.grossRevenue - 1) > 0.57);

  for (const figure of ['105.00', '66.50', '96.67', '42.06', '8.33', '24.44', '33.31', '97.77']) {
    assert.ok(html.includes(figure), `worked example figure $${figure} not found on the page`);
  }
});
