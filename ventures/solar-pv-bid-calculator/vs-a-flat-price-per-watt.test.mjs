import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-watt.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or electrical-code advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat $/W rate), not
// a named competitor, so it names no company and carries no affiliation
// disclaimer -- same reasoning as this venture's own vs-aurora-solar.html
// carrying one, since that page names a real product.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /affiliated/i);
  assert.doesNotMatch(html, /Aurora Solar/);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-price-per-watt\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-watt\.html"|href="vs-a-flat-price-per-watt\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-watt\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-install-solar-panels\.html"/);
});

// The worked-example table is this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, these numbers must be re-derived, not left stale. Mirrors the
// discipline vs-a-flat-1195-radon-special.test.mjs uses on the sibling
// venture.
test('the worked-example table figures match calc.mjs run against index.html\'s own form defaults', async () => {
  const { calculateBid } = await import('./calc.mjs');

  // index.html's own form defaults, held constant across all three jobs.
  const formDefaults = {
    moduleCostEach: 140, inverterCost: 1800, rackingPerModule: 45, bosPerWatt: 0.18,
    laborHoursPerKw: 10, hourlyWage: 38, burdenRate: 30, permitAndInterconnection: 850,
    designEngineering: 400, travelDumpsterLift: 250, overheadRate: 15, targetMargin: 20,
    proposedPrice: null,
  };

  // The rate's own job: default 26-module 390 W system, comp-easy roof
  // (factor 1.0), no electrical extras -- this calculator's own shipped
  // defaults on page load.
  const easyJob = calculateBid({
    ...formDefaults, moduleCount: 26, wattsPerModule: 390, roofFactor: 1.0,
    electricalHours: 0, electricalMaterial: 0, batteryHours: 0, batteryMaterial: 0,
  });
  // Same system size, tile roof (factor 1.45) plus a 100 A -> 200 A
  // main-panel upgrade (ELECTRICAL_PRESETS 'upgrade-200': 8 h, $1,800).
  const hardJob = calculateBid({
    ...formDefaults, moduleCount: 26, wattsPerModule: 390, roofFactor: 1.45,
    electricalHours: 8, electricalMaterial: 1800, batteryHours: 0, batteryMaterial: 0,
  });
  // Bigger system, ground mount (factor 1.4), a 200 A -> 400 A service
  // upgrade (ELECTRICAL_PRESETS 'upgrade-400': 16 h, $4,500), plus a battery.
  const biggerJob = calculateBid({
    ...formDefaults, moduleCount: 31, wattsPerModule: 390, roofFactor: 1.4,
    electricalHours: 16, electricalMaterial: 4500, batteryHours: 6, batteryMaterial: 9000,
  });

  assert.equal(easyJob.dcKw.toFixed(2), '10.14');
  assert.equal(easyJob.totalCost.toFixed(2), '17186.01');
  assert.equal(easyJob.price.toFixed(2), '21482.52');
  assert.equal(easyJob.pricePerWatt.toFixed(2), '2.12');

  assert.equal(hardJob.dcKw.toFixed(2), '10.14');
  assert.equal(hardJob.totalCost.toFixed(2), '22302.73');
  assert.equal(hardJob.price.toFixed(2), '27878.42');

  assert.equal(biggerJob.dcKw.toFixed(2), '12.09');
  assert.equal(biggerJob.totalCost.toFixed(2), '39283.36');
  assert.equal(biggerJob.price.toFixed(2), '49104.20');

  // The flat quote: the easy job's own $/W rate applied to each job's watts.
  const flatOnEasy = easyJob.pricePerWatt * easyJob.dcWatts;
  const flatOnHard = easyJob.pricePerWatt * hardJob.dcWatts;
  const flatOnBigger = easyJob.pricePerWatt * biggerJob.dcWatts;

  assert.equal(flatOnEasy.toFixed(2), '21482.52');
  assert.equal(flatOnHard.toFixed(2), '21482.52');
  assert.equal(flatOnBigger.toFixed(2), '25613.77');

  assert.equal((flatOnHard - hardJob.totalCost).toFixed(2), '-820.22');
  assert.equal((flatOnHard - hardJob.price).toFixed(2), '-6395.90');
  assert.equal((flatOnBigger - biggerJob.totalCost).toFixed(2), '-13669.59');
  assert.equal((flatOnBigger - biggerJob.price).toFixed(2), '-23490.43');

  assert.match(html, /\$2\.12\/W/);
  assert.match(html, /\$17,186\.01/);
  assert.match(html, /\$21,482\.52/);
  assert.match(html, /\$22,302\.73/);
  assert.match(html, /\$27,878\.42/);
  assert.match(html, /\$820\.22/);
  assert.match(html, /\$6,395\.90/);
  assert.match(html, /\$39,283\.36/);
  assert.match(html, /\$49,104\.20/);
  assert.match(html, /\$25,613\.77/);
  assert.match(html, /\$13,669\.59/);
  assert.match(html, /\$23,490\.43/);
});
