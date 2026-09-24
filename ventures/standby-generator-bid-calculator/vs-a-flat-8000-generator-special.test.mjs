import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid, defaultInputs } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-8000-generator-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, engineering, code, legal, tax, financial, or contracting advice/i);
});

// This page compares against a generic pricing method (a flat special),
// not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-servicetitan.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /ServiceTitan|Housecall|Jobber|Workiz|FieldEdge|Generac(?!\/)/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-8000-generator-special\.html">/);
});

test('has Open Graph title/description tags', () => {
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
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-8000-generator-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-8000-generator-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The page's central claims are numbers this venture's own calculator
// produces. Recomputed here against the shipped module rather than
// hand-typed, so a change to the arithmetic makes this page's claim false
// (and this test red) instead of merely stale -- same discipline as
// pour-cost-calculator's vs-a-spreadsheet.test.mjs.
test('the fuel/setback worked example matches what the shipped calculator computes', () => {
  const easy = calculateBid(defaultInputs());
  const hard = calculateBid({
    ...defaultInputs(),
    generatorKw: 26,
    fuel: 'propane',
    location: 'far_yard',
    padType: 'poured',
    trenchFeet: 60,
    gasLineFeet: 60,
    atsAmps: 400,
    serviceAmps: 400,
  });

  assert.equal(easy.price.toFixed(2), '6106.00');
  assert.equal(hard.price.toFixed(2), '13679.38');

  for (const value of ['$6,106.00', '$13,679.38']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the undersized-transfer-switch worked example matches what the shipped calculator computes', () => {
  const correct = calculateBid({ ...defaultInputs(), generatorKw: 32, serviceAmps: 400, atsAmps: 400 });
  const undersized = calculateBid({ ...defaultInputs(), generatorKw: 32, serviceAmps: 400, atsAmps: 200 });

  assert.equal(correct.warnings.length, 0);
  assert.equal(undersized.warnings.length, 1);
  assert.match(undersized.warnings[0], /200 A transfer switch is smaller than the 400 A service/);
  assert.equal(correct.price.toFixed(2), '9685.14');
  assert.equal(undersized.price.toFixed(2), '6607.83');
  assert.equal((correct.price - undersized.price).toFixed(2), '3077.31');

  assert.ok(html.includes(undersized.warnings[0]));
  for (const value of ['$6,607.83', '$9,685.14', '$3,077.31']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the margin-as-share-of-price worked example matches what the shipped calculator computes', () => {
  const base = calculateBid(defaultInputs());
  const markupPrice = base.totalCost * 1.25;
  const markupMargin = ((markupPrice - base.totalCost) / markupPrice) * 100;

  assert.equal(base.totalCost.toFixed(2), '4579.50');
  assert.equal(markupPrice.toFixed(2), '5724.37');
  assert.equal(markupMargin.toFixed(1), '20.0');

  for (const value of ['$4,579.50', '$5,724.37', '20.0% margin', '$6,106.00']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
