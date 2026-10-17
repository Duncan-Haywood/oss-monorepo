import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-2-per-square-foot-bid.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not painting, construction, legal, tax, or financial advice/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as this venture's own vs-paintscout.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /PaintScout|Jobber|ServiceTitan|JobTread|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/painting-bid-calculator\/vs-a-flat-2-per-square-foot-bid\.html">/);
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

test('the worked-example figures match calc.mjs on an easy job vs. a trim/door/window-heavy job', async () => {
  const { calculateBid, DEFAULT_EXTRA_COAT_FACTOR } = await import('./calc.mjs');

  const rates = {
    hourlyWage: 25,
    burdenRate: 25,
    paintPrice: 45,
    paintCoverage: 350,
    wastePercent: 10,
    overheadRate: 15,
    targetMargin: 25,
    extraCoatFactor: DEFAULT_EXTRA_COAT_FACTOR,
    ceilingHeightFeet: 8,
  };

  // The "easy" job the flat rate is built on: bare walls and ceilings, no
  // trim, no doors, no windows.
  const easy = calculateBid({
    ...rates,
    surfaces: [
      { type: 'walls', quantity: 400, productionRate: 200, coats: 2 },
      { type: 'ceilings', quantity: 400, productionRate: 175, coats: 2 },
    ],
    prepHours: 2,
    setupHours: 1,
    travelCost: 20,
    otherCost: 10,
    floorSquareFeet: 400,
    commonFloorBid: 2,
  });
  assert.equal(easy.price.toFixed(2), '875.56');
  assert.equal(easy.breakEvenPrice.toFixed(2), '656.67');
  assert.equal(easy.floorSquareFeet, 400);
  assert.equal(easy.pricePerFloorSqFt.toFixed(2), '2.19');

  // The "hard" job: a typical trim/door/window-heavy 3-bedroom, the same
  // house() fixture calc.test.mjs already exercises.
  const hard = calculateBid({
    ...rates,
    surfaces: [
      { type: 'walls', quantity: 2400, productionRate: 200, coats: 2 },
      { type: 'ceilings', quantity: 1200, productionRate: 175, coats: 2 },
      { type: 'trim', quantity: 320, productionRate: 50, coats: 2 },
      { type: 'doors', quantity: 8, productionRate: 1.25, coats: 2 },
      { type: 'windows', quantity: 10, productionRate: 2.5, coats: 1 },
    ],
    prepHours: 6,
    setupHours: 2,
    travelCost: 40,
    otherCost: 35,
    floorSquareFeet: 1200,
    commonFloorBid: 2,
  });
  assert.equal(hard.price.toFixed(2), '4988.47');
  assert.equal(hard.breakEvenPrice.toFixed(2), '3741.35');
  assert.equal(hard.floorSquareFeet, 1200);

  // The rate is fit to the easy job by construction: its own price divided
  // by its own floor square footage, applied only to the hard job's floor
  // area -- a flat per-square-foot rate has no line for trim, doors, or
  // windows.
  const rate = easy.price / easy.floorSquareFeet;
  const flatOnHard = rate * hard.floorSquareFeet;
  assert.equal(flatOnHard.toFixed(2), '2626.68');
  assert.ok(flatOnHard < hard.breakEvenPrice, "the flat rate should quote below the hard job's own break-even cost");
  assert.equal((hard.breakEvenPrice - flatOnHard).toFixed(2), '1114.67');
  assert.equal((hard.price - flatOnHard).toFixed(2), '2361.79');

  assert.match(html, /\$875\.56/);
  assert.match(html, /\$656\.67/);
  assert.match(html, /\$2\.19/);
  assert.match(html, /\$4,988\.47/);
  assert.match(html, /\$3,741\.35/);
  assert.match(html, /\$2,626\.68/);
  assert.match(html, /\$1,114\.67/);
  assert.match(html, /\$2,361\.79/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-2-per-square-foot-bid\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-2-per-square-foot-bid\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="interior-painting-price-per-square-foot\.html"/);
});
