import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not landscaping, construction, legal, tax, or financial advice/i);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest, the same discipline
  // vs-pricing-from-income-goal-alone.test.mjs uses on the sibling venture.
  assert.doesNotMatch(html, /Jobber|ServiceTitan|ServiceMonster|MarketSharp|PestPac/i);
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
  const { calculateBid, suggestedTurfKit, JOB_PRESETS } = await import('./calc.mjs');
  const commonBiz = {
    hoursTrip: 1.5, siteHours: 0.75, hourlyWage: 32, burdenRate: 30,
    travelAndEquipment: 275, overheadRate: 15, targetMargin: 30, permitFee: 0,
  };

  const jobA = JOB_PRESETS[0]; // 600 sq ft landscape, sod demo, no wells
  const bidA = calculateBid({ ...commonBiz, ...jobA, ...suggestedTurfKit(jobA.turfType) });
  assert.equal(bidA.price.toFixed(2), '5468.14');
  assert.equal(bidA.pricePerSqFt.toFixed(2), '9.11');

  const jobB = JOB_PRESETS[1]; // 800 sq ft pet turf, sod demo, 2 tree wells
  const bidB = calculateBid({ ...commonBiz, ...jobB, ...suggestedTurfKit(jobB.turfType) });
  assert.equal(bidB.price.toFixed(2), '11123.92');
  assert.equal(bidB.totalCost.toFixed(2), '7786.75');

  // Applying job A's own per-square-foot rate flatly to job B's area, the
  // way a "$X a square foot installed" special is applied regardless of
  // turf type or scope.
  const flatQuoteForB = bidA.pricePerSqFt * jobB.lawnSqFt;
  assert.equal(flatQuoteForB.toFixed(2), '7290.86');
  assert.ok(flatQuoteForB < bidB.totalCost, 'the flat rate should quote below job B\'s own break-even cost');
  assert.equal((bidB.totalCost - flatQuoteForB).toFixed(2), '495.89');
  assert.equal((bidB.price - flatQuoteForB).toFixed(2), '3833.06');

  assert.match(html, /\$5,468\.14/);
  assert.match(html, /\$9\.11/);
  assert.match(html, /\$11,123\.92/);
  assert.match(html, /\$7,786\.75/);
  assert.match(html, /\$7,290\.86/);
  assert.match(html, /\$495\.89/);
  assert.match(html, /\$3,833\.06/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-artificial-turf\.html"/);
});
