import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-8-per-stall-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a MUTCD plan, an ADA determination, a traffic-engineering stamp/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // stall), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling
  // mini-split-bid-calculator's vs-a-flat-2800-per-head-quote.test.mjs.
  assert.doesNotMatch(html, /SaaSphalt|ServiceTitan|Jobber|ServiceMonster|Angi|HomeAdvisor/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-8-per-stall-special\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped presets', async () => {
  const { calculateBid, suggestedKit, JOB_PRESETS } = await import('./calc.mjs');

  const rates = {
    hourlyWage: 28, burdenRate: 28, overheadRate: 15, targetMargin: 25, otherCost: 0,
  };

  function fullInput(preset) {
    return { ...rates, ...preset, ...suggestedKit(preset.layout) };
  }

  // JOB_PRESETS[0] is the 50-stall retail restripe -- the "cheap special"
  // job a flat per-stall rate is built on. JOB_PRESETS[2] is the 120-stall
  // new layout with 6 ADA stalls, 24 arrows, 2 crosswalks, a fire lane,
  // two coats, and night work -- the shipped "where the special loses"
  // preset.
  const easy = calculateBid(fullInput(JOB_PRESETS[0]));
  assert.equal(easy.price.toFixed(2), '1126.98');
  assert.equal(easy.breakEvenPrice.toFixed(2), '845.24');
  assert.equal(easy.totalStalls, 50);
  assert.equal(easy.pricePerStall.toFixed(2), '22.54');

  const hard = calculateBid(fullInput(JOB_PRESETS[2]));
  assert.equal(hard.price.toFixed(2), '6110.34');
  assert.equal(hard.breakEvenPrice.toFixed(2), '4582.75');
  assert.equal(hard.totalStalls, 120);

  // The rate is fit to the easy job by construction: its own price divided
  // by its own stall count, applied only to the hard job's stall count --
  // a flat per-stall rate has no line for layout, ADA, stencils, or coats.
  const rate = easy.price / easy.totalStalls;
  const flatOnHard = rate * hard.totalStalls;
  assert.equal(flatOnHard.toFixed(2), '2704.76');
  assert.ok(flatOnHard < hard.breakEvenPrice, 'the flat rate should quote below the hard job\'s own break-even cost');
  assert.equal((hard.breakEvenPrice - flatOnHard).toFixed(2), '1877.99');
  assert.equal((hard.price - flatOnHard).toFixed(2), '3405.58');

  assert.match(html, /\$1,126\.98/);
  assert.match(html, /\$845\.24/);
  assert.match(html, /\$22\.54/);
  assert.match(html, /\$6,110\.34/);
  assert.match(html, /\$4,582\.75/);
  assert.match(html, /\$2,704\.76/);
  assert.match(html, /\$1,877\.99/);
  assert.match(html, /\$3,405\.58/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-8-per-stall-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-8-per-stall-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge-to-stripe-a-parking-lot\.html"/);
});
