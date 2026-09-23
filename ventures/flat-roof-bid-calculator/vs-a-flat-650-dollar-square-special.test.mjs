import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-650-dollar-square-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

// This page compares against a generic pricing habit (a flat "$650 / square"
// special), not a named competitor, so it is listed in
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
// carrying a "not affiliated" clause -- there is no company to disclaim a
// relationship with. Distinct from this venture's own vs-acculynx.html, which
// does name a product and carries its own "not affiliated" clause.
test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /AccuLynx/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-650-dollar-square-special\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-650-dollar-square-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-650-dollar-square-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-a-flat-roof\.html"/);
});

// The worked-example figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets, suggested kits, or
// shipped index.html shop-rate defaults ever change, this page's numbers
// must be re-derived, not left stale.
test('the worked-example figures match calc.mjs run against JOB_PRESETS[0] and JOB_PRESETS[1] at the shipped default shop rates', async () => {
  const {
    calculateBid, JOB_PRESETS, suggestedMembraneKit, suggestedScopeKit, suggestedStoryKit,
    suggestedSlopeMultiplier, suggestedRoofSf, suggestedSquares, suggestedParapetWastePct,
    suggestedMembraneSquares, suggestedTearOffSquares, suggestedInsulationSquares,
  } = await import('./calc.mjs');

  // This calculator's own shipped index.html shop-rate defaults.
  const shopRates = {
    hourlyWage: 36,
    burdenRate: 32,
    travelAndEquipment: 160,
    overheadRate: 15,
    targetMargin: 25,
    fastenerLump: 160,
    mobilizationFee: 350,
    permitFee: 425,
    hoursTrip: 3,
    hoursPerInsulationSquare: 0.55,
    hoursPerParapetLf: 0.12,
    hoursPerDrain: 0.8,
    hoursPerCurb: 1.4,
    hoursPerWalkPadSquare: 0.6,
    hoursCoverBoard: 3,
    siteHours: 0.8,
    insulationPerSquare: 95,
    coverBoardPerSquare: 48,
    parapetPerLf: 18,
    drainEach: 165,
    curbEach: 240,
    walkPadPerSquare: 85,
    proposedPrice: null,
  };

  function job(preset) {
    const membraneKit = suggestedMembraneKit(preset.membrane);
    const scopeKit = suggestedScopeKit(preset.scope);
    const storyKit = suggestedStoryKit(preset.stories);
    const slopeMultiplier = suggestedSlopeMultiplier(preset.slope);
    const roofSf = suggestedRoofSf(preset.lengthFeet, preset.widthFeet, preset.slope);
    const squares = suggestedSquares(preset.lengthFeet, preset.widthFeet, preset.slope);
    const parapetWastePct = suggestedParapetWastePct(preset.parapetLf);
    const membraneSquares = suggestedMembraneSquares(squares, membraneKit.wastePct, parapetWastePct);
    const tearOffSquares = suggestedTearOffSquares(squares, preset.scope);
    const insulationSquares = suggestedInsulationSquares(squares, preset.insulationLayers);
    return calculateBid({
      ...preset,
      ...shopRates,
      slopeMultiplier,
      roofSf,
      squares,
      wastePct: membraneKit.wastePct,
      parapetWastePct,
      membraneSquares,
      tearOffSquares,
      insulationSquares,
      hoursPerSquare: membraneKit.hoursPerSquare,
      membranePerSquare: membraneKit.membranePerSquare,
      weldHours: membraneKit.weldHours,
      weldFee: membraneKit.weldFee,
      hoursTearoffPerSquare: scopeKit.hoursPerSquare,
      dumpsterPerSquare: scopeKit.dumpsterPerSquare,
      extraHoursPerSquare: storyKit.extraHoursPerSquare,
    });
  }

  // JOB_PRESETS[0]: "40×30 garage, TPO 45 recover (the $650/square special)"
  // -- the job a flat $650/square special is named for.
  const garage = job(JOB_PRESETS[0]);
  assert.equal(garage.squares.toFixed(2), '12.00');
  assert.equal(garage.totalCost.toFixed(2), '4895.79');
  assert.equal(garage.price.toFixed(2), '6527.72');

  // JOB_PRESETS[1]: "80×50 commercial, TPO 80 tear-off, two polyiso,
  // parapet, drains, curbs".
  const commercial = job(JOB_PRESETS[1]);
  assert.equal(commercial.squares.toFixed(2), '40.04');
  assert.equal(commercial.totalCost.toFixed(2), '47934.71');
  assert.equal(commercial.price.toFixed(2), '63912.94');

  const flatGarage = garage.squares * 650;
  const flatCommercial = commercial.squares * 650;
  assert.equal(flatGarage.toFixed(2), '7800.00');
  assert.equal(flatCommercial.toFixed(2), '26026.00');

  assert.ok(flatGarage > garage.totalCost, 'the flat special should overcharge the garage relative to its own walk-away cost');
  assert.equal((flatGarage - garage.totalCost).toFixed(2), '2904.21');
  assert.equal((flatGarage - garage.price).toFixed(2), '1272.28');

  assert.ok(flatCommercial < commercial.totalCost, 'the flat special should undercut the commercial job\'s own walk-away cost');
  assert.equal((commercial.totalCost - flatCommercial).toFixed(2), '21908.71');
  assert.equal((commercial.price - flatCommercial).toFixed(2), '37886.94');

  assert.match(html, /\$4,895\.79/);
  assert.match(html, /\$6,527\.72/);
  assert.match(html, /\$47,934\.71/);
  assert.match(html, /\$63,912\.94/);
  assert.match(html, /\$7,800\.00/);
  assert.match(html, /\$26,026\.00/);
  assert.match(html, /\$2,904\.21/);
  assert.match(html, /\$1,272\.28/);
  assert.match(html, /\$21,908\.71/);
  assert.match(html, /\$37,886\.94/);
});
