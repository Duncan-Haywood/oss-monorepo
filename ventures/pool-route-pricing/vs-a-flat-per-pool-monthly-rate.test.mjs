import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculate } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-pool-monthly-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the "nothing leaves your browser" notice and the sponsors link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat per-pool
  // rate), not a named competitor -- distinct from this venture's own
  // vs-skimmer.html, which names Skimmer and carries its own "not
  // affiliated" clause. It is registered as disclaimer-exempt in
  // clauses.mjs on that basis, so it must never pick up a product name.
  assert.doesNotMatch(html, /Skimmer|PoolBrain|PoolTrac/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-per-pool-monthly-rate\.html">/);
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

test('the worked example figures match calc.mjs for both route densities', () => {
  const tight = calculate({
    accounts: 40, visits: 4, serviceMinutes: 35, driveMinutes: 12,
    laborRate: 28, chemicalCost: 18, overhead: 12, targetMargin: 35,
  });
  assert.equal(tight.monthlyHours.toFixed(1), '125.3');
  assert.equal(tight.totalCost.toFixed(2), '6869.33');
  assert.equal(tight.minimumMonthlyPrice.toFixed(2), '264.21');

  const spread = calculate({
    accounts: 40, visits: 4, serviceMinutes: 35, driveMinutes: 25,
    laborRate: 28, chemicalCost: 18, overhead: 12, targetMargin: 35,
    currentPrice: tight.minimumMonthlyPrice,
  });
  assert.equal(spread.monthlyHours, 160);
  assert.equal(spread.totalCost.toFixed(2), '7840.00');
  assert.equal(spread.minimumMonthlyPrice.toFixed(2), '301.54');

  // Quoting the tight route's flat rate on the spread-out route.
  assert.equal(spread.current.margin.toFixed(1), '25.8');
  assert.equal(spread.current.belowBreakEven, false);
  assert.equal(spread.current.gapToMinimum.toFixed(2), '37.33');
  assert.equal((spread.current.gapToMinimum * spread.accounts).toFixed(2), '1493.33');
  assert.equal((spread.current.gapToMinimum * spread.accounts * 12).toFixed(2), '17920.00');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-pool-monthly-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-pool-monthly-rate\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-pool-service\.html"/);
});
