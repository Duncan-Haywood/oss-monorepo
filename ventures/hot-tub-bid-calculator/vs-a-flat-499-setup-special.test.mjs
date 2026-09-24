import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-499-setup-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not electrical, construction, legal, tax, or financial advice/i);
});

// This page compares against a generic pricing method (a flat setup
// special), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-jobber.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Jobber/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-499-setup-special\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-499-setup-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-499-setup-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, this page's numbers must be re-derived, not left stale. Spa unit
// cost is set to zero to match the flat special's own scope (delivery and
// setup only, not the spa hardware) -- the README says as much.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const {
    calculateBid,
    suggestedSizeKit,
    suggestedAccessKit,
    suggestedPowerKit,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  const rates = {
    hoursTrip: 1.5, hoursPerCircuitFoot: 0.06, siteHours: 0.5,
    unitCost: 0, craneFee: 850, circuitKit: 220, circuitPerFoot: 9.5,
    padCost: 980, haulFee: 185, coverLiftCost: 420, stepsCost: 160, gasCost: 380, permitFee: 165,
    hourlyWage: 48, burdenRate: 34, travelAndEquipment: 145, overheadRate: 18, targetMargin: 32,
  };
  const flatRate = 499;

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...rates,
      ...suggestedSizeKit(preset.size),
      ...suggestedAccessKit(preset.access),
      ...suggestedPowerKit(preset.power),
    });
  }

  const [compact, midGate, large] = JOB_PRESETS.map(priceJob);

  assert.equal(compact.totalCost.toFixed(2), '707.34');
  assert.equal(midGate.totalCost.toFixed(2), '2209.52');
  assert.equal(large.totalCost.toFixed(2), '5544.10');

  assert.match(html, /\$499\.00/);
  assert.match(html, /\$707\.34/);
  assert.match(html, /\$2,209\.52/);
  assert.match(html, /\$5,544\.10/);
  assert.match(html, new RegExp(`\\$${(compact.totalCost - flatRate).toFixed(2).replace('.', '\\.')}`));
});
