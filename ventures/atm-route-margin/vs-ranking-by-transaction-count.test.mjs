import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-ranking-by-transaction-count.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/i);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('carries the best-effort hosting and licence/support paragraphs', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /Free and open source/);
  assert.match(html, /href="LICENSE"/);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic habit -- ranking route locations by
  // withdrawal count -- not a named product, so it belongs in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause. Pinning the absence of a competitor
  // name here is what keeps that exemption honest. vs-atm-depot.html already
  // carries this venture's one named-product comparison and its own
  // trademark disclaimer.
  assert.doesNotMatch(html, /ATM Depot/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-ranking-by-transaction-count\.html">/);
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

test('the worked-example figures match calc.mjs on the two location profiles', async () => {
  const { calculate, DEFAULTS } = await import('./calc.mjs');

  const locationA = calculate({
    ...DEFAULTS,
    monthlyWithdrawals: 220,
    locationCommissionPct: 25,
    locationFlatFee: 0,
    averageCashLoad: 2000,
    driveMinutes: 10,
    mileage: 4,
  });
  const locationB = calculate({
    ...DEFAULTS,
    monthlyWithdrawals: 220,
    locationCommissionPct: 55,
    locationFlatFee: 0,
    averageCashLoad: 5000,
    driveMinutes: 35,
    mileage: 22,
  });

  // Both locations gross the identical surcharge revenue on the identical
  // withdrawal count -- the whole point being demonstrated.
  assert.equal(locationA.grossSurcharge, locationB.grossSurcharge);
  assert.equal(locationA.grossSurcharge.toFixed(2), '605.00');

  assert.equal(locationA.commissionAmount.toFixed(2), '151.25');
  assert.equal(locationA.cashCost.toFixed(2), '13.33');
  assert.equal(locationA.mileageCost.toFixed(2), '10.72');
  assert.equal(locationA.laborCost.toFixed(2), '41.67');
  assert.equal(locationA.netProfit.toFixed(2), '262.03');
  assert.equal(locationA.profitMarginPct.toFixed(1), '43.3');
  assert.equal(locationA.perTransactionProfit.toFixed(2), '1.19');

  assert.equal(locationB.commissionAmount.toFixed(2), '332.75');
  assert.equal(locationB.cashCost.toFixed(2), '33.33');
  assert.equal(locationB.mileageCost.toFixed(2), '58.96');
  assert.equal(locationB.laborCost.toFixed(2), '83.33');
  assert.equal(locationB.netProfit.toFixed(2), '-29.38');
  assert.equal(locationB.profitMarginPct.toFixed(1), '-4.9');
  assert.equal(locationB.perTransactionProfit.toFixed(2), '-0.13');

  assert.ok(locationA.netProfit > 0, 'location A should be profitable');
  assert.ok(locationB.netProfit < 0, 'location B should be a loss, despite the identical withdrawal count');

  for (const figure of ['$605.00', '$151.25', '$332.75', '$13.33', '$33.33', '$10.72', '$58.96', '$41.67', '$83.33', '$262.03', '43.3%', '$1.19']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$29\.38|-\$29\.38/, 'the $29.38 loss on location B is missing from the page');
  assert.match(html, /&minus;4\.9%|-4\.9%/, 'the -4.9% margin on location B is missing from the page');
  assert.match(html, /&minus;\$0\.13|-\$0\.13/, 'the -$0.13 per-withdrawal figure is missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-ranking-by-transaction-count\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-ranking-by-transaction-count\.html/);
});

test('the comparison page links back to the calculator and to the placement guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="is-this-atm-placement-worth-it\.html"/);
});
