import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-bedroom-count-quote.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not moving-industry, insurance, legal, tax, or financial advice/i);
});

test('names no vendor, competing calculator, or moving-company platform', () => {
  // This page compares against a generic pricing habit (a bedroom-count
  // quote), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest. Distinct from this venture's own
  // vs-smartmoving.html, which does name a product and carries its own
  // "not affiliated" clause.
  assert.doesNotMatch(html, /SmartMoving/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-bedroom-count-quote\.html">/);
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
  const { calculateBid, INVENTORY_PRESETS, ACCESS_DEFAULTS } = await import('./calc.mjs');

  const threeBed = INVENTORY_PRESETS.find((p) => p.label === '3 bedroom house');
  assert.ok(threeBed, 'expected a "3 bedroom house" preset');

  function base(overrides) {
    return {
      inventory: [{ name: threeBed.label, cubicFeet: threeBed.cubicFeet, clockHours: threeBed.clockHours }],
      originFlights: 0, destFlights: 0, carryFeet: 0, elevatorWaitMinutes: 0,
      minutesPerFlightPer200CuFt: ACCESS_DEFAULTS.minutesPerFlightPer200CuFt,
      minutesPer50ftCarryPer200CuFt: ACCESS_DEFAULTS.minutesPer50ftCarryPer200CuFt,
      packingHours: 0, driveHours: 1, crewSize: 3,
      hourlyWage: 22, burdenRate: 25, truckCost: 150, fuelTolls: 40, materials: 35, otherCost: 0,
      overheadRate: 15, targetMargin: 20,
      ...overrides,
    };
  }

  const easy = calculateBid(base({}));
  assert.equal(easy.price.toFixed(2), '1035.00');

  const hard = calculateBid(base({ destFlights: 3, carryFeet: 150 }));
  assert.equal(hard.price.toFixed(2), '1491.59');
  assert.equal(hard.totalCost.toFixed(2), '1193.27');

  // Applying the easy job's own flat price to the hard job, the way a
  // "3 bedroom house" bedroom-count quote is applied regardless of stairs
  // or carry distance.
  const flatQuote = easy.price;
  assert.ok(flatQuote < hard.totalCost, 'the bedroom-count quote should be below the hard job\'s own break-even cost');
  assert.equal((hard.totalCost - flatQuote).toFixed(2), '158.27');
  assert.equal((hard.price - flatQuote).toFixed(2), '456.59');

  assert.match(html, /\$1,035\.00/);
  assert.match(html, /\$1,491\.59/);
  assert.match(html, /\$1,193\.27/);
  assert.match(html, /\$158\.27/);
  assert.match(html, /\$456\.59/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-bedroom-count-quote\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-bedroom-count-quote\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
