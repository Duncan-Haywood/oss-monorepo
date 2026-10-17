import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not structural, construction, building-code, legal, tax, or financial advice/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling
  // shed-install-bid-calculator's vs-a-flat-price-per-square-foot.test.mjs
  // and well-pump-bid-calculator's vs-a-flat-well-pump-special.test.mjs.
  assert.doesNotMatch(html, /JobTread|ServiceTitan|Jobber|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-price-per-square-foot\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped presets', async () => {
  const {
    calculateBid,
    suggestedShellKit,
    suggestedFloorKit,
    suggestedInsulationKit,
    suggestedElectricalKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = {
    hourlyWage: 28, burdenRate: 28, overheadRate: 15, targetMargin: 20,
    travelAndEquipment: 180, otherCost: 0,
  };

  function fullInput(preset) {
    return {
      ...rates,
      ...preset,
      ...suggestedShellKit(),
      ...suggestedFloorKit(preset.floor),
      ...suggestedInsulationKit(preset.insulation),
      ...suggestedElectricalKit(preset.electrical),
    };
  }

  // JOB_PRESETS[0] is the 30x40x10 ag shell -- the "cheap special" job a
  // flat per-square-foot rate is built on. JOB_PRESETS[2] is the
  // 40x60x16 commercial shop with a slab, two overheads, full insulation,
  // a shop panel, and a lean-to -- where the flat rate loses.
  const easy = calculateBid(fullInput(JOB_PRESETS[0]));
  assert.equal(easy.price.toFixed(2), '18711.66');
  assert.equal(easy.breakEvenPrice.toFixed(2), '14969.33');
  assert.equal(easy.areaSqFt, 1200);
  assert.equal(easy.pricePerSqFt.toFixed(2), '15.59');

  const hard = calculateBid(fullInput(JOB_PRESETS[2]));
  assert.equal(hard.price.toFixed(2), '101933.52');
  assert.equal(hard.breakEvenPrice.toFixed(2), '81546.81');
  assert.equal(hard.areaSqFt, 2400);
  assert.equal(hard.leanToSqFt, 720);

  // The rate is fit to the easy job by construction: its own price divided
  // by its own footprint, applied only to the hard job's main-building
  // footprint -- a flat per-square-foot rate has no line for a lean-to.
  const rate = easy.price / easy.areaSqFt;
  const flatOnHard = rate * hard.areaSqFt;
  assert.equal(flatOnHard.toFixed(2), '37423.32');
  assert.ok(flatOnHard < hard.breakEvenPrice, 'the flat rate should quote below the hard job\'s own break-even cost');
  assert.equal((hard.breakEvenPrice - flatOnHard).toFixed(2), '44123.49');
  assert.equal((hard.price - flatOnHard).toFixed(2), '64510.19');

  assert.match(html, /\$18,711\.66/);
  assert.match(html, /\$14,969\.33/);
  assert.match(html, /\$15\.59/);
  assert.match(html, /\$101,933\.52/);
  assert.match(html, /\$81,546\.81/);
  assert.match(html, /\$37,423\.32/);
  assert.match(html, /\$44,123\.49/);
  assert.match(html, /\$64,510\.19/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-build-a-pole-barn\.html"/);
});
