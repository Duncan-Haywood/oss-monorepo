import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  calculateBid,
  JOB_PRESETS,
  suggestedMembraneKit,
  suggestedScopeKit,
  suggestedStoryKit,
  suggestedSlopeMultiplier,
  suggestedRoofSf,
  suggestedSquares,
  suggestedParapetWastePct,
  suggestedMembraneSquares,
  suggestedTearOffSquares,
  suggestedInsulationSquares,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-650-per-square-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no vendor -- this is the generic-method exemption clauses.mjs grants it', () => {
  // Distinct from this venture's own vs-acculynx.html, which does name a
  // product and carries its own "not affiliated" clause. This page compares
  // against a pricing pattern (a flat $650-a-square special), not a company.
  assert.doesNotMatch(html, /AccuLynx/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-650-per-square-special\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-650-per-square-special\.html"|href="vs-a-flat-650-per-square-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-650-per-square-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-a-flat-roof\.html"/);
});

// Shipped cost-rate defaults from index.html that job presets never
// overwrite (only membrane/scope/slope/stories/geometry kits do -- see
// index.html's KIT_IDS and applyJobPreset handler).
const SHIPPED_DEFAULTS = {
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
  fastenerLump: 160,
  mobilizationFee: 350,
  permitFee: 425,
  hourlyWage: 36,
  burdenRate: 32,
  travelAndEquipment: 160,
  overheadRate: 15,
  targetMargin: 25,
  proposedPrice: null,
};

// Reproduces exactly what index.html's applyJobPreset + applyMembraneKit +
// applyScopeKit + applyStoryKit + applyGeometryKits does when a visitor
// picks a JOB_PRESETS entry from "Starting job" on a fresh page load (no
// field edited yet, so every KIT_IDS field is still kit-derived).
function priceOfPreset(preset) {
  const membraneKit = suggestedMembraneKit(preset.membrane);
  const scopeKit = suggestedScopeKit(preset.scope);
  const storyKit = suggestedStoryKit(preset.stories);
  const slopeMultiplier = suggestedSlopeMultiplier(preset.slope);
  const roofSf = suggestedRoofSf(preset.lengthFeet, preset.widthFeet, preset.slope);
  const squares = suggestedSquares(preset.lengthFeet, preset.widthFeet, preset.slope);
  const parapetWastePct = suggestedParapetWastePct(preset.parapetLf);
  const wastePct = membraneKit.wastePct;
  const membraneSquares = suggestedMembraneSquares(squares, wastePct, parapetWastePct);
  const tearOffSquares = suggestedTearOffSquares(squares, preset.scope);
  const insulationSquares = suggestedInsulationSquares(squares, preset.insulationLayers);

  const input = {
    ...SHIPPED_DEFAULTS,
    membrane: preset.membrane,
    scope: preset.scope,
    slope: preset.slope,
    stories: preset.stories,
    lengthFeet: preset.lengthFeet,
    widthFeet: preset.widthFeet,
    parapetLf: preset.parapetLf,
    drainCount: preset.drainCount,
    curbCount: preset.curbCount,
    walkPadSquares: preset.walkPadSquares,
    insulationLayers: preset.insulationLayers,
    includeCoverBoard: preset.includeCoverBoard,
    includePermit: preset.includePermit,
    slopeMultiplier,
    roofSf,
    squares,
    wastePct,
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
  };
  return calculateBid(input);
}

test('the garage recover worked example (JOB_PRESETS[0], the $650/square special\'s own job) matches calc.mjs', () => {
  const preset = JOB_PRESETS[0];
  assert.match(preset.label, /\$650\/square special/);
  const r = priceOfPreset(preset);
  assert.equal(r.squares, 12);
  assert.equal(r.totalHours.toFixed(1), '23.5');
  assert.equal(r.price.toFixed(2), '6527.72');
  assert.equal(r.pricePerSquare.toFixed(2), '543.98');
  assert.match(html, /\$6,527\.72/);
  assert.match(html, /\$543\.98/);
  assert.match(html, /23\.5 crew-hours/);
});

test('the commercial tear-off worked example (JOB_PRESETS[1]) matches calc.mjs and undercuts break-even at the flat rate', () => {
  const preset = JOB_PRESETS[1];
  const r = priceOfPreset(preset);
  assert.equal(r.squares.toFixed(2), '40.04');
  assert.equal(r.totalHours.toFixed(1), '245.3');
  assert.equal(r.totalCost.toFixed(2), '47934.71');
  assert.equal(r.price.toFixed(2), '63912.94');

  const flatRatePerSquare = 650;
  const flatPrice = flatRatePerSquare * r.squares;
  assert.equal(flatPrice.toFixed(2), '26026.00');
  assert.ok(flatPrice < r.totalCost, 'the flat $650/square rate should quote below this job\'s own break-even cost');
  assert.equal((r.totalCost - flatPrice).toFixed(2), '21908.71');
  assert.equal((r.price - flatPrice).toFixed(2), '37886.94');

  assert.match(html, /40\.04-square/);
  assert.match(html, /245\.3 crew-hours/);
  assert.match(html, /\$47,934\.71/);
  assert.match(html, /\$63,912\.94/);
  assert.match(html, /\$26,026\.00/);
  assert.match(html, /\$21,908\.71/);
  assert.match(html, /\$37,886\.94/);
});
