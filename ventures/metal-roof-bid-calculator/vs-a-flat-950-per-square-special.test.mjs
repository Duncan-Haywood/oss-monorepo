import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-950-per-square-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a construction specification, a building-code opinion, a permit, an engineering stamp/i);
});

// This page compares against a generic pricing method (a flat per-square
// special), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-acculynx.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /AccuLynx/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-950-per-square-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-950-per-square-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-950-per-square-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, this page's numbers must be re-derived, not left stale. Mirrors
// the derivation chain index.html itself runs (applyPanelKit/applyTearOffKit/
// applyStoryKit/applyGeometryKits) rather than hand-computing squares.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const {
    calculateBid,
    suggestedPitchMultiplier,
    suggestedRoofSf,
    suggestedSquares,
    suggestedHipValleyWastePct,
    suggestedPanelSquares,
    suggestedTearOffSquares,
    suggestedPanelKit,
    suggestedTearOffKit,
    suggestedStoryKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = {
    hoursTrip: 3, hoursPerTrimLf: 0.08, hoursPerSnowGuard: 0.12, hoursPerBoot: 0.35,
    hoursIceAndWater: 2.5, siteHours: 0.8,
    underlayPerSquare: 38, iceAndWaterPerSquare: 55, ridgePerLf: 9, hipPerLf: 11,
    valleyPerLf: 14, rakePerLf: 7, eavePerLf: 6, snowGuardEach: 18, bootEach: 42,
    fastenerLump: 185, mobilizationFee: 350, permitFee: 425,
    hourlyWage: 36, burdenRate: 32, travelAndEquipment: 160, overheadRate: 15, targetMargin: 25,
  };
  const flatPerSquare = 950;

  function priceJob(preset) {
    const pitchMultiplier = suggestedPitchMultiplier(preset.pitch);
    const roofSf = suggestedRoofSf(preset.lengthFeet, preset.widthFeet, preset.pitch);
    const squares = suggestedSquares(preset.lengthFeet, preset.widthFeet, preset.pitch);
    const hipValleyWastePct = suggestedHipValleyWastePct(preset.hipLf, preset.valleyLf);
    const panelKit = suggestedPanelKit(preset.panel);
    const panelSquares = suggestedPanelSquares(squares, panelKit.wastePct, hipValleyWastePct);
    const tearOffSquares = suggestedTearOffSquares(squares, preset.tearoff);
    const tearOffKit = suggestedTearOffKit(preset.tearoff);
    const storyKit = suggestedStoryKit(preset.stories);
    return calculateBid({
      ...rates,
      ...preset,
      pitchMultiplier, roofSf, squares, hipValleyWastePct, panelSquares, tearOffSquares,
      hoursPerSquare: panelKit.hoursPerSquare,
      panelPerSquare: panelKit.panelPerSquare,
      wastePct: panelKit.wastePct,
      seamerHours: panelKit.seamerHours,
      seamerFee: panelKit.seamerFee,
      hoursTearoffPerSquare: tearOffKit.hoursPerSquare,
      dumpsterPerSquare: tearOffKit.dumpsterPerSquare,
      extraHoursPerSquare: storyKit.extraHoursPerSquare,
    });
  }

  // Index 0: the coupon job (40x30 ranch, 4/12, 5V overlay). Index 1: the
  // mechanical-lock two-story tear-off. Index 3: the Cape (48x32, 8/12, 5V
  // tear-off, two stories) -- the page's three worked-example rows.
  const coupon = priceJob(JOB_PRESETS[0]);
  const mechLock = priceJob(JOB_PRESETS[1]);
  const cape = priceJob(JOB_PRESETS[3]);

  assert.equal(coupon.totalCost.toFixed(2), '8322.86');
  assert.equal(cape.totalCost.toFixed(2), '14471.00');
  assert.equal(mechLock.totalCost.toFixed(2), '35050.90');

  assert.equal((coupon.squares * flatPerSquare).toFixed(2), '12015.60');
  assert.equal((cape.squares * flatPerSquare).toFixed(2), '17539.58');
  assert.equal((mechLock.squares * flatPerSquare).toFixed(2), '24738.00');

  assert.match(html, /\$8,322\.86/);
  assert.match(html, /\$12,015\.60/);
  assert.match(html, /\$14,471\.00/);
  assert.match(html, /\$17,539\.58/);
  assert.match(html, /\$35,050\.90/);
  assert.match(html, /\$24,738\.00/);
});
