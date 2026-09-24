import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-799-installed-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not plumbing, water-treatment, construction, legal, tax, or financial advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no other product, so it needs no trademark disclaimer', () => {
  // This page compares against a generic pricing method ("a flat $799
  // installed special"), not a named competitor -- same category as
  // patio-door-bid-calculator's vs-a-flat-installed-price.html. Distinct
  // from this venture's own vs-jobber.html, which names Jobber and
  // carries the nominative-fair-use disclaimer instead.
  assert.doesNotMatch(html, /not affiliated with/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/water-softener-bid-calculator\/vs-a-flat-799-installed-special\.html">/);
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

test('the worked examples agree with calc.mjs at the form defaults', async () => {
  const { calculateBid, JOB_PRESETS, suggestedCapacityKit, suggestedSystemKit, suggestedWorkKit, suggestedPipeKit } =
    await import('./calc.mjs');
  const common = {
    hourlyWage: 42,
    burdenRate: 32,
    travelAndEquipment: 85,
    overheadRate: 18,
    targetMargin: 35,
    hoursTrip: 0.5,
    siteHours: 0.4,
    bypassCost: 65,
    permitFee: 0,
    hoursHaulAway: 0.5,
    hoursElectrical: 0.75,
    haulFee: 45,
    electricalCost: 95,
    drainPerFoot: 1.4,
    hoursPerExtraDrainFoot: 0.04,
  };
  const expected = ['$1,317.56', '$2,601.00', '$4,968.05'];
  const presets = JOB_PRESETS.slice(0, 3);
  presets.forEach((preset, i) => {
    const kits = {
      ...suggestedCapacityKit(preset.capacity),
      ...suggestedSystemKit(preset.system),
      ...suggestedWorkKit(preset.work),
      ...suggestedPipeKit(preset.pipe),
    };
    const { price } = calculateBid({ ...common, ...preset, ...kits });
    const formatted = `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    assert.equal(formatted, expected[i], `preset ${i} ("${preset.label}") priced ${formatted}, page says ${expected[i]}`);
    assert.match(html, new RegExp(expected[i].replace(/[.$]/g, '\\$&')), `page is missing the price ${expected[i]} for preset ${i}`);
  });
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-799-installed-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-799-installed-special\.html/);
});

test('the comparison page links back to the calculator and to the how-much-to-charge article', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-to-install-a-water-softener\.html"/);
});
