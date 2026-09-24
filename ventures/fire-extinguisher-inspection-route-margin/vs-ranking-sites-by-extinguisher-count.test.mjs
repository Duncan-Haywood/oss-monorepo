import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-ranking-sites-by-extinguisher-count.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the best-effort hosting and licence/support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /MIT licensed/);
  assert.match(html, /href="LICENSE"/);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic habit -- ranking sites by
  // extinguisher count -- not a named product, so it belongs in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause. Pinning the absence of a
  // competitor name here is what keeps that exemption honest.
  // vs-servicetitan.html already carries this venture's one named-product
  // comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /ServiceTitan/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-ranking-sites-by-extinguisher-count\.html">/);
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

test('the worked-example figures match calc.mjs on the two site profiles', async () => {
  const { calculate, DEFAULTS } = await import('./calc.mjs');

  const base = { ...DEFAULTS, extinguisherCount: 18, visitsPerYear: 1 };

  const siteA = calculate({
    ...base,
    rechargePct: 25,
    hydroTestPct: 10,
    replacementPct: 5,
    driveMinutes: 14,
    mileage: 6,
  });
  const siteB = calculate({
    ...base,
    rechargePct: 5,
    hydroTestPct: 2,
    replacementPct: 1,
    driveMinutes: 75,
    mileage: 38,
  });

  // Both sites bill the identical inspection + tag revenue on the identical
  // extinguisher count -- the whole point being demonstrated.
  const inspectionPlusTagA = siteA.inspectionRevenue + siteA.tagRevenue;
  const inspectionPlusTagB = siteB.inspectionRevenue + siteB.tagRevenue;
  assert.equal(inspectionPlusTagA, inspectionPlusTagB);
  assert.equal(inspectionPlusTagA.toFixed(2), '207.00');

  assert.equal(siteA.visitRevenue.toFixed(2), '567.90');
  assert.equal(siteA.materialsCost.toFixed(2), '162.00');
  assert.equal(siteA.mileageCost.toFixed(2), '4.02');
  assert.equal(siteA.laborCost.toFixed(2), '45.87');
  assert.equal(siteA.laborHours.toFixed(2), '1.43');
  assert.equal(siteA.visitProfit.toFixed(2), '356.01');
  assert.equal(siteA.netProfit.toFixed(2), '21.67');
  assert.equal(siteA.profitMarginPct.toFixed(1), '45.8');
  assert.equal(siteA.effectiveHourlyRate.toFixed(2), '181.40');

  assert.equal(siteB.visitRevenue.toFixed(2), '279.18');
  assert.equal(siteB.materialsCost.toFixed(2), '38.16');
  assert.equal(siteB.mileageCost.toFixed(2), '25.46');
  assert.equal(siteB.laborCost.toFixed(2), '78.40');
  assert.equal(siteB.laborHours.toFixed(2), '2.45');
  assert.equal(siteB.visitProfit.toFixed(2), '137.16');
  assert.equal(siteB.netProfit.toFixed(2), '3.43');
  assert.equal(siteB.profitMarginPct.toFixed(1), '14.7');
  assert.equal(siteB.effectiveHourlyRate.toFixed(2), '16.80');

  assert.ok(siteA.netProfit > siteB.netProfit, 'site A should be more profitable than site B despite the identical extinguisher count');

  for (const figure of ['$207.00', '$567.90', '$162.00', '$4.02', '$45.87', '$356.01', '$21.67', '45.8%', '$181.40']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  for (const figure of ['$279.18', '$38.16', '$25.46', '$78.40', '$137.16', '$3.43', '14.7%', '$16.80']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-ranking-sites-by-extinguisher-count\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-ranking-sites-by-extinguisher-count\.html/);
});

test('the comparison page links back to the calculator and to the small-site guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-many-extinguishers-make-a-site-worth-servicing\.html"/);
});
