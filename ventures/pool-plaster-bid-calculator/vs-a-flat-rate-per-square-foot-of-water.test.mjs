import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calculateBid, JOB_PRESETS, suggestedFinishKit, suggestedChipoutKit } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot-of-water.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Same crew defaults index.html ships with, since JOB_PRESETS only carries
// the shell/finish/chip-out fields and leaves crew rates to the form.
const CREW_DEFAULTS = {
  hoursPerSpa: 6, hoursPerStep: 1.5, hoursPerTileLf: 0.18, hoursPerCopingLf: 0.22,
  hoursDrainRefill: 3.5, hoursAcidWash: 2.5, siteHours: 2,
  tilePerLf: 18, copingPerLf: 22, waterPerGallon: 0.012, acidWashChem: 85, permitFee: 125,
  stepSfEach: 12, hourlyWage: 36, burdenRate: 30, travelAndEquipment: 180, overheadRate: 15, targetMargin: 26,
};

function priceJob(job) {
  const finishKit = suggestedFinishKit(job.finish);
  const chipoutKit = suggestedChipoutKit(job.chipout);
  return calculateBid({ ...job, ...CREW_DEFAULTS, ...finishKit, ...chipoutKit });
}

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, accounting, engineering, or pool-construction advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor or competing product', () => {
  // Generic mental model (a flat $/sq ft-of-water rate), not a named
  // competitor -- distinct from this venture's own vs-buildxact.html, which
  // names Buildxact and carries its own "not affiliated" clause. Registered
  // as disclaimer-exempt in clauses.mjs on that basis.
  assert.doesNotMatch(html, /Buildxact/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-rate-per-square-foot-of-water\.html">/);
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
  const brochure = priceJob(JOB_PRESETS[0]);
  assert.equal(brochure.floorSf, 512);
  assert.equal(brochure.plasterSf, 1064);
  assert.equal(brochure.price.toFixed(2), '7825.99');
  assert.equal(brochure.pricePerWaterSf.toFixed(2), '15.29');

  const lossJob = priceJob(JOB_PRESETS[2]);
  assert.equal(lossJob.floorSf, 620);
  assert.equal(lossJob.plasterSf, 1275);
  assert.equal(lossJob.price.toFixed(2), '44057.94');
  assert.equal(lossJob.pricePerWaterSf.toFixed(2), '71.06');

  const naiveQuote = brochure.pricePerWaterSf * lossJob.floorSf;
  assert.equal(naiveQuote.toFixed(2), '9476.79');

  const shortfall = lossJob.price - naiveQuote;
  assert.equal(shortfall.toFixed(2), '34581.15');

  const naiveSharePercent = (naiveQuote / lossJob.price) * 100;
  assert.equal(naiveSharePercent.toFixed(1), '21.5');

  const rateRatio = lossJob.pricePerWaterSf / brochure.pricePerWaterSf;
  assert.equal(rateRatio.toFixed(1), '4.6');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-rate-per-square-foot-of-water\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot-of-water\.html/);
});

test('the comparison page links back to the calculator and to the guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-to-replaster-a-pool\.html"/);
});
