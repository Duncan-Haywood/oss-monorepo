import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateRoute } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const BASE = {
  stops: 6, miles: 35, routeHours: 2.5, waitMinutes: 45, graceMinutes: 15,
  revenue: 300, overheadRate: 10, targetMarginRate: 20,
  loadedLaborRate: 28, vehicleCostPerMile: .72, consumablePerStop: 1.50,
};

test('carries the no-warranty and no-PHI disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial or medical advice/i);
  assert.match(html, /Do not enter patient, specimen, or protected health information/);
});

test('makes no dollar-figure claim about Onfleet (a generic-method page cross-linking a named-product one)', () => {
  assert.doesNotMatch(html, /Onfleet[^<]*\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/medical-courier-route-margin\/vs-a-spreadsheet\.html">/);
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

test('every visible FAQ question also appears in the FAQPage block, and vice versa', () => {
  const visible = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const schemaNames = schema.mainEntity.map((q) => q.name);
  assert.deepEqual([...visible].sort(), [...schemaNames].sort());
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator, the worth-it guide, and the Onfleet comparison', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="is-this-medical-courier-route-worth-it\.html"/);
  assert.match(html, /href="vs-onfleet\.html"/);
});

test('the deadhead worked example matches calc.mjs for the same inputs', () => {
  const withoutDeadhead = calculateRoute({ ...BASE, deadheadMiles: 0, deadheadMinutes: 0 });
  const withDeadhead = calculateRoute({ ...BASE, deadheadMiles: 12, deadheadMinutes: 25 });

  assert.equal(Math.round(withoutDeadhead.directCost * 100) / 100, 148.20);
  assert.equal(Math.round(withoutDeadhead.margin * 100) / 100, 151.80);
  assert.equal(Math.round(withoutDeadhead.marginRate * 100) / 100, 50.60);

  assert.equal(Math.round(withDeadhead.directCost * 100) / 100, 168.51);
  assert.equal(Math.round(withDeadhead.margin * 100) / 100, 131.49);
  assert.equal(Math.round(withDeadhead.marginRate * 100) / 100, 43.83);
  assert.equal(Math.round(withDeadhead.deadheadCost * 100) / 100, 20.31);

  assert.match(html, /\$148\.20/);
  assert.match(html, /\$151\.80/);
  assert.match(html, /50\.60%/);
  assert.match(html, /\$168\.51/);
  assert.match(html, /\$131\.49/);
  assert.match(html, /43\.83%/);
  assert.match(html, /\$20\.31/);
});

test('the naive-markup worked example matches calc.mjs for the same inputs', () => {
  const noDeadhead = { ...BASE, deadheadMiles: 0, deadheadMinutes: 0 };
  const zeroOverheadCost = calculateRoute({ ...noDeadhead, overheadRate: 0 });
  const revenueIndependentCost = zeroOverheadCost.labor + zeroOverheadCost.vehicle + zeroOverheadCost.consumables;
  assert.equal(Math.round(revenueIndependentCost * 100) / 100, 118.20);

  const naiveQuote = revenueIndependentCost / (1 - BASE.targetMarginRate / 100);
  assert.equal(Math.round(naiveQuote * 100) / 100, 147.75);

  const naiveResult = calculateRoute({ ...noDeadhead, revenue: naiveQuote });
  assert.equal(Math.round(naiveResult.margin * 100) / 100, 14.78);
  assert.equal(Math.round(naiveResult.marginRate * 100) / 100, 10.00);

  const correctResult = calculateRoute({ ...noDeadhead, revenue: 168.86 });
  assert.ok(Math.abs(correctResult.marginRate - 20) < 0.05);

  assert.match(html, /\$147\.75/);
  assert.match(html, /\$14\.78/);
  assert.match(html, /10\.00%/);
  assert.match(html, /\$168\.86/);
});
