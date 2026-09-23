import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest, the same discipline the sibling
  // artificial-turf-bid-calculator/vs-a-flat-rate-per-square-foot.test.mjs
  // uses. vs-joist.html already carries this venture's one named-product
  // comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /Joist|Jobber|ServiceTitan/i);
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

test('the worked-example figures match calc.mjs on the shipped presets and shipped shop rates', async () => {
  const { calculateBid, suggestedPrepKit, suggestedFinishKit, suggestedAccessKit, JOB_PRESETS } = await import('./calc.mjs');

  // The shipped index.html shop-cost fields that a job preset never
  // overwrites -- applyJob() only sets prep/finish/access/deckSqFt/
  // railLinealFeet/stairRuns/moveFurniture.
  const shopDefaults = {
    hoursTrip: 1.1, siteHours: 0.3, hoursFurniture: 1.4,
    railSfPerLf: 9, stairSf: 40, furnitureFee: 45, mobilizationFee: 85, permitFee: 0,
    hourlyWage: 38, burdenRate: 30, travelAndEquipment: 75, overheadRate: 15, targetMargin: 28,
  };

  function priceJob(preset) {
    return calculateBid({
      ...preset,
      ...suggestedPrepKit(preset.prep),
      ...suggestedFinishKit(preset.finish),
      ...suggestedAccessKit(preset.access),
      ...shopDefaults,
    });
  }

  const cheap = JOB_PRESETS[0];
  assert.match(cheap.label, /the \$2\.50\/sf special/);
  const bidCheap = priceJob(cheap);
  assert.equal(bidCheap.totalCost.toFixed(2), '454.95');
  assert.equal(bidCheap.price.toFixed(2), '631.88');
  assert.equal(bidCheap.stainableSf, 200);

  const hard = JOB_PRESETS[2];
  assert.match(hard.label, /400 sf, 80 lf picket, 2 stairs/);
  const bidHard = priceJob(hard);
  assert.equal(bidHard.totalCost.toFixed(2), '4815.51');
  assert.equal(bidHard.price.toFixed(2), '6688.21');
  assert.equal(bidHard.stainableSf, 1200);

  const flatRatePerSf = 2.5;
  const flatCheap = cheap.deckSqFt * flatRatePerSf;
  const flatHard = hard.deckSqFt * flatRatePerSf;
  assert.equal(flatCheap.toFixed(2), '500.00');
  assert.equal(flatHard.toFixed(2), '1000.00');

  assert.ok(flatCheap > bidCheap.totalCost, 'the flat rate should still clear cost on the job it was built for');
  assert.equal((flatCheap - bidCheap.totalCost).toFixed(2), '45.05');
  assert.equal((bidCheap.price - flatCheap).toFixed(2), '131.88');

  assert.ok(flatHard < bidHard.totalCost, 'the flat rate should quote below the harder job\'s own break-even cost');
  assert.equal((bidHard.totalCost - flatHard).toFixed(2), '3815.51');
  assert.equal((bidHard.price - flatHard).toFixed(2), '5688.21');

  for (const figure of ['$454.95', '$631.88', '$500.00', '$45.05', '$131.88', '$4,815.51', '$6,688.21', '$1,000.00', '$3,815.51', '$5,688.21']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-per-square-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-stain-a-deck\.html"/);
});
