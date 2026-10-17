import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-monthly-fee.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, tax, legal, or engineering advice/i);
});

test('carries the "nothing leaves your browser" notice and the sponsors link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat monthly fee),
  // not a named competitor -- distinct from this venture's own
  // vs-servicetitan.html, which names ServiceTitan and carries its own
  // "not affiliated" clause. It is registered as disclaimer-exempt in
  // clauses.mjs on that basis, so it must never pick up a product name.
  assert.doesNotMatch(html, /ServiceTitan/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-monthly-fee\.html">/);
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

test('the worked example figures match calc.mjs for both account sizes', async () => {
  const { calculatePlan } = await import('./calc.mjs');
  const small = calculatePlan({
    visitsPerYear: 4, laborHoursPerVisit: 2, loadedHourlyRate: 45,
    travelCostPerVisit: 20, partsReservePerVisit: 35,
    callbackVisitsPerYear: 1, callbackHours: 1, callbackCostPerVisit: 25,
    annualOverhead: 120, targetMargin: 20, cancelAfterMonths: 3, proposedMonthlyPrice: 50,
  });
  assert.equal(small.annualCost, 770);
  assert.equal(small.monthlyPrice.toFixed(2), '80.21');
  assert.equal(small.breakEvenMonthlyPrice.toFixed(2), '64.17');
  assert.equal(small.cancellation.costIncurred, 337.5);
  assert.equal(small.cancellation.net.toFixed(2), '-96.88');
  assert.equal(small.proposed.cancellation.net, -187.5);
  assert.equal(small.proposed.annualProfit, -170);

  const big = calculatePlan({
    visitsPerYear: 8, laborHoursPerVisit: 2, loadedHourlyRate: 45,
    travelCostPerVisit: 20, partsReservePerVisit: 35,
    callbackVisitsPerYear: 2, callbackHours: 1, callbackCostPerVisit: 25,
    annualOverhead: 200, targetMargin: 20, proposedMonthlyPrice: 50,
  });
  assert.equal(big.annualCost, 1500);
  assert.equal(big.monthlyPrice.toFixed(2), '156.25');
  assert.equal(big.breakEvenMonthlyPrice.toFixed(2), '125.00');
  assert.equal(big.proposed.annualProfit, -900);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-monthly-fee\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-monthly-fee\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-an-hvac-maintenance-contract\.html"/);
});
