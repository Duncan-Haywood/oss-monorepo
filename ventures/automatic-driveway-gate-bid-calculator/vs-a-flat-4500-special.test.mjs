import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-4500-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat "$4,500
  // automatic gate" special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest. vs-jobber.html already carries this
  // venture's one named-product comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /Jobber|Workiz|Housecall Pro/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-4500-special\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped default shop rates and built-in job presets', async () => {
  const { calculateBid, suggestedStyleKit, suggestedColumnKit, suggestedPowerKit, JOB_PRESETS } = await import('./calc.mjs');

  // The shipped index.html default shop-cost fields: wage 42, burden 32%,
  // travel/equipment 285, overhead 16%, target margin 28%, permit 125.
  // Selecting a built-in job preset never overwrites these -- applyJob()
  // in index.html only sets style/column/power/material/loop/access fields.
  const shopDefaults = { hourlyWage: 42, burdenRate: 32, travelAndEquipment: 285, overheadRate: 16, targetMargin: 28, permitFee: 125 };

  function priceJob(preset) {
    const styleKit = suggestedStyleKit(preset.style);
    const columnKit = suggestedColumnKit(preset.columnType);
    const powerKit = suggestedPowerKit(preset.power);
    return calculateBid({ ...preset, ...styleKit, ...columnKit, ...powerKit, ...shopDefaults });
  }

  const cheap = priceJob(JOB_PRESETS[0]);
  assert.match(JOB_PRESETS[0].label, /cheap special/);
  assert.equal(cheap.totalCost.toFixed(2), '4684.02');
  assert.equal(cheap.price.toFixed(2), '6505.58');
  assert.equal(cheap.totalHours.toFixed(2), '12.95');
  assert.equal(cheap.materialCost.toFixed(2), '3035.00');
  assert.equal(cheap.operators, 1);
  assert.equal(cheap.columns, 0);
  assert.equal((4500 - cheap.totalCost).toFixed(2), '-184.02');
  assert.equal((4500 / cheap.totalHours).toFixed(2), '347.49');

  const hard = priceJob(JOB_PRESETS[1]);
  assert.match(JOB_PRESETS[1].label, /where the special loses/);
  assert.equal(hard.totalCost.toFixed(2), '14716.71');
  assert.equal(hard.price.toFixed(2), '20439.88');
  assert.equal(hard.totalHours.toFixed(2), '42.89');
  assert.equal(hard.materialCost.toFixed(2), '10024.00');
  assert.equal(hard.operators, 2);
  assert.equal(hard.columns, 3);
  assert.equal((4500 - hard.totalCost).toFixed(2), '-10216.71');
  assert.equal((4500 / hard.totalHours).toFixed(2), '104.92');

  assert.ok((4500 - cheap.totalCost) < 0, 'the flat $4,500 special should already be a loss on the cheapest job');
  assert.ok((4500 - hard.totalCost) < 0, 'the flat $4,500 special should be a much larger loss on the harder job');
  assert.equal((hard.price - cheap.price).toFixed(2), '13934.30');

  for (const figure of ['$4,684.02', '$6,505.58', '$3,035.00', '$14,716.71', '$20,439.88', '$10,024.00', '$347.49', '$104.92', '$13,934.30']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$184\.02|-\$184\.02/, 'the $184.02 shortfall on the cheap-end job is missing from the page');
  assert.match(html, /&minus;\$10,216\.71|-\$10,216\.71/, 'the $10,216.71 shortfall on the harder job is missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-4500-special\.html"|href="vs-a-flat-4500-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-4500-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-install-an-automatic-gate\.html"/);
});
