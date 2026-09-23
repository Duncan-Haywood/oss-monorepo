import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a tile specification, waterproofing design, building-code determination, legal, tax, or financial advice/i);
});

test('names no vendor, competing calculator, or takeoff platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest, the same discipline the sibling
  // artificial-turf-bid-calculator and carpet-install-bid-calculator vs.
  // flat-rate pages use.
  assert.doesNotMatch(html, /Jobber|MeasureSquare|ServiceTitan|ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-per-square-foot\.html">/);
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
  const { calculateBid, suggestedScopeKit, suggestedPatternKit, suggestedWallKit, suggestedExtraKit, JOB_PRESETS } = await import('./calc.mjs');

  function build(preset) {
    const kit = {
      ...suggestedScopeKit(preset.scope),
      ...suggestedPatternKit(preset.pattern),
      ...suggestedWallKit(preset.wall),
      ...suggestedExtraKit(),
    };
    return {
      wallSf: preset.wallSf, edgeLf: preset.edgeLf, outlets: preset.outlets,
      scope: preset.scope, pattern: preset.pattern, wall: preset.wall,
      travelMiles: preset.travelMiles,
      includeCooktop: preset.includeCooktop, includeSchluter: preset.includeSchluter, includeAccent: preset.includeAccent,
      hourlyWage: 38, burdenRate: 30, overheadRate: 15, targetMargin: 20,
      travelAndEquipment: 0, otherCost: 0,
      ...kit,
    };
  }

  const cheap = calculateBid(build(JOB_PRESETS[0]));
  assert.equal(cheap.price.toFixed(2), '1055.34');
  assert.equal(cheap.pricePerSf.toFixed(2), '35.18');

  const heavy = calculateBid(build(JOB_PRESETS[3]));
  assert.equal(heavy.price.toFixed(2), '5256.89');
  assert.equal(heavy.totalCost.toFixed(2), '4205.52');

  // Applying the cheap job's own price-per-SF rate flatly to the heavy
  // job's wall square footage, the way a "$35 a square foot installed"
  // special is applied regardless of pattern, wall condition, or extras.
  const flatQuote = cheap.pricePerSf * heavy.wallSf;
  assert.equal(flatQuote.toFixed(2), '1688.55');
  assert.ok(flatQuote < heavy.totalCost, 'the flat rate should quote below the heavy job\'s own break-even cost');
  assert.equal((heavy.totalCost - flatQuote).toFixed(2), '2516.97');
  assert.equal((heavy.price - flatQuote).toFixed(2), '3568.34');

  assert.match(html, /\$1,055\.34/);
  assert.match(html, /\$35\.18/);
  assert.match(html, /\$5,256\.89/);
  assert.match(html, /\$4,205\.52/);
  assert.match(html, /\$1,688\.55/);
  assert.match(html, /\$2,516\.97/);
  assert.match(html, /\$3,568\.34/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-a-kitchen-tile-backsplash\.html"/);
});
