import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-180-per-square-foot-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat $/sf
  // special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is the
  // same discipline vs-a-flat-rate-per-square-foot.test.mjs uses on the
  // sibling artificial-turf-bid-calculator venture.
  assert.doesNotMatch(html, /Jobber|ServiceTitan|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-180-per-square-foot-special\.html">/);
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
    JOB_PRESETS, calculateBid, suggestedPerimeter, suggestedGlassSf, suggestedKneeWallLf,
    suggestedWindowCount, suggestedFloorSf, suggestedRoofSf, suggestedEnclosureKit,
    suggestedFoundationKit, suggestedRoofKit, suggestedHeightKit,
  } = await import('./calc.mjs');

  const defaults = {
    hoursTrip: 3, hoursPerWindow: 1.4, hoursPerKneeLf: 0.4, hoursPerSlider: 2.2,
    hoursHvac: 6, hoursElectrical: 4, hoursSite: 0.5, siteHours: 0.6,
    windowEach: 280, kneeWallPerLf: 32, sliderEach: 1450, hardwareLump: 275,
    hvacFee: 3200, electricalFee: 1400, mobilizationFee: 325, permitFee: 650,
    hourlyWage: 38, burdenRate: 30, travelAndEquipment: 140, overheadRate: 15, targetMargin: 25,
  };

  function fullInput(preset) {
    const height = suggestedHeightKit(preset.height);
    const enc = suggestedEnclosureKit(preset.enclosure);
    const found = suggestedFoundationKit(preset.foundation);
    const roof = suggestedRoofKit(preset.roof);
    const perimeter = suggestedPerimeter(preset.widthFeet, preset.depthFeet, preset.attachment);
    const glassSf = suggestedGlassSf(
      preset.widthFeet, preset.depthFeet, preset.attachment, height.wallHeightFeet, preset.kneeWallInches,
    );
    const kneeWallLf = suggestedKneeWallLf(preset.widthFeet, preset.depthFeet, preset.attachment, preset.kneeWallInches);
    const windowCount = suggestedWindowCount(perimeter, preset.windowWidthInches);
    const floorSf = suggestedFloorSf(preset.widthFeet, preset.depthFeet, preset.foundation);
    const roofSf = suggestedRoofSf(preset.widthFeet, preset.depthFeet, preset.roof);
    return {
      ...defaults,
      ...preset,
      wallHeightFeet: height.wallHeightFeet,
      extraHoursPerWindow: height.extraHoursPerWindow,
      hoursPer100SfGlass: enc.hoursPer100Sf,
      glassPerSf: enc.glassPerSf,
      hoursPer100SfFloor: found.hoursPer100Sf,
      floorPerSf: found.floorPerSf,
      hoursPer100SfRoof: roof.hoursPer100Sf,
      roofPerSf: roof.roofPerSf,
      perimeterLf: perimeter,
      glassSf, kneeWallLf, windowCount, floorSf, roofSf,
    };
  }

  const flatRatePerSf = 180;

  const cheap = calculateBid(fullInput(JOB_PRESETS[0]));
  const cheapFootprint = JOB_PRESETS[0].widthFeet * JOB_PRESETS[0].depthFeet;
  assert.equal(cheapFootprint, 120);
  assert.equal(cheap.totalCost.toFixed(2), '11395.50');
  assert.equal(cheap.price.toFixed(2), '15194.00');
  const cheapFlat = flatRatePerSf * cheapFootprint;
  assert.equal(cheapFlat.toFixed(2), '21600.00');
  assert.equal((cheapFlat - cheap.totalCost).toFixed(2), '10204.50');
  assert.equal((cheapFlat - cheap.price).toFixed(2), '6406.00');
  assert.ok(cheapFlat > cheap.price, 'the flat special should be generous on the cheap end');

  const heavy = calculateBid(fullInput(JOB_PRESETS[1]));
  const heavyFootprint = JOB_PRESETS[1].widthFeet * JOB_PRESETS[1].depthFeet;
  assert.equal(heavyFootprint, 192);
  assert.equal(heavy.totalCost.toFixed(2), '35430.47');
  assert.equal(heavy.price.toFixed(2), '47240.63');
  const heavyFlat = flatRatePerSf * heavyFootprint;
  assert.equal(heavyFlat.toFixed(2), '34560.00');
  assert.ok(heavyFlat < heavy.totalCost, 'the flat special should quote below the harder room\'s own break-even cost');
  assert.equal((heavy.totalCost - heavyFlat).toFixed(2), '870.47');
  assert.equal((heavy.price - heavyFlat).toFixed(2), '12680.63');

  assert.match(html, /\$11,395\.50/);
  assert.match(html, /\$15,194\.00/);
  assert.match(html, /\$21,600\.00/);
  assert.match(html, /\$10,204\.50/);
  assert.match(html, /\$6,406\.00/);
  assert.match(html, /\$35,430\.47/);
  assert.match(html, /\$47,240\.63/);
  assert.match(html, /\$34,560\.00/);
  assert.match(html, /\$870\.47/);
  assert.match(html, /\$12,680\.63/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-180-per-square-foot-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-180-per-square-foot-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-build-a-sunroom\.html"/);
});
