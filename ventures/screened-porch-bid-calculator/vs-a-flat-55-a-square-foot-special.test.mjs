import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  calculateBid,
  JOB_PRESETS,
  suggestedPerimeter,
  suggestedWallScreenSf,
  suggestedKneeWallLf,
  suggestedPanelCount,
  suggestedRoofSf,
  suggestedCeilingSf,
  suggestedMeshKit,
  suggestedRoofKit,
  suggestedCeilingKit,
  suggestedHeightKit,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-55-a-square-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// The same loaded-labor, material, and overhead figures index.html ships as
// its own defaults, so the only thing that differs between the two worked
// examples below is the porch geometry, not the crew's rates.
const MONEY_DEFAULTS = {
  hoursTrip: 2,
  hoursPerPanel: 0.55,
  hoursPerKneeLf: 0.35,
  hoursPerDoor: 1.4,
  hoursFan: 1.1,
  hoursDemo: 2.5,
  hoursSite: 0.4,
  siteHours: 0.5,
  panelEach: 38,
  kneeWallPerLf: 28,
  doorEach: 285,
  hardwareLump: 175,
  fanFee: 240,
  demoFee: 275,
  mobilizationFee: 185,
  permitFee: 225,
  hourlyWage: 30,
  burdenRate: 30,
  travelAndEquipment: 95,
  overheadRate: 15,
  targetMargin: 25,
};

// Expands one of the venture's own JOB_PRESETS into full calculateBid input
// using the shipped suggested* helpers, rather than hand-typing hours,
// square feet, or panel counts -- so a change to the geometry or kit
// formulas makes this page's worked example false (and the test red)
// instead of merely stale.
function expand(preset) {
  const perimeterLf = suggestedPerimeter(preset.widthFeet, preset.depthFeet, preset.attachment);
  const heightKit = suggestedHeightKit(preset.height);
  const wallHeightFeet = heightKit.wallHeightFeet;
  const wallScreenSf = suggestedWallScreenSf(preset.widthFeet, preset.depthFeet, preset.attachment, wallHeightFeet, preset.kneeWallInches);
  const kneeWallLf = suggestedKneeWallLf(preset.widthFeet, preset.depthFeet, preset.attachment, preset.kneeWallInches);
  const panelCount = suggestedPanelCount(perimeterLf, preset.panelWidthInches);
  const roofSf = suggestedRoofSf(preset.widthFeet, preset.depthFeet, preset.roof);
  const ceilingSf = suggestedCeilingSf(preset.widthFeet, preset.depthFeet, preset.ceiling);
  const meshKit = suggestedMeshKit(preset.mesh);
  const roofKit = suggestedRoofKit(preset.roof);
  const ceilingKit = suggestedCeilingKit(preset.ceiling);

  return {
    ...preset,
    ...MONEY_DEFAULTS,
    wallHeightFeet,
    perimeterLf,
    wallScreenSf,
    kneeWallLf,
    panelCount,
    roofSf,
    ceilingSf,
    extraHoursPerPanel: heightKit.extraHoursPerPanel,
    hoursPer100SfScreen: meshKit.hoursPer100Sf,
    screenPerSf: meshKit.screenPerSf,
    hoursPer100SfRoof: roofKit.hoursPer100Sf,
    roofPerSf: roofKit.roofPerSf,
    hoursPer100SfCeiling: ceilingKit.hoursPer100Sf,
    ceilingPerSf: ceilingKit.ceilingPerSf,
  };
}

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, engineering, permitting, legal, tax, or financial advice/i);
});

test('carries the best-effort hosting notice', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
});

