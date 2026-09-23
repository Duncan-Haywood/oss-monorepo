import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-price-per-square-foot\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped cost inputs', async () => {
  const { compareScope } = await import('./calc.mjs');

  const baseInput = {
    lengthFt: 36,
    widthFt: 28,
    height: 'two-story',
    texture: 'painted',
    travelMiles: 22,
    closetCeilings: 6,
    stainRepairs: 4,
    asbestosTest: true,
    containment: true,
    furnitureMove: true,
    hourlyWage: 32,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 0,
    otherCost: 0,
  };

  const rows = compareScope(baseInput);
  const cheap = rows.find((row) => row.scope === 'scrape-prime');
  const heavy = rows.find((row) => row.scope === 'scrape-skim-paint');
  const ceilingSqFt = 36 * 28;

  assert.equal(ceilingSqFt, 1008);
  assert.equal(cheap.totalHours.toFixed(1), '64.7');
  assert.equal(cheap.price.toFixed(2), '5369.58');
  assert.equal(cheap.pricePerSqFt.toFixed(2), '5.33');

  assert.equal(heavy.totalHours.toFixed(1), '105.1');
  assert.equal(heavy.totalCost.toFixed(2), '7314.22');
  assert.equal(heavy.price.toFixed(2), '9142.77');
  assert.equal(heavy.pricePerSqFt.toFixed(2), '9.07');

  // A rate learned per square foot from the cheap job, applied to the
  // identical footage of the heavy job, reproduces the cheap job's own
  // price -- because a flat rate times the same area is that price.
  const flatPriceOnHeavyFootage = cheap.price / ceilingSqFt * ceilingSqFt;
  assert.equal(flatPriceOnHeavyFootage.toFixed(2), cheap.price.toFixed(2));
  assert.ok(
    flatPriceOnHeavyFootage < heavy.totalCost,
    'the flat-rate price should quote below the heavy job\'s own break-even cost',
  );
  assert.equal((heavy.totalCost - flatPriceOnHeavyFootage).toFixed(2), '1944.64');
  assert.equal((heavy.price - flatPriceOnHeavyFootage).toFixed(2), '3773.20');

  assert.match(html, /\$5,369\.58/);
  assert.match(html, /\$5\.33/);
  assert.match(html, /\$7,314\.22/);
  assert.match(html, /\$9,142\.77/);
  assert.match(html, /\$9\.07/);
  assert.match(html, /\$1,944\.64/);
  assert.match(html, /\$3,773\.20/);
  assert.match(html, /64\.7 hours/);
  assert.match(html, /105\.1 hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-remove-popcorn-ceiling\.html"/);
});
