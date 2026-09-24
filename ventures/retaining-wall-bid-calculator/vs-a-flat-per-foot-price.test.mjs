import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-foot-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering/i);
});

test('carries the nothing-leaves-your-browser notice and the sponsors link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat per-foot
// rate), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-aspire.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Aspire|ServiceTitan|Jobber|Housecall|LMN/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-per-foot-price\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-per-foot-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-foot-price\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets, height factors, or
// defaults ever change, this page's numbers must be re-derived, not left
// stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and the form defaults', async () => {
  const {
    calculateBid,
    suggestedHeightFactor,
    WALL_TYPE_PRESETS,
    ENGINEER_PRESETS,
    WALL_PRESETS,
  } = await import('./calc.mjs');

  // Fields index.html ships as form defaults and that a wall/type/height/
  // engineer preset never overwrites -- only the fields listed in
  // SUGGESTED_FIELD_IDS get set from a preset. See index.html.
  const formDefaults = {
    capCostPerFoot: 8, hoursPerFaceSqFt: 0.1, hoursPerCorner: 1.5,
    stoneDepthFeet: 1, stoneCostPerCuYd: 55, drainPipeCostPerFoot: 4,
    geogridDepthFeet: 6, geogridCostPerSqYd: 4, drainHours: 2,
    hourlyWage: 38, burdenRate: 30, travelAndEquipment: 150,
    overheadRate: 15, targetMargin: 22,
  };

  function priceWall(presetIndex, wallTypeId, engineerId) {
    const wallPreset = WALL_PRESETS[presetIndex];
    const wallType = WALL_TYPE_PRESETS.find((item) => item.id === wallTypeId);
    const engineer = ENGINEER_PRESETS.find((item) => item.id === engineerId);
    return calculateBid({
      ...formDefaults,
      lengthFeet: wallPreset.lengthFeet,
      exposedHeightFeet: wallPreset.exposedHeightFeet,
      embedmentFeet: wallPreset.embedmentFeet,
      corners: wallPreset.corners,
      geogridLayers: wallPreset.geogridLayers,
      excavationHours: wallPreset.excavationHours,
      wallTypeFactor: wallType.factor,
      blockCostPerSf: wallType.blockCostPerSf,
      heightFactor: suggestedHeightFactor(wallPreset.exposedHeightFeet),
      engineerAndPermitFee: engineer.fee,
      proposedPrice: null,
    });
  }

  const FLAT_RATE_PER_FOOT = 65;
  const cheapest = priceWall(0, 'segmental', 'none');
  const taller = priceWall(1, 'segmental', 'permit');
  const engineered = priceWall(2, 'segmental', 'engineer');

  assert.equal(cheapest.price.toFixed(2), '5473.16');
  assert.equal(taller.price.toFixed(2), '7855.92');
  assert.equal(engineered.price.toFixed(2), '15594.04');

  const flatCheapest = FLAT_RATE_PER_FOOT * cheapest.lengthFeet;
  const flatTaller = FLAT_RATE_PER_FOOT * taller.lengthFeet;
  const flatEngineered = FLAT_RATE_PER_FOOT * engineered.lengthFeet;
  assert.equal(flatCheapest, 2600);
  assert.equal(flatTaller, 2600);
  assert.equal(flatEngineered, 3250);

  assert.match(html, /\$5,473\.16/);
  assert.match(html, /\$7,855\.92/);
  assert.match(html, /\$15,594\.04/);
  assert.match(html, /\$2,873\.16/);
  assert.match(html, /\$5,255\.92/);
  assert.match(html, /\$12,344\.04/);
});
