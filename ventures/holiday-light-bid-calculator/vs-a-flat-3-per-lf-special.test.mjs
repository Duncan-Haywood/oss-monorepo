import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-3-per-lf-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, lighting-design, building-code, legal, tax, or financial advice/i);
});

// This page compares against a generic pricing method (a flat per-foot
// special), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-realgreen.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /RealGreen/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-3-per-lf-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-3-per-lf-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-3-per-lf-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const {
    calculateBid,
    suggestedScopeKit,
    suggestedStoryKit,
    suggestedTypeKit,
    suggestedExtraKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = { hourlyWage: 32, burdenRate: 30, travelAndEquipment: 55, otherCost: 0, overheadRate: 15, targetMargin: 20 };
  const flatRatePerLf = 3;

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...rates,
      ...suggestedScopeKit(preset.scope),
      ...suggestedStoryKit(preset.stories),
      ...suggestedTypeKit(preset.lightType),
      ...suggestedExtraKit(),
    });
  }

  const [cheap, typical, , fullService] = JOB_PRESETS.map(priceJob);
  const [cheapPreset, typicalPreset, , fullServicePreset] = JOB_PRESETS;

  assert.equal(cheap.price.toFixed(2), '539.43');
  assert.equal(cheap.totalCost.toFixed(2), '431.54');
  assert.equal(typical.price.toFixed(2), '1236.73');
  assert.equal(typical.totalCost.toFixed(2), '989.38');
  assert.equal(fullService.price.toFixed(2), '4822.33');
  assert.equal(fullService.totalCost.toFixed(2), '3857.86');

  assert.equal((cheapPreset.eaveLf * flatRatePerLf).toFixed(2), '420.00');
  assert.equal((typicalPreset.eaveLf * flatRatePerLf).toFixed(2), '480.00');
  assert.equal((fullServicePreset.eaveLf * flatRatePerLf).toFixed(2), '600.00');

  assert.match(html, /\$539\.43/);
  assert.match(html, /\$431\.54/);
  assert.match(html, /\$1,236\.73/);
  assert.match(html, /\$989\.38/);
  assert.match(html, /\$4,822\.33/);
  assert.match(html, /\$3,857\.86/);
});
