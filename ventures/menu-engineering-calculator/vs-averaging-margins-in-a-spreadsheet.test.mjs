import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateMenu } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-averaging-margins-in-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('names no product, so it carries no trademark disclaimer', () => {
  // Unlike vs-marginedge.html, this page compares against a generic
  // spreadsheet formula, not a named competitor -- clauses.mjs exempts it
  // from the trademark-comparison disclaimer for exactly that reason.
  assert.doesNotMatch(html, /affiliated with, endorsed by, or sponsored by/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-averaging-margins-in-a-spreadsheet\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-averaging-margins-in-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-averaging-margins-in-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the page is clear that this calculator holds and uploads nothing', () => {
  assert.match(html, /nothing uploaded/);
});

test('the worked example numbers on the page match calc.mjs\'s own arithmetic', () => {
  // Locks the flip this page's whole argument rests on: the same three-dish
  // menu classifies the House Burger as a plowhorse under a naive, unweighted
  // =AVERAGE() of the three margins ($15.00) and as a star under this
  // calculator's covers-weighted bar ($9.38).
  const items = [
    { name: "Chef's Tasting Plate", unitsSold: 10, foodCost: 15, menuPrice: 45 },
    { name: 'House Burger', unitsSold: 300, foodCost: 4, menuPrice: 14 },
    { name: 'Fish Tacos', unitsSold: 90, foodCost: 8, menuPrice: 13 },
  ];
  const result = calculateMenu({ items, periodWeeks: 4, targetFoodCostPercent: 30, priceIncrease: 1 });
  assert.equal(result.ok, true);

  const margins = items.map(item => item.menuPrice - item.foodCost);
  assert.deepEqual(margins, [30, 10, 5]);
  const naiveAverage = margins.reduce((sum, m) => sum + m, 0) / margins.length;
  assert.equal(naiveAverage, 15);
  assert.equal(Math.round(result.averageContributionMargin * 100) / 100, 9.38);

  const burger = result.items.find(item => item.name === 'House Burger');
  assert.equal(burger.contributionMargin, 10);
  assert.ok(burger.contributionMargin < naiveAverage, 'the naive average must put the burger below its own bar');
  assert.ok(burger.contributionMargin >= result.averageContributionMargin, 'the weighted average must put the burger at or above its own bar');
  assert.equal(burger.classification, 'star');

  assert.match(html, /\$15\.00/);
  assert.match(html, /\$9\.38/);
});
