import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { calculateBid, suggestedMethodKit, suggestedAccessKit, suggestedMortarKit, suggestedExtraKit, JOB_PRESETS } from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const DEFAULTS = { hourlyWage: 32, burdenRate: 30, travelAndEquipment: 95, otherCost: 0, overheadRate: 15, targetMargin: 20 };

function priceJob(job) {
  const kit = {
    ...suggestedMethodKit(job.method),
    ...suggestedAccessKit(job.access),
    ...suggestedMortarKit(job.mortar),
    ...suggestedExtraKit(),
  };
  return calculateBid({ ...job, ...kit, ...DEFAULTS });
}

test('the worked example prices match the shipped job presets', () => {
  const smear = priceJob(JOB_PRESETS[0]);
  const historic = priceJob(JOB_PRESETS[2]);

  assert.equal(smear.areaSqFt, 320);
  assert.equal(smear.price.toFixed(2), '1688.88');
  assert.equal(smear.pricePerSqFt.toFixed(2), '5.28');
  assert.equal(smear.totalCost.toFixed(2), '1351.10');

  assert.equal(historic.areaSqFt, 1008);
  assert.equal(historic.price.toFixed(2), '22150.03');
  assert.equal(historic.pricePerSqFt.toFixed(2), '21.97');
  assert.equal(historic.totalCost.toFixed(2), '17720.03');

  const flatQuote = smear.pricePerSqFt * historic.areaSqFt;
  assert.equal(flatQuote.toFixed(2), '5319.97');
  assert.equal((flatQuote - historic.totalCost).toFixed(2), '-12400.06');
  assert.equal((flatQuote - historic.price).toFixed(2), '-16830.07');
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, structural, or historic-preservation advice/);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /QuoteIQ/);
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
  assert.match(html, /href="how-much-to-charge-for-tuckpointing\.html"/);
});
