import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not stone, construction, legal, tax, or financial advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

// This page compares against a generic pricing method (a flat price per
// finished square foot), not a named competitor, so it names no company and
// carries no affiliation disclaimer -- unlike this venture's own
// vs-moraware.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /Moraware|CounterGo|Systemize/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/countertop-bid-calculator\/vs-a-flat-price-per-square-foot\.html">/);
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

// The JSON-LD text and the visible prose must read as the same string once
// HTML entities are decoded, or faq-visible.test.mjs's punctuation-diff
// check fails the build -- pin it here too so a future edit to one side
// alone is caught locally.
test('the FAQPage JSON-LD answers are verbatim on the page (entities decoded)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const decoded = html.replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’').replace(/&times;/g, '×').replace(/&amp;/g, '&');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(decoded.includes(answer), `answer for "${question.name}" is not verbatim in the visible page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-square-foot\.html"|href="vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-to-install-quartz-countertops\.html"/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's job presets or defaults ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped job presets and shop-rate defaults', async () => {
  const {
    calculateBid,
    JOB_PRESETS,
    suggestedWastePct,
    suggestedEdgeHours,
    suggestedSinkHours,
    suggestedSlab,
  } = await import('./calc.mjs');

  // The form's own shipped shop-rate defaults (index.html), not numbers
  // invented for this page.
  const rates = {
    fieldHoursPer100: 2.5,
    installHoursPer100: 3,
    hoursPerCooktop: 1.5,
    hoursPerFaucet: 0.12,
    hoursPerWaterfall: 3,
    hoursPerBacksplashLf: 0.22,
    hoursPerSeam: 1.25,
    suppliesPerSqFt: 4,
    hourlyWage: 38,
    burdenRate: 30,
    travelAndEquipment: 165,
    overheadRate: 15,
    targetMargin: 25,
  };

  function runFromPreset(job) {
    const slab = suggestedSlab(job.materialId);
    return calculateBid({
      ...rates,
      finishedSqFt: job.finishedSqFt,
      perimeterLf: job.perimeterLf,
      wastePct: suggestedWastePct(job.layoutId),
      slabSqFt: slab.slabSqFt,
      slabCost: slab.slabCost,
      sinkCount: job.sinkCount,
      hoursPerSink: suggestedSinkHours(job.sinkId),
      cooktopCount: job.cooktopCount,
      faucetHoles: job.faucetHoles,
      waterfallEnds: job.waterfallEnds,
      edgeHoursPerLf: suggestedEdgeHours(job.edgeId),
      backsplashLf: job.backsplashLf,
      backsplashHeightIn: job.backsplashHeightIn,
      seams: job.seams,
      templateHours: job.templateHours,
      tearoutHours: job.tearoutHours,
    });
  }

  const galley = runFromPreset(JOB_PRESETS.find((job) => job.label === '40 sq ft galley, drop-in, eased'));
  // The calculator's own shipped index.html default: 55 sq ft L-kitchen,
  // undermount + cooktop, ogee.
  const defaultJob = runFromPreset(
    JOB_PRESETS.find((job) => job.label === '55 sq ft L-kitchen, undermount + cooktop, ogee'),
  );
  const slabTrap = runFromPreset(
    JOB_PRESETS.find((job) => job.label === '28 sq ft island with two waterfalls (the slab trap)'),
  );

  assert.equal(galley.totalCost.toFixed(2), '1787.55');
  assert.equal(defaultJob.totalCost.toFixed(2), '3839.07');
  assert.equal(slabTrap.totalCost.toFixed(2), '3447.95');

  assert.match(html, /\$1,787\.55/);
  assert.match(html, /\$3,839\.07/);
  assert.match(html, /\$3,447\.95/);

  // The $60/sq ft flat rate is this page's own headline anchor, applied to
  // each job's finished square footage.
  assert.match(html, /\$2,400\.00/);
  assert.match(html, /\$3,300\.00/);
  assert.match(html, /\$1,680\.00/);
  assert.match(html, /\$612\.45/);
  assert.match(html, /\$539\.07/);
  assert.match(html, /\$1,767\.95/);
});
