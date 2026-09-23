import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-walk-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('names no vendor, marketplace app, or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat per-walk
  // rate), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest, the same discipline the sibling
  // vs-a-flat-per-vehicle-price.test.mjs and vs-a-flat-per-breed-price.test.mjs
  // tests use elsewhere in the fleet. vs-rover.html already carries this
  // venture's one named-product comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /Rover|Wag!?\b|TimeToPet|PetExec/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-per-walk-rate\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped defaults', async () => {
  const { calculate, DEFAULTS } = await import('./calc.mjs');

  const near = calculate({ ...DEFAULTS }); // 10 drive min, 4 mi round trip -- the shipped defaults
  assert.equal(near.baseCost.toFixed(2), '19.43');
  assert.equal(near.finalPrice.toFixed(2), '22.34');
  assert.equal(near.mileageCost.toFixed(2), '2.68');
  assert.equal(near.hoursBilled * 60, 40);
  assert.equal((20 - near.baseCost).toFixed(2), '0.57');
  assert.equal((20 / near.hoursBilled).toFixed(2), '30.00');

  const far = calculate({ ...DEFAULTS, driveMinutes: 25, mileage: 12 });
  assert.equal(far.baseCost.toFixed(2), '30.79');
  assert.equal(far.finalPrice.toFixed(2), '35.41');
  assert.equal(far.mileageCost.toFixed(2), '8.04');
  assert.equal(far.hoursBilled * 60, 55);
  assert.equal((20 - far.baseCost).toFixed(2), '-10.79');
  assert.equal((20 / far.hoursBilled).toFixed(2), '21.82');

  assert.ok((20 - far.baseCost) < 0, 'the flat rate should be a loss on the farther stop');
  assert.ok((20 - near.baseCost) > 0, 'the flat rate should still clear cost on the nearby stop');

  for (const figure of ['$2.68', '$8.04', '$19.43', '$30.79', '$0.57', '$22.34', '$35.41', '$30.00', '$21.82']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$10\.79|-\$10\.79/, 'the $10.79 loss on the farther stop is missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-walk-rate\.html"|href="vs-a-flat-per-walk-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-walk-rate\.html/);
});

test('the comparison page links back to the calculator and to the rate guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-for-a-dog-walk\.html"/);
});
