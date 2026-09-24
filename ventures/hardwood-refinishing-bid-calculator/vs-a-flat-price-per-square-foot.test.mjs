import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not flooring, construction, legal, tax, or financial advice/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling
  // pole-barn-bid-calculator's vs-a-flat-price-per-square-foot.test.mjs.
  assert.doesNotMatch(html, /Jobber|ServiceTitan|JobTread|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/hardwood-refinishing-bid-calculator\/vs-a-flat-price-per-square-foot\.html">/);
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
    suggestedHoursPer100,
    suggestedBaseCoats,
    suggestedStain,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = {
    hourlyWage: 42, burdenRate: 30, overheadRate: 15, targetMargin: 25,
    travelAndEquipment: 185, finishCost: 85, stainCost: 45, suppliesPer100: 18,
    finishCoverage: 450, stainCoverage: 500, hoursPerTread: 0.4, hoursPerCloset: 1,
    stainHoursPer100: 1.8, extraCoatHoursPer100: 1.2, methodLaborFactor: 1,
  };

  function fullInput(preset) {
    const stain = suggestedStain(preset.stainId);
    return {
      ...rates,
      ...preset,
      hoursPer100: suggestedHoursPer100(preset.methodId),
      baseCoats: suggestedBaseCoats(preset.methodId),
      staining: stain.staining,
      extraCoats: stain.extraCoats,
    };
  }

  // JOB_PRESETS[0] is the 400 sq ft screen-and-recoat living room -- the
  // "cheap special" job a flat per-square-foot rate is built on.
  // JOB_PRESETS[3] is the 250 sq ft hallway plus 14 treads with a stain
  // color change, the shipped "stairs trap" preset -- where the flat rate
  // loses.
  const easy = calculateBid(fullInput(JOB_PRESETS[0]));
  assert.equal(easy.price.toFixed(2), '2036.11');
  assert.equal(easy.breakEvenPrice.toFixed(2), '1527.09');
  assert.equal(easy.floorSqFt, 400);
  assert.equal(easy.pricePerSqFt.toFixed(2), '5.09');

  const hard = calculateBid(fullInput(JOB_PRESETS[3]));
  assert.equal(hard.price.toFixed(2), '3599.92');
  assert.equal(hard.breakEvenPrice.toFixed(2), '2699.94');
  assert.equal(hard.floorSqFt, 250);
  assert.equal(hard.finishArea, 306);

  // The rate is fit to the easy job by construction: its own price divided
  // by its own field square footage, applied only to the hard job's field
  // -- a flat per-square-foot rate has no line for stair treads.
  const rate = easy.price / easy.floorSqFt;
  const flatOnHard = rate * hard.floorSqFt;
  assert.equal(flatOnHard.toFixed(2), '1272.57');
  assert.ok(flatOnHard < hard.breakEvenPrice, 'the flat rate should quote below the hard job\'s own break-even cost');
  assert.equal((hard.breakEvenPrice - flatOnHard).toFixed(2), '1427.37');
  assert.equal((hard.price - flatOnHard).toFixed(2), '2327.35');

  assert.match(html, /\$2,036\.11/);
  assert.match(html, /\$1,527\.09/);
  assert.match(html, /\$5\.09/);
  assert.match(html, /\$3,599\.92/);
  assert.match(html, /\$2,699\.94/);
  assert.match(html, /\$1,272\.57/);
  assert.match(html, /\$1,427\.37/);
  assert.match(html, /\$2,327\.35/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-refinish-hardwood-floors\.html"/);
});