// Generic-method comparison -- against a flat per-square-foot special, not
// a named competitor -- so this page names no vendor and is exempt from
// the trademark disclaimer, unlike this venture's own vs-buildxact.html.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Buildxact|JobNimbus|CoConstruct|ServiceTitan/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-55-a-square-foot-special\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-55-a-square-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-55-a-square-foot-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The page's central claim is that two of this venture's own JOB_PRESETS --
// the "$55/sf special" baseline job and the knee-wall/roof/ceiling job --
// price at very different rates per square foot. Recomputed here against
// the shipped module and its own presets rather than hand-typed, so a
// change to the arithmetic or the presets makes this page's claim false
// (and this test red) instead of merely stale.
test('the price-per-square-foot worked example matches what the shipped calculator computes', () => {
  const easyPreset = JOB_PRESETS[0];
  const hardPreset = JOB_PRESETS[1];
  assert.match(easyPreset.label, /\$55\/sf special/);
  assert.match(hardPreset.label, /knee wall, new framed roof, beadboard/);

  const easyResult = calculateBid(expand(easyPreset));
  const hardResult = calculateBid(expand(hardPreset));

  assert.equal(easyResult.price.toFixed(2), '3092.85');
  assert.equal(hardResult.price.toFixed(2), '12953.61');
  assert.equal(easyResult.pricePerSf.toFixed(2), '25.77');
  assert.equal(hardResult.pricePerSf.toFixed(2), '67.47');
  assert.equal((hardResult.pricePerSf / easyResult.pricePerSf).toFixed(1), '2.6');

  for (const value of ['$25.77', '$67.47', '2.6x']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the knee-wall/roof/ceiling worked example matches what the shipped calculator computes', () => {
  const easyResult = calculateBid(expand(JOB_PRESETS[0]));
  const hardResult = calculateBid(expand(JOB_PRESETS[1]));

  assert.equal(easyResult.kneeHours, 0);
  assert.equal(easyResult.roofHours, 0);
  assert.equal(easyResult.ceilingHours, 0);
  assert.equal(hardResult.kneeHours.toFixed(1), '14.0');
  assert.equal(hardResult.kneeMaterial.toFixed(2), '1120.00');
  assert.equal(hardResult.roofHours.toFixed(2), '6.53');
  assert.equal(hardResult.roofMaterial.toFixed(2), '2304.00');
  assert.equal(hardResult.ceilingHours.toFixed(2), '4.61');
  assert.equal(hardResult.ceilingMaterial.toFixed(2), '1440.00');

  const combinedHours = hardResult.kneeHours + hardResult.roofHours + hardResult.ceilingHours;
  const combinedMaterial = hardResult.kneeMaterial + hardResult.roofMaterial + hardResult.ceilingMaterial;
  assert.equal(combinedHours.toFixed(1), '25.1');
  assert.equal(combinedMaterial.toFixed(0), '4864');

  for (const value of ['14.0 hours and $1,120', '6.53 hours and $2,304', '4.61 hours and $1,440', '25.1 hours and $4,864']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the panel-count worked example matches what the shipped calculator computes', () => {
  const easyResult = calculateBid(expand(JOB_PRESETS[0]));
  const hardResult = calculateBid(expand(JOB_PRESETS[1]));

  assert.equal(easyResult.perimeterLf, 32);
  assert.equal(easyResult.panelCount, 11);
  assert.equal(hardResult.perimeterLf, 40);
  assert.equal(hardResult.panelCount, 14);

  for (const value of ['11 panels for the 32-foot perimeter', '14 panels for the 40-foot perimeter']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});

test('the margin-at-flat-rate worked example matches what the shipped calculator computes', () => {
  const hardResult = calculateBid(expand(JOB_PRESETS[1]));
  const flatPrice = hardResult.footprintSf * 55;
  const flatMargin = ((flatPrice - hardResult.totalCost) / flatPrice) * 100;

  assert.equal(hardResult.footprintSf, 192);
  assert.equal(flatPrice.toFixed(2), '10560.00');
  assert.equal(hardResult.totalCost.toFixed(2), '9715.20');
  assert.equal(flatMargin.toFixed(1), '8.0');
  assert.equal(hardResult.price.toFixed(2), '12953.61');

  for (const value of ['$10,560.00', '8.0% margin', '$9,715.20', '25% margin', '$12,953.61']) {
    assert.ok(html.includes(value), `worked-example figure missing from the page: ${value}`);
  }
});
