import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import {
  JOB_PRESETS,
  suggestedAreaSf,
  suggestedOpenBf,
  suggestedClosedBf,
  suggestedRimBf,
  suggestedWastePercent,
  suggestedOrderBf,
  suggestedCellKit,
  suggestedAccessKit,
  suggestedBarrierKit,
  calculateBid,
} from './calc.mjs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const DEFAULTS = {
  hoursTrip: 2.5,
  hoursRimPerLf: 0.09,
  siteHours: 0.8,
  barrierPerSf: 1.10,
  consumablesLump: 185,
  mobilizationFee: 275,
  permitFee: 185,
  hourlyWage: 32,
  burdenRate: 32,
  travelAndEquipment: 185,
  overheadRate: 15,
  targetMargin: 25,
};

function priceJob(job) {
  const plane = suggestedAreaSf(job.lengthFeet, job.widthFeet, job.area, job.pitch);
  const openBf = suggestedOpenBf(plane, job.thicknessInches, job.cell);
  const closedBf = suggestedClosedBf(plane, job.thicknessInches, job.cell);
  const rimBf = suggestedRimBf(job.rimLf, job.rimHeightInches, job.rimThicknessInches);
  const waste = suggestedWastePercent(job.cell);
  const orderOpenBf = suggestedOrderBf(openBf, waste);
  const orderClosedBf = suggestedOrderBf(closedBf + rimBf, waste);
  const cellKit = suggestedCellKit(job.cell);
  const accessKit = suggestedAccessKit(job.access);
  const barrierKit = suggestedBarrierKit(job.barrier);
  return calculateBid({
    ...job,
    areaSf: plane,
    openBf,
    closedBf,
    rimBf,
    wastePercent: waste,
    orderOpenBf,
    orderClosedBf,
    hoursPer1000Bf: cellKit.hoursPer1000Bf,
    foamPerBfOpen: cellKit.foamPerBfOpen,
    foamPerBfClosed: cellKit.foamPerBfClosed,
    hoursAccess: accessKit.extraHours,
    hoursBarrierPer100Sf: barrierKit.hoursPer100Sf,
    ...DEFAULTS,
  });
}

test('the worked example prices match the shipped job presets', () => {
  const attic = priceJob(JOB_PRESETS[0]);
  const cathedral = priceJob(JOB_PRESETS[2]);

  assert.equal(attic.areaSf, 1200);
  assert.equal(attic.price.toFixed(2), '10978.82');
  assert.equal(attic.pricePerAreaSf.toFixed(2), '9.15');
  assert.equal(attic.totalCost.toFixed(2), '8234.11');

  assert.equal(cathedral.areaSf.toFixed(2), '1609.92');
  assert.equal(cathedral.price.toFixed(2), '24397.19');
  assert.equal(cathedral.pricePerAreaSf.toFixed(2), '15.15');
  assert.equal(cathedral.totalCost.toFixed(2), '18297.90');

  const flatQuote = attic.pricePerAreaSf * cathedral.areaSf;
  assert.equal(flatQuote.toFixed(2), '14729.18');
  assert.equal((flatQuote - cathedral.totalCost).toFixed(2), '-3568.72');
  assert.equal((flatQuote - cathedral.price).toFixed(2), '-9668.01');
});

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not legal, tax, financial, engineering, or building-code advice/);
});

test('carries the licence and support paragraph', () => {
  assert.match(html, /Free and open source/);
  assert.match(html, /LICENSE/);
});

test('names no vendor or competing product', () => {
  assert.doesNotMatch(html, /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-price-per-square-foot\.html">/);
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
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-spray-foam-insulation\.html"/);
});
