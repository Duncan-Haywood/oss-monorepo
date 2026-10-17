import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat installed
  // price per square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is the
  // same discipline vs-a-flat-rate-per-square-foot.test.mjs uses on the
  // sibling artificial-turf-bid-calculator venture.
  assert.doesNotMatch(html, /Jobber|ServiceTitan|ServiceMonster|Angi|HomeAdvisor/i);
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
    suggestedFulfillmentKit,
    suggestedPadKit,
    suggestedAccessKit,
    suggestedElectricalKit,
    suggestedExtraKit,
  } = await import('./calc.mjs');

  function special() {
    const kit = {
      ...suggestedFulfillmentKit('dropset'),
      ...suggestedPadKit('existing'),
      ...suggestedAccessKit('forklift'),
      ...suggestedElectricalKit('none'),
      ...suggestedExtraKit(),
    };
    return {
      lengthFt: 12, widthFt: 10, fulfillment: 'dropset', pad: 'existing', access: 'forklift',
      electrical: 'none', deliveryMiles: 15, extraWindows: 0, extraDoors: 0, ramp: false,
      loft: false, haulAway: false, hourlyWage: 26, burdenRate: 28, overheadRate: 15,
      targetMargin: 20, travelAndEquipment: 85, otherCost: 0, ...kit,
    };
  }

  function losingJob() {
    const kit = {
      ...suggestedFulfillmentKit('kit'),
      ...suggestedPadKit('gravel'),
      ...suggestedAccessKit('crane'),
      ...suggestedElectricalKit('lights'),
      ...suggestedExtraKit(),
    };
    return {
      lengthFt: 16, widthFt: 12, fulfillment: 'kit', pad: 'gravel', access: 'crane',
      electrical: 'lights', deliveryMiles: 40, extraWindows: 2, extraDoors: 1, ramp: true,
      loft: true, haulAway: true, hourlyWage: 26, burdenRate: 28, overheadRate: 15,
      targetMargin: 20, travelAndEquipment: 160, otherCost: 0, ...kit,
    };
  }

  const cheap = calculateBid(special());
  assert.equal(cheap.areaSqFt, 120);
  assert.equal(cheap.price.toFixed(2), '4066.49');
  assert.equal(cheap.pricePerSqFt.toFixed(2), '33.89');

  const heavy = calculateBid(losingJob());
  assert.equal(heavy.areaSqFt, 192);
  assert.equal(heavy.price.toFixed(2), '8682.28');
  assert.equal(heavy.totalCost.toFixed(2), '6945.82');

  // Applying the cheap job's own per-square-foot rate flatly to the heavy
  // job's area, the way a "$X a square foot installed" special is applied
  // regardless of pad, delivery, access, or extras.
  const flatQuoteForHeavy = cheap.pricePerSqFt * heavy.areaSqFt;
  assert.equal(flatQuoteForHeavy.toFixed(2), '6506.39');
  assert.ok(flatQuoteForHeavy < heavy.totalCost, 'the flat rate should quote below the heavy job\'s own break-even cost');
  assert.equal((heavy.totalCost - flatQuoteForHeavy).toFixed(2), '439.44');
  assert.equal((heavy.price - flatQuoteForHeavy).toFixed(2), '2175.89');

  assert.match(html, /\$4,066\.49/);
  assert.match(html, /\$33\.89/);
  assert.match(html, /\$8,682\.28/);
  assert.match(html, /\$6,945\.82/);
  assert.match(html, /\$6,506\.39/);
  assert.match(html, /\$439\.44/);
  assert.match(html, /\$2,175\.89/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-a-shed\.html"/);
});
