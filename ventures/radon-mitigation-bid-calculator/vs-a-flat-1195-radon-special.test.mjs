import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-1195-radon-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not radon, environmental, construction, health, legal, tax, or financial advice/);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat special), not
// a named competitor, so it names no company and carries no affiliation
// disclaimer.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /affiliated/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-1195-radon-special\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-1195-radon-special\.html"|href="vs-a-flat-1195-radon-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-1195-radon-special\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The worked-example rows are this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's suggested defaults or
// JOB_PRESETS ever change, this page's numbers must be re-derived, not
// left stale.
test('the worked-example table figures match calc.mjs run against the shipped job presets and index.html form defaults', async () => {
  const {
    calculateBid,
    suggestedFoundationHours,
    suggestedFan,
    JOB_PRESETS,
  } = await import('./calc.mjs');

  // index.html's own form defaults for every field a preset never touches
  // (foundation/fan pick hoursBaseSystem, fanCost, hoursHighSuctionFan via
  // the suggested*Fields functions).
  const formDefaults = {
    includedFootprint: 1200, includedSuctionPoints: 1,
    hoursPerExtra100SqFt: 0.2, hoursPerExtraSuction: 2.5,
    hoursCrawlMembrane: 4, hoursRoofDischarge: 1.5, hoursNewCircuit: 2,
    hoursPostTest: 0.75, hoursPermit: 0.5, hoursPerFirestop: 0.75, siteHours: 1,
    pipeAndSealCost: 145, extraSuctionMaterial: 95, membranePerSqFt: 0.45,
    circuitCost: 185, testKitCost: 45, permitFee: 85, firestopCostEach: 35,
    hourlyWage: 42, burdenRate: 34, travelAndEquipment: 85, overheadRate: 16, targetMargin: 28,
  };

  function priceJob(job) {
    const foundationKit = suggestedFoundationHours(job.foundation);
    const fanKit = suggestedFan(job.fan);
    return calculateBid({
      ...formDefaults,
      foundation: job.foundation,
      footprintSqFt: job.footprintSqFt,
      suctionPoints: job.suctionPoints,
      fan: job.fan,
      discharge: job.discharge,
      crawlMembrane: job.crawlMembrane,
      membraneSqFt: job.membraneSqFt,
      newCircuit: job.newCircuit,
      postTest: job.postTest,
      permit: job.permit,
      firestopCount: job.firestopCount,
      hoursBaseSystem: foundationKit.hoursBaseSystem,
      fanCost: fanKit.fanCost,
      hoursHighSuctionFan: fanKit.hoursHighSuctionFan,
    });
  }

  const FLAT_SPECIAL = 1195;
  const brochureJob = priceJob(JOB_PRESETS[0]); // 1,200 sq ft basement, 1 suction, standard fan, sidewall
  const roofTestJob = priceJob(JOB_PRESETS[1]); // 1,800 sq ft basement, roof stack, post-test
  const slabJob = priceJob(JOB_PRESETS[3]); // 2,000 sq ft slab, 2 suctions, high-suction fan, roof, circuit, firestops, test
  const mixedJob = priceJob(JOB_PRESETS[2]); // 2,400 sq ft mixed slab + crawl, 2 suctions, high-suction fan, membrane, circuit, test, permit

  assert.equal(brochureJob.totalCost.toFixed(2), '807.82');
  assert.equal(brochureJob.price.toFixed(2), '1121.98');
  assert.equal(roofTestJob.totalCost.toFixed(2), '1085.26');
  assert.equal(roofTestJob.price.toFixed(2), '1507.30');
  assert.equal(slabJob.totalCost.toFixed(2), '2196.25');
  assert.equal(slabJob.price.toFixed(2), '3050.35');
  assert.equal(mixedJob.totalCost.toFixed(2), '3025.82');
  assert.equal(mixedJob.price.toFixed(2), '4202.52');

  const marginVsCost = (job) => (FLAT_SPECIAL - job.totalCost).toFixed(2);
  assert.equal(marginVsCost(brochureJob), '387.18');
  assert.equal(marginVsCost(roofTestJob), '109.74');
  assert.equal(marginVsCost(slabJob), '-1001.25');
  assert.equal(marginVsCost(mixedJob), '-1830.82');

  assert.match(html, /\$1,195\.00/);
  assert.match(html, /\$807\.82/);
  assert.match(html, /\$1,121\.98/);
  assert.match(html, /\$387\.18/);
  assert.match(html, /\$1,085\.26/);
  assert.match(html, /\$1,507\.30/);
  assert.match(html, /\$109\.74/);
  assert.match(html, /\$2,196\.25/);
  assert.match(html, /\$3,050\.35/);
  assert.match(html, /\$1,001\.25/);
  assert.match(html, /\$3,025\.82/);
  assert.match(html, /\$4,202\.52/);
  assert.match(html, /\$1,830\.82/);
});
