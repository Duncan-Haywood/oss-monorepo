import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-150-per-light-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, construction, legal, tax, or financial advice/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // light), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling
  // hardwood-refinishing-bid-calculator's
  // vs-a-flat-price-per-square-foot.test.mjs.
  assert.doesNotMatch(html, /Aspire|ServiceTitan|Jobber|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-150-per-light-special\.html">/);
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
    suggestedScopeKit,
    suggestedSoilKit,
    suggestedTransformerKit,
    suggestedExtraKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = {
    hourlyWage: 32, burdenRate: 30, travelAndEquipment: 55, otherCost: 0,
    overheadRate: 15, targetMargin: 20,
  };

  function fullInput(preset) {
    return {
      ...rates,
      ...preset,
      ...suggestedScopeKit(preset.scope),
      ...suggestedSoilKit(preset.soil),
      ...suggestedTransformerKit(preset.transformer),
      ...suggestedExtraKit(),
    };
  }

  // JOB_PRESETS[0] is the 6-path-light walkway special on an existing
  // transformer -- the "cheap special" job a flat per-light rate is built
  // on. JOB_PRESETS[2] is the 20-fixture architectural install with wells,
  // a new 300W transformer, 180 LF of trench through irrigated turf, and a
  // driveway saw-cut -- where the flat rate loses.
  const easy = calculateBid(fullInput(JOB_PRESETS[0]));
  assert.equal(easy.price.toFixed(2), '728.26');
  assert.equal(easy.breakEvenPrice.toFixed(2), '582.61');
  assert.equal(easy.fixtureCount, 6);
  assert.equal(easy.pricePerFixture.toFixed(2), '121.38');

  const hard = calculateBid(fullInput(JOB_PRESETS[2]));
  assert.equal(hard.price.toFixed(2), '5773.11');
  assert.equal(hard.breakEvenPrice.toFixed(2), '4618.49');
  assert.equal(hard.fixtureCount, 20);

  // The rate is fit to the easy job by construction: its own price divided
  // by its own fixture count, applied only to the hard job's fixture count
  // -- a flat per-light rate has no line for a trench or a transformer.
  const rate = easy.price / easy.fixtureCount;
  const flatOnHard = rate * hard.fixtureCount;
  assert.equal(flatOnHard.toFixed(2), '2427.53');
  assert.ok(flatOnHard < hard.breakEvenPrice, 'the flat rate should quote below the hard job\'s own break-even cost');
  assert.equal((hard.breakEvenPrice - flatOnHard).toFixed(2), '2190.96');
  assert.equal((hard.price - flatOnHard).toFixed(2), '3345.58');

  assert.match(html, /\$728\.26/);
  assert.match(html, /\$582\.61/);
  assert.match(html, /\$121\.38/);
  assert.match(html, /\$5,773\.11/);
  assert.match(html, /\$4,618\.49/);
  assert.match(html, /\$2,427\.53/);
  assert.match(html, /\$2,190\.96/);
  assert.match(html, /\$3,345\.58/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-150-per-light-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-150-per-light-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-landscape-lighting\.html"/);
});
