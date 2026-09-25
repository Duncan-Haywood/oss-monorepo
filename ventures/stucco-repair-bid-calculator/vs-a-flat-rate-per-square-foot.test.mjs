import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid, suggestedSystemKit, suggestedAccessKit, JOB_PRESETS } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const DEFAULTS = {
  hoursPerCrackLf: 0.12, hoursPerDelamSf: 0.18, hoursPerWindowFlash: 1.5,
  hoursColorMatch: 2.5, hoursMoisture: 3, hoursPerCaulkLf: 0.04, siteHours: 2,
  mixPerCrackLf: 1.1, flashKitEach: 45, colorTintCost: 85, moistureKit: 40,
  caulkPerLf: 1.2, dumpsterCost: 175, permitFee: 75, hourlyWage: 38,
  burdenRate: 32, travelAndEquipment: 95, overheadRate: 16, targetMargin: 28,
};

function priceJob(job) {
  const kit = { ...suggestedSystemKit(job.system), ...suggestedAccessKit(job.stories) };
  return calculateBid({ ...job, ...DEFAULTS, ...kit });
}

test('the worked example prices match the shipped job presets', () => {
  const delamPatch = priceJob(JOB_PRESETS[1]);
  const eifsTearoff = priceJob(JOB_PRESETS[2]);

  assert.equal(delamPatch.repairSf, 80);
  assert.equal(delamPatch.totalCost.toFixed(2), '2195.99');
  assert.equal(delamPatch.price.toFixed(2), '3049.99');
  assert.equal(delamPatch.pricePerRepairSf.toFixed(2), '38.12');

  assert.equal(eifsTearoff.repairSf, 220);
  assert.equal(eifsTearoff.totalCost.toFixed(2), '8597.71');
  assert.equal(eifsTearoff.price.toFixed(2), '11941.26');
  assert.equal(eifsTearoff.pricePerRepairSf.toFixed(2), '54.28');

  const flatQuote = delamPatch.pricePerRepairSf * eifsTearoff.repairSf;
  assert.equal(flatQuote.toFixed(2), '8387.47');
  assert.equal((flatQuote - eifsTearoff.totalCost).toFixed(2), '-210.24');
  assert.equal((flatQuote - eifsTearoff.price).toFixed(2), '-3553.79');
});

test('a crack-only job has no square footage for a flat per-square-foot rate to apply to', () => {
  const brochureSpecial = priceJob(JOB_PRESETS[0]);
  assert.equal(brochureSpecial.repairSf, 0);
  assert.equal(brochureSpecial.pricePerRepairSf, null);
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not construction, engineering, moisture, legal, tax, or financial advice/);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-rate-per-square-foot\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-rate-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-stucco-repair\.html"/);
});

test('the comparison page never claims a network call or invokes the usage counter', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
  assert.doesNotMatch(html, /recordUsage/);
});
