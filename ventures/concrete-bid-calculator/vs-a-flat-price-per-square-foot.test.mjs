import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-stack.html, which
  // does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /STACK/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/concrete-bid-calculator\/vs-a-flat-price-per-square-foot\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped starting inputs', async () => {
  const { calculateBid, slabVolumeCuYd } = await import('./calc.mjs');

  const baseCosts = {
    wastePct: 8, concretePerYd: 175, formPerLf: 3.5, formHours: 6,
    reinforcementPerSqFt: 0.35, accessHoursPer100: 0, pumpFee: 0,
    shortLoadThresholdYd: 5, shortLoadFee: 80,
    demoSqFt: 0, demoThicknessIn: 4, haulPerYd: 45, demoHours: 0,
    prepHours: 4, hourlyWage: 28, burdenRate: 30, otherCost: 150,
    overheadRate: 12, targetMargin: 20, proposedPrice: null,
  };

  const run = (thicknessIn) => calculateBid({
    slabs: [{ name: 'Broom finish', lengthFt: 20, widthFt: 40, thicknessIn, hoursPer100: 0.85 }],
    ...baseCosts,
  });

  // A 20x40 driveway, poured 4 inches thick -- the tool's own shipped
  // starting thickness.
  const driveway = run(4);
  assert.equal(driveway.totalSquareFeet, 800);
  assert.equal(slabVolumeCuYd({ squareFeet: 800, thicknessIn: 4 }).toFixed(2), '9.88');
  assert.equal(driveway.orderedYards, 10.75);
  assert.equal(driveway.price.toFixed(2), '4679.88');
  assert.equal(driveway.pricePerSqFt.toFixed(2), '5.85');
  assert.equal(driveway.totalCost.toFixed(2), '3743.90');

  // The identical footprint, poured 6 inches thick for an RV -- same
  // finish, same access, same every other cost input.
  const rvPad = run(6);
  assert.equal(rvPad.totalSquareFeet, 800);
  assert.equal(slabVolumeCuYd({ squareFeet: 800, thicknessIn: 6 }).toFixed(2), '14.81');
  assert.equal(rvPad.orderedYards, 16);
  assert.equal(rvPad.price.toFixed(2), '5966.13');
  assert.equal(rvPad.pricePerSqFt.toFixed(2), '7.46');
  assert.equal(rvPad.totalCost.toFixed(2), '4772.90');

  // A rate learned per square foot from the driveway, applied to the
  // identical footprint of the RV pad, reproduces the driveway's own
  // price -- because a flat rate times the same area is that price.
  const flatPriceAppliedToRvFootprint = driveway.pricePerSqFt * rvPad.totalSquareFeet;
  assert.equal(flatPriceAppliedToRvFootprint.toFixed(2), driveway.price.toFixed(2));
  assert.ok(
    flatPriceAppliedToRvFootprint < rvPad.totalCost,
    'the flat-rate price should quote below the 6-inch pour\'s own break-even cost',
  );
  assert.equal((rvPad.totalCost - flatPriceAppliedToRvFootprint).toFixed(2), '93.02');
  assert.equal((rvPad.price - flatPriceAppliedToRvFootprint).toFixed(2), '1286.25');

  assert.match(html, /\$4,679\.88/);
  assert.match(html, /\$5\.85/);
  assert.match(html, /\$4,772\.90/);
  assert.match(html, /\$5,966\.13/);
  assert.match(html, /\$7\.46/);
  assert.match(html, /\$93\.02/);
  assert.match(html, /\$1,286\.25/);
  assert.match(html, /10\.75 cubic yards/);
  assert.match(html, /16 cubic yards/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the concrete-yards page', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-concrete-for-a-driveway\.html"/);
});
