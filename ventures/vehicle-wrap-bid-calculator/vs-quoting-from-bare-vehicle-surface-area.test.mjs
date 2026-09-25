import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateQuote, DEFAULTS } from './calc.mjs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-quoting-from-bare-vehicle-surface-area.html');
const index = docsPage('index.html');

// Two illustrative jobs built from the shipped DEFAULTS -- a flat-panel box
// truck (low waste, no curves) and a compound-curve SUV (high waste, more
// complex install) -- rather than hand-typed figures, so a change to
// calculateQuote's formulas makes this page's worked example false (and this
// test red) instead of merely stale.
const BOX_TRUCK = { ...DEFAULTS, vehicleSurfaceAreaSqFt: 450, wasteFactorPct: 10, complexityMultiplier: 1.0 };
const SUV = { ...DEFAULTS, vehicleSurfaceAreaSqFt: 220, wasteFactorPct: 30, complexityMultiplier: 1.5 };

test('index links to the bare-surface-area comparison page', () => {
  assert.match(index, /vs-quoting-from-bare-vehicle-surface-area\.html/);
});

test('carries the no-warranty and best-effort hosting disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

// Generic-method comparison -- against a coverage-chart pricing habit, not a
// named competitor -- so this page names no vendor and is exempt from the
// trademark disclaimer, unlike this venture's own vs-shopvox.html.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /ShopVOX|Jobber|ServiceTitan|Housecall|Workiz/i);
});

test('the canonical tag names this file at the real GitHub Pages origin', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/duncan-haywood\.github\.io\/monorepo-projects\/vehicle-wrap-bid-calculator\/vs-quoting-from-bare-vehicle-surface-area\.html">/,
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

test('the FAQPage JSON-LD answers are verbatim on the visible page (word for word, not just inside the script tag)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim outside the JSON-LD script tag: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page links back to the calculator and to the guide page', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-a-vehicle-wrap\.html"/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-quoting-from-bare-vehicle-surface-area\.html/);
});

// The page's central claim is that a bare-surface-area quote loses real
// material margin on both an easy flat-panel job and a hard compound-curve
// job, and that the loss scales with waste rate rather than vehicle size.
// Recomputed here against the shipped module rather than hand-typed, so a
// change to the arithmetic makes this page's claim false (and this test red)
// instead of merely stale.
test('the waste-inclusive-material worked example matches what the shipped calculator computes', () => {
  const boxResult = calculateQuote(BOX_TRUCK);
  const suvResult = calculateQuote(SUV);

  assert.equal(boxResult.effectiveVinylSqFt.toFixed(1), '495.0');
  assert.equal(suvResult.effectiveVinylSqFt.toFixed(1), '286.0');

  for (const value of ['495.0 sq ft', '286.0 sq ft']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the waste-blind-loss-per-job worked example matches what the shipped calculator computes', () => {
  const boxResult = calculateQuote(BOX_TRUCK);
  const suvResult = calculateQuote(SUV);

  assert.equal(boxResult.wasteBlindLossPerJob.toFixed(2), '176.40');
  assert.equal(suvResult.wasteBlindLossPerJob.toFixed(2), '258.72');

  for (const value of ['$176.40', '$258.72']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the loss-per-square-foot worked example matches what the shipped calculator computes', () => {
  const boxResult = calculateQuote(BOX_TRUCK);
  const suvResult = calculateQuote(SUV);
  const lossPerSqFtBox = boxResult.wasteBlindLossPerJob / BOX_TRUCK.vehicleSurfaceAreaSqFt;
  const lossPerSqFtSuv = suvResult.wasteBlindLossPerJob / SUV.vehicleSurfaceAreaSqFt;

  assert.equal(lossPerSqFtBox.toFixed(2), '0.39');
  assert.equal(lossPerSqFtSuv.toFixed(2), '1.18');
  assert.equal((lossPerSqFtSuv / lossPerSqFtBox).toFixed(2), '3.00');

  for (const value of ['$1.18', '$0.39', 'three times']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the margin-as-share-of-price worked example matches what the shipped calculator computes', () => {
  const suvResult = calculateQuote(SUV);
  const markupPrice = suvResult.totalCost * 1.35;
  const markupMargin = ((markupPrice - suvResult.totalCost) / markupPrice) * 100;

  assert.equal(suvResult.totalCost.toFixed(2), '2367.12');
  assert.equal(markupPrice.toFixed(2), '3195.61');
  assert.equal(markupMargin.toFixed(1), '25.9');
  assert.equal(suvResult.price.toFixed(2), '3641.72');

  for (const value of ['$2,367.12', '$3,195.61', '25.9% margin', '$3,641.72']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
