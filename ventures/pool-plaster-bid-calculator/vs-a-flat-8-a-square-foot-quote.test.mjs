import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-8-a-square-foot-quote.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, engineering, pool, legal, tax, or financial advice/i);
});

test('carries the browser-privacy notice and the sponsors link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat rate per
// square foot of water surface), not a named competitor, so it names no
// company and carries no affiliation disclaimer -- unlike this venture's
// own vs-buildxact.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Buildxact/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-8-a-square-foot-quote\.html">/);
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
  assert.match(indexHtml, /href="vs-a-flat-8-a-square-foot-quote\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-8-a-square-foot-quote\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-replaster-a-pool\.html"/);
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});

// The worked-example rows are this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's defaults or JOB_PRESETS ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped job presets and the form defaults', async () => {
  const { calculateBid, suggestedFinishKit, suggestedChipoutKit, JOB_PRESETS } = await import('./calc.mjs');

  // index.html's own form defaults for every field a job preset does not
  // itself set (finish and chip-out rates come from the suggested kits).
  const formDefaults = {
    hoursPerSpa: 6, hoursPerStep: 1.5, hoursPerTileLf: 0.18, hoursPerCopingLf: 0.22,
    hoursDrainRefill: 3.5, hoursAcidWash: 2.5, siteHours: 2, tilePerLf: 18, copingPerLf: 22,
    waterPerGallon: 0.012, acidWashChem: 85, permitFee: 125, stepSfEach: 12,
    hourlyWage: 36, burdenRate: 30, travelAndEquipment: 180, overheadRate: 15, targetMargin: 26,
  };

  function priceJob(preset) {
    const finishKit = suggestedFinishKit(preset.finish);
    const chipoutKit = suggestedChipoutKit(preset.chipout);
    return calculateBid({
      ...formDefaults,
      ...finishKit,
      hoursPerChipoutSf: chipoutKit.hoursPerChipoutSf,
      dumpsterCost: chipoutKit.dumpsterCost,
      shape: preset.shape,
      finish: preset.finish,
      chipout: preset.chipout,
      lengthFt: preset.lengthFt,
      widthFt: preset.widthFt,
      shallowFt: preset.shallowFt,
      deepFt: preset.deepFt,
      waterSurfaceSf: preset.waterSurfaceSf,
      freeformMultiplier: preset.freeformMultiplier,
      chipoutSf: preset.chipoutSf,
      spaSf: preset.spaSf,
      stepBenches: preset.stepBenches,
      waterlineTileLf: preset.waterlineTileLf,
      copingLf: preset.copingLf,
      drainRefill: preset.drainRefill,
      acidWash: preset.acidWash,
    });
  }

  const FLAT_RATE_PER_SF = 8;
  const brochure = priceJob(JOB_PRESETS[0]); // 16x32 rectangle, white plaster, no chip-out
  const quartzTile = priceJob(JOB_PRESETS[1]); // 18x36 rectangle, quartz, partial chip-out, tile
  const lossJob = priceJob(JOB_PRESETS[2]); // freeform pebble, full chip-out, spa, tile, coping
  const glassBead = priceJob(JOB_PRESETS[3]); // 20x40 rectangle, glass bead, full chip-out, spa, coping

  assert.equal(brochure.floorSf, 512);
  assert.equal(quartzTile.floorSf, 648);
  assert.equal(lossJob.floorSf, 620);
  assert.equal(glassBead.floorSf, 800);

  assert.equal(brochure.totalCost.toFixed(2), '5791.23');
  assert.equal(brochure.price.toFixed(2), '7825.99');
  assert.equal(quartzTile.totalCost.toFixed(2), '13704.56');
  assert.equal(quartzTile.price.toFixed(2), '18519.68');
  assert.equal(lossJob.totalCost.toFixed(2), '32602.87');
  assert.equal(lossJob.price.toFixed(2), '44057.94');
  assert.equal(glassBead.totalCost.toFixed(2), '43454.06');
  assert.equal(glassBead.price.toFixed(2), '58721.70');

  const flatOf = (job) => job.floorSf * FLAT_RATE_PER_SF;
  const marginPctOf = (job) => ((flatOf(job) - job.totalCost) / flatOf(job)) * 100;
  const shortfallOf = (job) => job.totalCost - flatOf(job);

  assert.equal(flatOf(brochure).toFixed(2), '4096.00');
  assert.equal(flatOf(quartzTile).toFixed(2), '5184.00');
  assert.equal(flatOf(lossJob).toFixed(2), '4960.00');
  assert.equal(flatOf(glassBead).toFixed(2), '6400.00');

  assert.equal(marginPctOf(brochure).toFixed(1), '-41.4');
  assert.equal(marginPctOf(quartzTile).toFixed(1), '-164.4');
  assert.equal(marginPctOf(lossJob).toFixed(1), '-557.3');
  assert.equal(marginPctOf(glassBead).toFixed(1), '-579.0');

  assert.equal(shortfallOf(brochure).toFixed(2), '1695.23');
  assert.equal(shortfallOf(quartzTile).toFixed(2), '8520.56');
  assert.equal(shortfallOf(lossJob).toFixed(2), '27642.87');
  assert.equal(shortfallOf(glassBead).toFixed(2), '37054.06');

  assert.match(html, /\$4,096\.00/);
  assert.match(html, /\$5,791\.23/);
  assert.match(html, /\$7,825\.99/);
  assert.match(html, /41\.4%/);
  assert.match(html, /\$1,695\.23/);
  assert.match(html, /\$5,184\.00/);
  assert.match(html, /\$13,704\.56/);
  assert.match(html, /\$18,519\.68/);
  assert.match(html, /164\.4%/);
  assert.match(html, /\$8,520\.56/);
  assert.match(html, /\$4,960\.00/);
  assert.match(html, /\$32,602\.87/);
  assert.match(html, /\$44,057\.94/);
  assert.match(html, /557\.3%/);
  assert.match(html, /\$27,642\.87/);
  assert.match(html, /\$6,400\.00/);
  assert.match(html, /\$43,454\.06/);
  assert.match(html, /\$58,721\.70/);
  assert.match(html, /579\.0%/);
  assert.match(html, /\$37,054\.06/);
});
