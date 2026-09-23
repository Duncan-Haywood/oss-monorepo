import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-yard.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not flooring-spec, moisture-test, legal, tax, or financial advice/i);
});

test('names no vendor, competing calculator, or takeoff platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // yard), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest, the same discipline
  // vs-a-flat-rate-per-square-foot.test.mjs uses on the sibling
  // artificial-turf-bid-calculator venture.
  assert.doesNotMatch(html, /MeasureSquare|Jobber|ServiceTitan|ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-per-yard\.html">/);
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
  const { calculateBid, suggestedScopeKit, suggestedPatternKit, suggestedExtraKit } = await import('./calc.mjs');

  function special() {
    const kit = {
      ...suggestedScopeKit('stretch-in'),
      ...suggestedPatternKit('solid'),
      ...suggestedExtraKit(),
    };
    return {
      floorSqft: 400, stairCount: 0, transitionCount: 2, scope: 'stretch-in', pattern: 'solid',
      travelMiles: 8, includeTearOut: false, includeFurniture: false, includeHaul: false,
      hourlyWage: 38, burdenRate: 30, overheadRate: 15, targetMargin: 20,
      travelAndEquipment: 55, otherCost: 0, ...kit,
    };
  }

  function losingJob() {
    const kit = {
      ...suggestedScopeKit('glue-down'),
      ...suggestedPatternKit('patterned'),
      ...suggestedExtraKit(),
    };
    return {
      floorSqft: 400, stairCount: 14, transitionCount: 4, scope: 'glue-down', pattern: 'patterned',
      travelMiles: 18, includeTearOut: true, includeFurniture: true, includeHaul: true,
      hourlyWage: 38, burdenRate: 30, overheadRate: 15, targetMargin: 20,
      travelAndEquipment: 85, otherCost: 0, ...kit,
    };
  }

  const cheap = calculateBid(special());
  assert.equal(cheap.price.toFixed(2), '2708.76');
  assert.equal(cheap.pricePerYard.toFixed(2), '55.41');

  const heavy = calculateBid(losingJob());
  assert.equal(heavy.price.toFixed(2), '4942.62');
  assert.equal(heavy.totalCost.toFixed(2), '3954.09');

  // Applying the cheap job's own price-per-yard rate flatly to the heavy
  // job's billed yardage, the way a "$X a yard installed" special is
  // applied regardless of scope, pattern, or stairs.
  const flatQuote = cheap.pricePerYard * heavy.billYards;
  assert.equal(flatQuote.toFixed(2), '3681.45');
  assert.ok(flatQuote < heavy.totalCost, 'the flat rate should quote below the heavy job\'s own break-even cost');
  assert.equal((heavy.totalCost - flatQuote).toFixed(2), '272.64');
  assert.equal((heavy.price - flatQuote).toFixed(2), '1261.17');

  assert.match(html, /\$2,708\.76/);
  assert.match(html, /\$55\.41/);
  assert.match(html, /\$4,942\.62/);
  assert.match(html, /\$3,954\.09/);
  assert.match(html, /\$3,681\.45/);
  assert.match(html, /\$272\.64/);
  assert.match(html, /\$1,261\.17/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-per-yard\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-yard\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-carpet\.html"/);
});
