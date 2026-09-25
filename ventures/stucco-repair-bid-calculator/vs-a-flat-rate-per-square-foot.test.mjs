import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  calculateBid,
  JOB_PRESETS,
  suggestedSystemKit,
  suggestedAccessKit,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Same fixed defaults index.html ships with for the fields no suggested kit
// covers, since suggestedSystemKit/suggestedAccessKit only carry the
// system/story-derived fields.
const FIXED_DEFAULTS = {
  hoursPerCrackLf: 0.12, hoursPerDelamSf: 0.18, hoursPerWindowFlash: 1.5, hoursColorMatch: 2.5,
  hoursMoisture: 3, hoursPerCaulkLf: 0.04, siteHours: 2, mixPerCrackLf: 1.1, flashKitEach: 45,
  colorTintCost: 85, moistureKit: 40, caulkPerLf: 1.2, dumpsterCost: 175, permitFee: 75,
  hourlyWage: 38, burdenRate: 32, travelAndEquipment: 95, overheadRate: 16, targetMargin: 28,
};

function priceJob(job) {
  return calculateBid({
    ...job,
    ...FIXED_DEFAULTS,
    ...suggestedSystemKit(job.system),
    ...suggestedAccessKit(job.stories),
  });
}

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product', () => {
  // Generic mental model (a flat $/sq ft rate), not a named competitor --
  // distinct from this venture's own vs-jobber.html, which names Jobber
  // and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-rate-per-square-foot\.html">/);
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
    assert.ok(html.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match calc.mjs exactly', () => {
  const smallerJob = priceJob(JOB_PRESETS[1]);
  assert.equal(smallerJob.repairSf, 80);
  assert.equal(smallerJob.price.toFixed(2), '3049.99');
  assert.equal(smallerJob.pricePerRepairSf.toFixed(2), '38.12');

  const eifsJob = priceJob(JOB_PRESETS[2]);
  assert.equal(eifsJob.repairSf, 220);
  assert.equal(eifsJob.price.toFixed(2), '11941.26');
  assert.equal(eifsJob.pricePerRepairSf.toFixed(2), '54.28');

  const naiveQuote = smallerJob.pricePerRepairSf * eifsJob.repairSf;
  assert.equal(naiveQuote.toFixed(2), '8387.47');

  const shortfall = eifsJob.price - naiveQuote;
  assert.equal(shortfall.toFixed(2), '3553.79');

  const naiveSharePercent = (naiveQuote / eifsJob.price) * 100;
  assert.equal(naiveSharePercent.toFixed(1), '70.2');

  const rateRatio = eifsJob.pricePerRepairSf / smallerJob.pricePerRepairSf;
  assert.equal(rateRatio.toFixed(1), '1.4');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-rate-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-stucco-repair\.html"/);
});
