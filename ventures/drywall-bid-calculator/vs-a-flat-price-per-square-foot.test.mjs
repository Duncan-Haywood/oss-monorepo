import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-buildxact.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Buildxact/);
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
  const { calculateBid } = await import('./calc.mjs');

  const baseInput = {
    rooms: [{ name: 'Main area', lengthFt: 40, widthFt: 25, heightFt: 8, includeCeiling: true }],
    openingSqFt: 86,
    openingCount: 7,
    wastePercent: 10,
    hangHoursPer100: 1.15,
    materialPer100: 48,
    sheetSqFt: 32,
    tapeLfPerSqFt: 0.42,
    textureHoursPer100: 0,
    textureMaterialPer100: 0,
    tearOff: false,
    tearOffHoursPer100: 1.6,
    hourlyWage: 34,
    burdenRate: 32,
    milesOneWay: 12,
    speedMph: 32,
    setupHours: 0.75,
    minOnSiteHours: 4,
    tripFee: 75,
    dumpsterCost: 425,
    otherCost: 0,
    overheadRate: 16,
    targetMargin: 26,
    proposedPrice: null,
  };

  // The same rooms finished to Level 1 (fire-tape) -- the profile a flat
  // per-square-foot rate is probably learned from.
  const easy = calculateBid({ ...baseInput, finishLevel: 1 });
  assert.equal(easy.netHungSqFt, 1954);
  assert.equal(easy.totalHours.toFixed(1), '46.4');
  assert.equal(easy.price.toFixed(2), '5473.07');
  assert.equal(easy.pricePerHungSqFt.toFixed(2), '2.80');

  // The identical rooms finished to Level 5 -- same footage, same every
  // other cost input.
  const hard = calculateBid({ ...baseInput, finishLevel: 5 });
  assert.equal(hard.netHungSqFt, 1954);
  assert.equal(hard.totalHours.toFixed(1), '152.8');
  assert.equal(hard.totalCost.toFixed(2), '10536.55');
  assert.equal(hard.price.toFixed(2), '14238.58');
  assert.equal(hard.pricePerHungSqFt.toFixed(2), '7.29');

  // A rate learned per square foot from the Level 1 job, applied to the
  // identical footage of the Level 5 job, reproduces the Level 1 job's own
  // price -- because a flat rate times the same area is that price.
  const flatPriceOnHardFootage = easy.pricePerHungSqFt * hard.netHungSqFt;
  assert.equal(flatPriceOnHardFootage.toFixed(2), easy.price.toFixed(2));
  assert.ok(
    flatPriceOnHardFootage < hard.totalCost,
    'the flat-rate price should quote below the Level 5 job\'s own break-even cost',
  );
  assert.equal((hard.totalCost - flatPriceOnHardFootage).toFixed(2), '5063.48');
  assert.equal((hard.price - flatPriceOnHardFootage).toFixed(2), '8765.51');

  assert.match(html, /\$5,473\.07/);
  assert.match(html, /\$2\.80/);
  assert.match(html, /\$10,536\.55/);
  assert.match(html, /\$14,238\.58/);
  assert.match(html, /\$7\.29/);
  assert.match(html, /\$5,063\.48/);
  assert.match(html, /\$8,765\.51/);
  assert.match(html, /46\.4 hours/);
  assert.match(html, /152\.8 hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
