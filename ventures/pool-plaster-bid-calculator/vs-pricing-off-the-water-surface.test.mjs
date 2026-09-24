import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-pricing-off-the-water-surface.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat per-square-foot
// water-surface rate), not a named competitor, so it names no company and
// carries no affiliation disclaimer -- unlike vs-buildxact.html, which does.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Buildxact/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-pricing-off-the-water-surface\.html">/);
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
  assert.match(indexHtml, /href="vs-pricing-off-the-water-surface\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-pricing-off-the-water-surface\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults, kits, or presets
// ever change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and the form defaults', async () => {
  const { calculateBid, suggestedFinishKit, suggestedChipoutKit, JOB_PRESETS } = await import('./calc.mjs');

  // The rates and extra-work fields that index.html ships as form defaults
  // and that applyJob() never overwrites when a preset is picked -- only
  // the finish-kit and chipout-kit fields (finishPerSf, hoursPerPlasterSf,
  // hoursPerChipoutSf, dumpsterCost) are overwritten. See index.html's
  // applyJob()/applyFinishKit()/applyChipoutKit().
  const formDefaults = {
    hoursPerSpa: 6, hoursPerStep: 1.5, hoursPerTileLf: 0.18, hoursPerCopingLf: 0.22,
    hoursDrainRefill: 3.5, hoursAcidWash: 2.5, siteHours: 2,
    tilePerLf: 18, copingPerLf: 22, waterPerGallon: 0.012, acidWashChem: 85,
    permitFee: 125, stepSfEach: 12,
    hourlyWage: 36, burdenRate: 30, travelAndEquipment: 180, overheadRate: 15, targetMargin: 26,
  };

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...formDefaults,
      ...suggestedFinishKit(preset.finish),
      ...suggestedChipoutKit(preset.chipout),
    });
  }

  // The flat quote this page compares against: $8 per square foot of water
  // surface (length x width for a rectangle, or the entered water-surface
  // figure for a freeform shape) -- the exact habit calc.mjs's own top-of-file
  // comment names as the one the trade loses money on.
  const FLAT_RATE_PER_WATER_SF = 8;

  const brochure = priceJob(JOB_PRESETS[0]);
  const mid = priceJob(JOB_PRESETS[1]);
  const lossJob = priceJob(JOB_PRESETS[2]);

  assert.equal(brochure.price.toFixed(2), '7825.99');
  assert.equal(mid.price.toFixed(2), '18519.68');
  assert.equal(lossJob.price.toFixed(2), '44057.94');

  const brochureFlat = FLAT_RATE_PER_WATER_SF * brochure.floorSf;
  const midFlat = FLAT_RATE_PER_WATER_SF * mid.floorSf;
  const lossJobFlat = FLAT_RATE_PER_WATER_SF * lossJob.floorSf;

  assert.equal(brochureFlat.toFixed(2), '4096.00');
  assert.equal(midFlat.toFixed(2), '5184.00');
  assert.equal(lossJobFlat.toFixed(2), '4960.00');

  assert.equal((brochure.price - brochureFlat).toFixed(2), '3729.99');
  assert.equal((mid.price - midFlat).toFixed(2), '13335.68');
  assert.equal((lossJob.price - lossJobFlat).toFixed(2), '39097.94');

  assert.match(html, /\$7,825\.99/);
  assert.match(html, /\$18,519\.68/);
  assert.match(html, /\$44,057\.94/);
  assert.match(html, /\$4,096\.00/);
  assert.match(html, /\$5,184\.00/);
  assert.match(html, /\$4,960\.00/);
  assert.match(html, /\$3,729\.99/);
  assert.match(html, /\$13,335\.68/);
  assert.match(html, /\$39,097\.94/);
});
