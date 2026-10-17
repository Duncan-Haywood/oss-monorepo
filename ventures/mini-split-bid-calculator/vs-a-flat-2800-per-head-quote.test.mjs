import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-2800-per-head-quote.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, HVAC, refrigerant-handling, legal, tax, or financial advice/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // head), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling
  // landscape-lighting-bid-calculator's
  // vs-a-flat-150-per-light-special.test.mjs.
  assert.doesNotMatch(html, /ServiceTitan|Jobber|Aspire|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/mini-split-bid-calculator\/vs-a-flat-2800-per-head-quote\.html">/);
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
    SYSTEM_PRESETS,
    HEAD_TYPE_PRESETS,
    STORY_PRESETS,
    ELECTRICAL_PRESETS,
    CONDENSATE_PRESETS,
  } = await import('./calc.mjs');

  const rates = {
    headTypeFactor: 1, storyFactor: 1, indoorHoursPerHead: 4, outdoorHours: 3,
    includedFeetPerHead: 15, lineSetMaterialPerExtraFoot: 12, hoursPerExtraTenFeet: 1,
    electricalHours: 0, electricalMaterial: 0, condensateHours: 0, condensateMaterial: 0,
    commissionHoursPerHead: 1, hourlyWage: 42, burdenRate: 30, permitFee: 175,
    travelAndLift: 85, overheadRate: 15, targetMargin: 22,
  };

  // SYSTEM_PRESETS[0] is the first-floor 12k wall-mount with 15 ft of
  // fully-included line-set -- the "cheap special" job a flat per-head
  // rate is built on. SYSTEM_PRESETS[1] is the second-story 18k wall-mount
  // with 35 ft of line-set, where extra line-set, a new circuit, and a
  // condensate pump are layered on -- where the flat rate loses.
  const easy = calculateBid({ ...rates, ...SYSTEM_PRESETS[0] });
  assert.equal(easy.price.toFixed(2), '3902.33');
  assert.equal(easy.breakEvenPrice.toFixed(2), '3043.82');
  assert.equal(easy.headCount, 1);
  assert.equal(easy.pricePerHead.toFixed(2), '3902.33');

  const wall = HEAD_TYPE_PRESETS.find((p) => p.id === 'wall');
  const second = STORY_PRESETS.find((p) => p.id === 'second');
  const circuit20 = ELECTRICAL_PRESETS.find((p) => p.id === 'circuit-20');
  const pump = CONDENSATE_PRESETS.find((p) => p.id === 'pump');
  const hardInput = {
    ...rates,
    ...SYSTEM_PRESETS[1],
    headTypeFactor: wall.factor,
    storyFactor: second.factor,
    electricalHours: circuit20.hours,
    electricalMaterial: circuit20.material,
    condensateHours: pump.hours,
    condensateMaterial: pump.material,
  };
  const hard = calculateBid(hardInput);
  assert.equal(hard.price.toFixed(2), '6140.00');
  assert.equal(hard.breakEvenPrice.toFixed(2), '4789.20');
  assert.equal(hard.headCount, 1);
  assert.equal(hard.extraLineSetFeet, 20);

  // The rate is fit to the easy job by construction: its own price divided
  // by its own head count, applied to the hard job's head count -- a flat
  // per-head rate has no line for story, extra line-set, or electrical.
  const rate = easy.price / easy.headCount;
  const flatOnHard = rate * hard.headCount;
  assert.equal(flatOnHard.toFixed(2), '3902.33');
  assert.ok(flatOnHard < hard.breakEvenPrice, 'the flat rate should quote below the hard job\'s own break-even cost');
  assert.equal((hard.breakEvenPrice - flatOnHard).toFixed(2), '886.86');
  assert.equal((hard.price - flatOnHard).toFixed(2), '2237.66');

  assert.match(html, /\$3,902\.33/);
  assert.match(html, /\$3,043\.82/);
  assert.match(html, /\$6,140\.00/);
  assert.match(html, /\$4,789\.20/);
  assert.match(html, /\$886\.86/);
  assert.match(html, /\$2,237\.66/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-2800-per-head-quote\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-2800-per-head-quote\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-to-install-a-mini-split\.html"/);
});
