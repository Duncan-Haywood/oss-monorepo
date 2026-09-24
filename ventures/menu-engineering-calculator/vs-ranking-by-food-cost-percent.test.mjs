import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateMenu } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-ranking-by-food-cost-percent.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-ranking-by-food-cost-percent\.html">/);
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
  assert.match(indexHtml, /href="(\.\/)?vs-ranking-by-food-cost-percent\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-ranking-by-food-cost-percent\.html/);
});

test('the comparison page links back to the calculator and to the guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-menu-engineering-works\.html"/);
});

test('the page is clear that this is a generic ranking habit, not a named product', () => {
  assert.match(html, /generic ranking habit, not a product/);
});

test('the worked figures on the page match the calculator\'s own arithmetic on the shipped example', () => {
  const items = [
    { name: 'Smash burger', unitsSold: '500', foodCost: '5.00', menuPrice: '14.00' },
    { name: 'Ribeye', unitsSold: '100', foodCost: '14.00', menuPrice: '34.00' },
    { name: 'House salad', unitsSold: '300', foodCost: '3.00', menuPrice: '16.00' },
    { name: 'Soup of the day', unitsSold: '100', foodCost: '3.00', menuPrice: '8.00' },
  ];
  const result = calculateMenu({ items, periodWeeks: '4', targetFoodCostPercent: '30', priceIncrease: '1' });

  const ribeye = result.items.find((item) => item.name === 'Ribeye');
  const salad = result.items.find((item) => item.name === 'House salad');
  const burger = result.items.find((item) => item.name === 'Smash burger');

  assert.equal(ribeye.classification, 'puzzle');
  assert.equal(salad.classification, 'star');
  assert.equal(burger.classification, 'plowhorse');
  assert.equal(ribeye.foodCostPercent.toFixed(1), '41.2');
  assert.equal(salad.foodCostPercent.toFixed(1), '18.8');
  assert.equal(burger.foodCostPercent.toFixed(1), '35.7');
  assert.equal(ribeye.contributionMargin.toFixed(2), '20.00');
  assert.equal(salad.contributionMargin.toFixed(2), '13.00');
  assert.equal(result.averageContributionMargin.toFixed(2), '10.90');
  assert.equal(result.popularityThresholdPercent.toFixed(1), '17.5');
  assert.equal(result.plowhorseUnits, 500);
  assert.equal(result.priceMoveGainPerPeriod, 500);
  assert.equal(result.priceMoveGainPerYear.toFixed(2), '6500.00');

  // Every one of those figures appears verbatim in the page's prose.
  for (const figure of ['41.2%', '18.8%', '35.7%', '$20.00', '$13.00', '$10.90', '17.5%', '$500', '$6,500']) {
    assert.ok(html.includes(figure), `figure ${figure} not found on the page`);
  }
});
