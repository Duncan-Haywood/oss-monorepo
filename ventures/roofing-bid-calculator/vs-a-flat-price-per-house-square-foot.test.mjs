import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-house-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat price per
  // house square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html and
  // vs-acculynx.html, which name real products.
  assert.doesNotMatch(html, /Jobber|AccuLynx/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/roofing-bid-calculator\/vs-a-flat-price-per-house-square-foot\.html">/);
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
    sections: [
      { name: 'Main house', footprintSqFt: 1800, pitchRise: 6, tearOffLayers: 1 },
      { name: 'Attached garage', footprintSqFt: 400, pitchRise: 4, tearOffLayers: 1 },
    ],
    wastePercent: 10, materialPerSquare: 140, underlaymentPerSquare: 22, accessoriesFlat: 450,
    installHoursPerSquare: 1.8, tearOffHoursPerSquare: 1, hourlyWage: 35, burdenRate: 30,
    dumpPerSquare: 35, dumpsterFee: 450, permitFee: 250, otherCost: 0, overheadRate: 15,
    targetMargin: 20, proposedPrice: null,
  };
  // Same 2,200 sq ft footprint -- "the same flat price" -- but a steeper
  // roof with a two-layer tear-off on both sections instead of one.
  const steep = {
    ...easy,
    sections: [
      { name: 'Main house', footprintSqFt: 1800, pitchRise: 12, tearOffLayers: 2 },
      { name: 'Attached garage', footprintSqFt: 400, pitchRise: 10, tearOffLayers: 2 },
    ],
  };

  const easyResult = calculateBid(easy);
  assert.equal(easyResult.totalFootprintSqFt, 2200);
  assert.equal(easyResult.jobCost.toFixed(2), '11085.87');
  assert.equal(easyResult.jobPrice.toFixed(2), '13857.34');
  assert.equal(easyResult.pricePerFootprintSqFt.toFixed(2), '6.30');

  const steepResult = calculateBid(steep);
  assert.equal(steepResult.totalFootprintSqFt, 2200);
  assert.equal(steepResult.jobCost.toFixed(2), '19652.96');
  assert.equal(steepResult.jobPrice.toFixed(2), '24566.20');
  assert.equal(steepResult.pricePerFootprintSqFt.toFixed(2), '11.17');

  const flatQuoteOnSteep = easyResult.jobPrice;
  assert.ok(flatQuoteOnSteep < steepResult.jobCost, "the flat price should quote below the steep job's own break-even cost");
  assert.equal((steepResult.jobCost - flatQuoteOnSteep).toFixed(2), '5795.62');
  assert.equal((steepResult.jobPrice - flatQuoteOnSteep).toFixed(2), '10708.86');
  assert.ok(steepResult.jobPrice / easyResult.jobPrice > 1.7);

  assert.match(html, /\$13,857\.34/);
  assert.match(html, /\$11,085\.87/);
  assert.match(html, /\$19,652\.96/);
  assert.match(html, /\$24,566\.20/);
  assert.match(html, /\$5,795\.62/);
  assert.match(html, /\$10,708\.86/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-price-per-house-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-house-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-price-a-roof-by-the-square\.html"/);
});
