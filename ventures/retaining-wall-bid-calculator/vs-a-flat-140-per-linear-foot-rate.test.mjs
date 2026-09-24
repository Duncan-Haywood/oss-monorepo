import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-140-per-linear-foot-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not an engineered wall design, a permit approval, or a geotechnical determination/);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat rate per
// linear foot), not a named competitor, so it names no company and carries
// no affiliation disclaimer -- unlike this venture's own vs-aspire.html,
// which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Aspire/i);
  assert.doesNotMatch(html, /ServiceTitan/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-140-per-linear-foot-rate\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-140-per-linear-foot-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-140-per-linear-foot-rate\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The worked-example rows are this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults or WALL_PRESETS
// ever change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped wall presets and the form defaults', async () => {
  const { calculateBid, suggestedHeightFactor, WALL_PRESETS } = await import('./calc.mjs');

  // index.html's own form defaults: blockCostPerSf, capCostPerFoot,
  // stoneCostPerCuYd, stoneDepthFeet, drainPipeCostPerFoot,
  // geogridCostPerSqYd, geogridDepthFeet, wallTypeFactor, hoursPerFaceSqFt,
  // hoursPerCorner, drainHours, and engineerAndPermitFee are never
  // overwritten by the wallPreset change handler (index.html only sets
  // lengthFeet, exposedHeightFeet, embedmentFeet, corners, geogridLayers,
  // excavationHours, and heightFactor from a preset), so every job below
  // uses the plain form defaults for the rest.
  const formDefaults = {
    blockCostPerSf: 12, capCostPerFoot: 8, stoneCostPerCuYd: 55, stoneDepthFeet: 1,
    drainPipeCostPerFoot: 4, geogridCostPerSqYd: 4, geogridDepthFeet: 6, wallTypeFactor: 1,
    hoursPerFaceSqFt: 0.1, hoursPerCorner: 1.5, drainHours: 2, engineerAndPermitFee: 0,
    hourlyWage: 38, burdenRate: 30, travelAndEquipment: 150, overheadRate: 15, targetMargin: 22,
  };

  function priceJob(preset) {
    return calculateBid({
      ...formDefaults,
      lengthFeet: preset.lengthFeet,
      exposedHeightFeet: preset.exposedHeightFeet,
      embedmentFeet: preset.embedmentFeet,
      heightFactor: suggestedHeightFactor(preset.exposedHeightFeet),
      corners: preset.corners,
      geogridLayers: preset.geogridLayers,
      excavationHours: preset.excavationHours,
      proposedPrice: null,
    });
  }

  const FLAT_RATE_PER_LF = 140;
  const garden = priceJob(WALL_PRESETS[0]); // 40 ft x 3 ft garden wall
  const firstGeogrid = priceJob(WALL_PRESETS[1]); // 40 ft x 4 ft, first geogrid layer
  const engineered = priceJob(WALL_PRESETS[2]); // 50 ft x 6 ft engineered
  const twoCorners = priceJob(WALL_PRESETS[3]); // 80 ft x 4 ft with two corners

  assert.equal(garden.totalCost.toFixed(2), '4269.06');
  assert.equal(garden.price.toFixed(2), '5473.16');
  assert.equal(firstGeogrid.totalCost.toFixed(2), '5840.12');
  assert.equal(firstGeogrid.price.toFixed(2), '7487.33');
  assert.equal(engineered.totalCost.toFixed(2), '10093.35');
  assert.equal(engineered.price.toFixed(2), '12940.20');
  assert.equal(twoCorners.totalCost.toFixed(2), '10996.45');
  assert.equal(twoCorners.price.toFixed(2), '14098.01');

  const flatOf = (preset) => preset.lengthFeet * FLAT_RATE_PER_LF;
  const marginPctOf = (job, preset) => ((flatOf(preset) - job.totalCost) / flatOf(preset)) * 100;

  assert.equal(flatOf(WALL_PRESETS[0]).toFixed(2), '5600.00');
  assert.equal(flatOf(WALL_PRESETS[1]).toFixed(2), '5600.00');
  assert.equal(flatOf(WALL_PRESETS[2]).toFixed(2), '7000.00');
  assert.equal(flatOf(WALL_PRESETS[3]).toFixed(2), '11200.00');

  assert.equal(marginPctOf(garden, WALL_PRESETS[0]).toFixed(1), '23.8');
  assert.equal(marginPctOf(firstGeogrid, WALL_PRESETS[1]).toFixed(1), '-4.3');
  assert.equal(marginPctOf(engineered, WALL_PRESETS[2]).toFixed(1), '-44.2');
  assert.equal(marginPctOf(twoCorners, WALL_PRESETS[3]).toFixed(1), '1.8');

  assert.equal((firstGeogrid.totalCost - flatOf(WALL_PRESETS[1])).toFixed(2), '240.12');
  assert.equal((engineered.totalCost - flatOf(WALL_PRESETS[2])).toFixed(2), '3093.35');
  assert.equal((flatOf(WALL_PRESETS[3]) - twoCorners.totalCost).toFixed(2), '203.55');

  assert.match(html, /\$5,600\.00/);
  assert.match(html, /\$4,269\.06/);
  assert.match(html, /\$5,473\.16/);
  assert.match(html, /23\.8%/);
  assert.match(html, /\$5,840\.12/);
  assert.match(html, /\$7,487\.33/);
  assert.match(html, /4\.3%/);
  assert.match(html, /\$240\.12/);
  assert.match(html, /\$7,000\.00/);
  assert.match(html, /\$10,093\.35/);
  assert.match(html, /\$12,940\.20/);
  assert.match(html, /44\.2%/);
  assert.match(html, /\$3,093\.35/);
  assert.match(html, /\$11,200\.00/);
  assert.match(html, /\$10,996\.45/);
  assert.match(html, /\$14,098\.01/);
  assert.match(html, /1\.8%/);
  assert.match(html, /\$203\.55/);
});
