import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-square-foot-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat per-square-
  // foot price), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-
  // method pages, and distinct from this venture's own vs-bitumio.html.
  assert.doesNotMatch(html, /Bitumio/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-per-square-foot-price\.html">/);
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

  const easy = {
    surfaces: [{ name: 'Residential driveway', squareFeet: 800, coats: 2, firstCoatSqFtPerGal: 90, secondCoatSqFtPerGal: 120 }],
    condition: 'oxidized', method: 'squeegee',
    oilSpots: 4, crackFeet: 40, stalls: 0, sand: false, addOns: [],
    hourlyWage: 24, burdenRate: 32, milesOneWay: 8, speedMph: 35,
    setupHours: 0.5, minOnSiteHours: 1.5, tripFee: 35,
    sealerPerGallon: 4.25, primerPerGallon: 18, crackFillerPerFoot: 0.45,
    sandPerBag: 8, paintPerStall: 3.50, otherCost: 0,
    overheadRate: 15, targetMargin: 25, proposedPrice: null,
  };
  // Same 800 sq ft -- "the same flat price" -- but a commercial parking lot
  // in failing condition, with far more oil spots, crack feet, and stalls
  // to stripe than the easy driveway.
  const hard = {
    ...easy,
    surfaces: [{ name: 'Commercial parking lot', squareFeet: 800, coats: 2, firstCoatSqFtPerGal: 80, secondCoatSqFtPerGal: 110 }],
    condition: 'failing', method: 'squeegee',
    oilSpots: 20, crackFeet: 220, stalls: 24,
  };

  const easyResult = calculateBid(easy);
  assert.equal(easyResult.price.toFixed(2), '371.93');
  assert.equal(easyResult.totalCost.toFixed(2), '278.94');
  assert.equal(easyResult.pricePerSqFt.toFixed(2), '0.46');

  const hardResult = calculateBid(hard);
  assert.equal(hardResult.price.toFixed(2), '988.99');
  assert.equal(hardResult.totalCost.toFixed(2), '741.74');
  assert.equal(hardResult.pricePerSqFt.toFixed(2), '1.24');

  const flatPriceForHard = easyResult.price;
  assert.ok(flatPriceForHard < hardResult.totalCost, 'the flat price should quote below the hard job\'s own break-even cost');
  assert.equal((hardResult.totalCost - flatPriceForHard).toFixed(2), '369.82');
  assert.equal((hardResult.price - flatPriceForHard).toFixed(2), '617.07');
  assert.ok(hardResult.price / easyResult.price > 2.6);

  assert.match(html, /\$371\.93/);
  assert.match(html, /\$278\.94/);
  assert.match(html, /\$741\.74/);
  assert.match(html, /\$988\.99/);
  assert.match(html, /\$369\.82/);
  assert.match(html, /\$617\.07/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-per-square-foot-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-square-foot-price\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
