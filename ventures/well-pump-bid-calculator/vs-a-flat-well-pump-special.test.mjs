import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-well-pump-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat $1,495
  // well-pump special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling
  // shed-install-bid-calculator's vs-a-flat-price-per-square-foot.test.mjs.
  assert.doesNotMatch(html, /ServiceTitan|Jobber|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-well-pump-special\.html">/);
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
    suggestedHpKit,
    suggestedTypeKit,
    suggestedWorkKit,
    suggestedPitlessKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = {
    hoursTrip: 0.75, hoursPumpBase: 2.5, hoursPerExtraFoot: 0.015, hoursTank: 1,
    hoursPitless: 2, hoursStuckPull: 1.5, hoursSwitch: 0.5, hoursPerExtraCableFoot: 0.004,
    hoursVfd: 1.25, siteHours: 0.5, cablePerFoot: 1.85, switchCost: 85, vfdCost: 650,
    hoistFee: 75, permitFee: 0, hourlyWage: 42, burdenRate: 32, travelAndEquipment: 85,
    overheadRate: 18, targetMargin: 35,
  };

  function fullInput(preset) {
    const hpKit = suggestedHpKit(preset.hp, preset.type);
    const typeKit = suggestedTypeKit(preset.type);
    const workKit = suggestedWorkKit(preset.work);
    const pitlessKit = suggestedPitlessKit(preset.pitless);
    return {
      ...rates,
      ...preset,
      pumpCost: hpKit.pumpCost,
      hoursPumpBase: typeKit.hoursPumpBase,
      hoistFee: typeKit.hoistFee,
      hoursTank: workKit.hoursTank,
      tankCost: workKit.tankCost,
      hoursSwitch: workKit.hoursSwitch,
      switchCost: workKit.switchCost,
      hoursPitless: pitlessKit.hoursPitless,
      pitlessCost: pitlessKit.pitlessCost,
    };
  }

  // JOB_PRESETS[0] is the "$1,495 brochure special" job; JOB_PRESETS[2] is
  // the deep, seized-pitless, stuck-pump, full-scope job.
  const easy = calculateBid(fullInput(JOB_PRESETS[0]));
  assert.equal(easy.price.toFixed(2), '1176.19');
  assert.equal(easy.breakEvenPrice.toFixed(2), '764.52');

  const hard = calculateBid(fullInput(JOB_PRESETS[2]));
  assert.equal(hard.price.toFixed(2), '5915.32');
  assert.equal(hard.breakEvenPrice.toFixed(2), '3844.96');

  const flat = 1495;
  assert.ok(flat > easy.price, 'the flat special should price above the calculator\'s own bid on the easy job');
  assert.equal((flat - easy.price).toFixed(2), '318.81');

  assert.ok(flat < hard.breakEvenPrice, 'the flat special should quote below the hard job\'s own break-even cost');
  assert.equal((hard.breakEvenPrice - flat).toFixed(2), '2349.96');
  assert.equal((hard.price - flat).toFixed(2), '4420.32');

  assert.match(html, /\$1,176\.19/);
  assert.match(html, /\$764\.52/);
  assert.match(html, /\$5,915\.32/);
  assert.match(html, /\$3,844\.96/);
  assert.match(html, /\$318\.81/);
  assert.match(html, /\$2,349\.96/);
  assert.match(html, /\$4,420\.32/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-well-pump-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-well-pump-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-replace-a-well-pump\.html"/);
});
