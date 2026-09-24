import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  calculateBid,
  JOB_PRESETS,
  suggestedWaterSurface,
  suggestedPerimeter,
  suggestedWallSf,
  suggestedHopperExtraSf,
  suggestedStairSf,
  suggestedLinerSf,
  suggestedWastePercent,
  suggestedOrderSf,
  suggestedMilKit,
  suggestedBeadKit,
  suggestedAccessKit,
  suggestedStairKit,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-2999-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Shared money/hour rates the venture's own calc.test.mjs uses for its
// "coupon" job, so the only thing that differs between the two worked
// examples below is geometry and scope, not the crew's rates.
const MONEY_DEFAULTS = {
  hourlyWage: 30,
  burdenRate: 30,
  travelAndEquipment: 125,
  overheadRate: 15,
  targetMargin: 25,
  hoursTrip: 3,
  hoursPerTrackLf: 0.12,
  hoursCove: 2.4,
  hoursFoam: 3.2,
  hoursPump: 2.5,
  hoursCover: 1.4,
  siteHours: 0.8,
  fittingsLump: 185,
  disposalFee: 95,
  trackPerLf: 8.5,
  coveLump: 320,
  foamPerLf: 4.25,
  coverFee: 480,
  mobilizationFee: 225,
  permitFee: 185,
};

// Expands one of the venture's own JOB_PRESETS into full calculateBid
// input using the shipped suggested* helpers, rather than hand-typing
// liner square feet or hours -- so a change to the geometry or kit
// formulas makes this page's worked example false (and the test red)
// instead of merely stale.
function expand(preset) {
  const waterSurfaceSf = suggestedWaterSurface(preset.lengthFeet, preset.widthFeet, preset.shape);
  const perimeterLf = suggestedPerimeter(preset.lengthFeet, preset.widthFeet, preset.shape);
  const wallSf = suggestedWallSf(perimeterLf, preset.wallHeightFeet);
  const hopperExtraSf = suggestedHopperExtraSf(waterSurfaceSf, preset.depth);
  const stairSf = suggestedStairSf(preset.stairs);
  const linerSf = suggestedLinerSf(waterSurfaceSf, wallSf, hopperExtraSf, stairSf);
  const wastePercent = suggestedWastePercent(preset.pattern);
  const orderSf = suggestedOrderSf(linerSf, wastePercent);
  const milKit = suggestedMilKit(preset.mil);
  const beadKit = suggestedBeadKit(preset.bead);
  const accessKit = suggestedAccessKit(preset.access);
  const stairKit = suggestedStairKit(preset.stairs);

  return {
    ...preset,
    waterSurfaceSf,
    perimeterLf,
    wallSf,
    hopperExtraSf,
    stairSf,
    linerSf,
    wastePercent,
    orderSf,
    hoursPer100SfLiner: milKit.hoursPer100Sf,
    linerPerSf: milKit.linerPerSf,
    hoursBead: beadKit.extraHours,
    hoursStairs: stairKit.hours,
    hoursAccess: accessKit.extraHours,
    ...MONEY_DEFAULTS,
  };
}

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

// Generic-method comparison -- against a flat water-surface special, not
// a named competitor -- so this page names no vendor and is exempt from
// the trademark disclaimer, unlike this venture's own vs-jobber.html.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Jobber|Housecall|ServiceTitan|Workiz|Buildxact/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-2999-special\.html">/);
});

test('has Open Graph title/description tags', () => {
  assert.match(html, /<meta property="og:title" content="[^"]+">/);
  assert.match(html, /<meta property="og:description" content="[^"]+">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-2999-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-2999-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The page's central claim is that two of this venture's own JOB_PRESETS
// have nearly identical water surface but very different real prices.
// Recomputed here against the shipped module and its own presets rather
// than hand-typed, so a change to the arithmetic or the presets makes
// this page's claim false (and this test red) instead of merely stale.
test('the near-identical-water-surface worked example matches what the shipped calculator computes', () => {
  const easyPreset = JOB_PRESETS[0];
  const hardPreset = JOB_PRESETS[1];
  assert.match(easyPreset.label, /\$2,999 special/);
  assert.match(hardPreset.label, /oval.*wedding-cake/i);

  const easy = expand(easyPreset);
  const hard = expand(hardPreset);
  const easyResult = calculateBid(easy);
  const hardResult = calculateBid(hard);

  // Water surfaces are nearly identical...
  assert.equal(easy.waterSurfaceSf, 512);
  assert.equal(hard.waterSurfaceSf.toFixed(2), '508.94');
  assert.ok(Math.abs(easy.waterSurfaceSf - hard.waterSurfaceSf) < 5);

  // ...but the real prices are not.
  assert.equal(easyResult.price.toFixed(2), '5319.79');
  assert.equal(hardResult.price.toFixed(2), '9946.51');
  assert.equal((hardResult.price / easyResult.price).toFixed(2), '1.87');

  for (const value of ['512', '508.94', '$5,319.79', '$9,946.51', '1.87']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the margin-as-share-of-price worked example matches what the shipped calculator computes', () => {
  const easy = expand(JOB_PRESETS[0]);
  const easyResult = calculateBid(easy);
  const markupPrice = easyResult.totalCost * 1.25;
  const markupMargin = ((markupPrice - easyResult.totalCost) / markupPrice) * 100;

  assert.equal(easyResult.totalCost.toFixed(2), '3989.84');
  assert.equal(markupPrice.toFixed(2), '4987.30');
  assert.equal(markupMargin.toFixed(1), '20.0');

  for (const value of ['$3,989.84', '$4,987.30', '20.0% margin', '$5,319.79']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
