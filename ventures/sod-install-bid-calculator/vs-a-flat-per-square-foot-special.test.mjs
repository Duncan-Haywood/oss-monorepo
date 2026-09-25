import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  calculateBid,
  JOB_PRESETS,
  suggestedGrassKit,
  suggestedPrepKit,
  suggestedDeliveryKit,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-square-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The same loaded-labor and overhead figures index.html ships as its own
// defaults, so the only thing that differs between the two worked examples
// below is the lawn and its grass/prep/delivery, not the crew's rates.
const MONEY_DEFAULTS = {
  hourlyWage: 22,
  burdenRate: 28,
  travelAndEquipment: 45,
  otherCost: 0,
  overheadRate: 15,
  targetMargin: 20,
  palletsPerTruck: 10,
};

// Expands one of the venture's own JOB_PRESETS into full calculateBid input
// using the shipped suggested* kit helpers, rather than hand-typing hours
// or rates -- so a change to the grass, prep, or delivery formulas makes
// this page's worked example false (and the test red) instead of merely
// stale.
function expand(preset) {
  const grassKit = suggestedGrassKit(preset.grass);
  const prepKit = suggestedPrepKit(preset.prep);
  const deliveryKit = suggestedDeliveryKit(preset.delivery);
  return { ...preset, ...grassKit, ...prepKit, ...deliveryKit, ...MONEY_DEFAULTS };
}

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not landscaping, horticultural, irrigation, construction, legal, tax, or financial advice/i);
});

test('carries the best-effort hosting notice', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
});

// Generic-method comparison -- against a flat per-square-foot special, not
// a named competitor -- so this page names no vendor and is exempt from
// the trademark disclaimer, unlike this venture's own vs-aspire.html.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Aspire|ServiceTitan|Jobber|Housecall|Workiz/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-per-square-foot-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-per-square-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-square-foot-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The page's central claim is that two of this venture's own JOB_PRESETS --
// the "cheap special" ready-soil job and the "where the special loses"
// strip-and-haul job -- price at very different rates per square foot.
// Recomputed here against the shipped module and its own presets rather
// than hand-typed, so a change to the arithmetic or the presets makes this
// page's claim false (and this test red) instead of merely stale.
test('the price-per-square-foot worked example matches what the shipped calculator computes', () => {
  const easyPreset = JOB_PRESETS[0];
  const hardPreset = JOB_PRESETS[2];
  assert.match(easyPreset.label, /cheap special/);
  assert.match(hardPreset.label, /where the special loses/);

  const easyResult = calculateBid(expand(easyPreset));
  const hardResult = calculateBid(expand(hardPreset));

  assert.equal(easyResult.price.toFixed(2), '1860.35');
  assert.equal(hardResult.price.toFixed(2), '14729.35');
  assert.equal(easyResult.pricePerSqFt.toFixed(2), '0.93');
  assert.equal(hardResult.pricePerSqFt.toFixed(2), '1.84');
  assert.equal((hardResult.pricePerSqFt / easyResult.pricePerSqFt).toFixed(2), '1.98');

  for (const value of ['$0.93', '$1.84', '1.98']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the prep-hours-and-dump-ticket worked example matches what the shipped calculator computes', () => {
  const hardResult = calculateBid(expand(JOB_PRESETS[2]));

  assert.equal(hardResult.hoursPrep.toFixed(1), '19.2');
  assert.equal(hardResult.dumpMaterial.toFixed(2), '85.00');

  for (const value of ['19.2 hours', '$85 dump ticket']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the whole-pallets worked example matches what the shipped calculator computes', () => {
  const easyResult = calculateBid(expand(JOB_PRESETS[0]));
  const hardResult = calculateBid(expand(JOB_PRESETS[2]));

  assert.equal(easyResult.pallets, 5);
  assert.equal(easyResult.paidCoverageSqFt, 2250);
  assert.equal(easyResult.neededSqFt, 2100);
  assert.equal(hardResult.pallets, 22);
  assert.equal(hardResult.paidCoverageSqFt, 8800);
  assert.equal(hardResult.neededSqFt, 8800);

  for (const value of ['5 pallets', '2,250 sq ft', '2,100 sq ft', '22 pallets', '8,800 sq ft']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the margin-as-share-of-price worked example matches what the shipped calculator computes', () => {
  const hardResult = calculateBid(expand(JOB_PRESETS[2]));
  const markupPrice = hardResult.totalCost * 1.20;
  const markupMargin = ((markupPrice - hardResult.totalCost) / markupPrice) * 100;

  assert.equal(hardResult.totalCost.toFixed(2), '11783.48');
  assert.equal(markupPrice.toFixed(2), '14140.18');
  assert.equal(markupMargin.toFixed(1), '16.7');

  for (const value of ['$11,783.48', '$14,140.18', '16.7% margin', '$14,729.35']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the walk-away-price worked example matches what the shipped calculator computes', () => {
  const easyResult = calculateBid(expand(JOB_PRESETS[0]));
  const hardResult = calculateBid(expand(JOB_PRESETS[2]));

  assert.equal(easyResult.breakEvenPrice.toFixed(2), '1488.28');
  assert.equal(hardResult.breakEvenPrice.toFixed(2), '11783.48');

  for (const value of ['$1,488.28', '$11,783.48']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
