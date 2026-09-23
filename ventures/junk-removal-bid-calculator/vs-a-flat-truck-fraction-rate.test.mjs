import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-truck-fraction-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat truck-fraction
  // rate), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-method
  // pages.
  assert.doesNotMatch(html, /Jobber|Workiz|ServiceTitan|ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-truck-fraction-rate\.html">/);
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
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match calc.mjs on the shipped starting example', async () => {
  const { calculateBid } = await import('./calc.mjs');
  const commonBiz = {
    truckCapacityCubicYards: 12, dumpFeePerTon: 65, dumpMinimum: 45, surchargeRate: 10,
    onSiteHours: 2, stairsFlights: 0, minutesPerFlight: 15, longCarryMinutes: 0,
    oneWayMinutes: 18, dumpMinutes: 30, crewSize: 2, hourlyWage: 18, burdenRate: 28,
    fuelPerJob: 18, otherJobCost: 0, overheadRate: 15, targetMargin: 25, minimumCharge: 149,
    proposedPrice: null,
  };

  const jobA = calculateBid({
    ...commonBiz,
    piles: [
      { name: 'Mixed household junk', unit: 'cubic_yards', quantity: 6, lbsPerUnit: 200, specialFeeEach: 0 },
      { name: 'Furniture / bulky items', unit: 'cubic_yards', quantity: 2, lbsPerUnit: 125, specialFeeEach: 0 },
      { name: 'Appliance (each)', unit: 'each', quantity: 2, lbsPerUnit: 200, specialFeeEach: 25, cubicYardsEach: 1.5 },
    ],
  });
  assert.equal(jobA.totalCubicYards, 11);
  assert.equal(jobA.bidPrice.toFixed(2), '424.71');
  assert.equal(jobA.pricePerCubicYard.toFixed(2), '38.61');
  assert.equal(jobA.jobCost.toFixed(2), '318.53');

  // Same 11 cubic yards -- "the same half truck" -- but concrete instead of
  // mixed household junk.
  const jobB = calculateBid({
    ...commonBiz,
    piles: [
      { name: 'Concrete / masonry', unit: 'cubic_yards', quantity: 11, lbsPerUnit: 4000, specialFeeEach: 0 },
    ],
  });
  assert.equal(jobB.totalCubicYards, 11);
  assert.equal(jobB.jobCost.toFixed(2), '1993.93');
  assert.equal(jobB.bidPrice.toFixed(2), '2658.57');

  const flatQuoteForB = jobA.pricePerCubicYard * jobB.totalCubicYards;
  assert.equal(flatQuoteForB.toFixed(2), '424.71');
  assert.ok(flatQuoteForB < jobB.jobCost, 'the flat rate should quote below job B\'s own break-even cost');
  assert.equal((jobB.jobCost - flatQuoteForB).toFixed(2), '1569.21');
  assert.equal((jobB.bidPrice - flatQuoteForB).toFixed(2), '2233.86');

  assert.match(html, /\$424\.71/);
  assert.match(html, /\$38\.61/);
  assert.match(html, /\$318\.53/);
  assert.match(html, /\$1,993\.93/);
  assert.match(html, /\$1,573\.00/);
  assert.match(html, /\$1,569\.21/);
  assert.match(html, /\$2,233\.86/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-truck-fraction-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-truck-fraction-rate\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-price-junk-removal\.html"/);
});
