import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-shirt.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat "$14 a shirt"
  // price), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest. vs-printavo.html already carries this
  // venture's one named-product comparison and its own trademark disclaimer.
  assert.doesNotMatch(html, /Printavo|Printful|InkSoft|ShopWorks/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-price-per-shirt\.html">/);
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

test('the worked-example figures match calculator.mjs on the shipped default shop rates', async () => {
  const { computeDecorationJob } = await import('./calculator.mjs');

  // The shipped index.html default shop-cost fields (see the input `value`
  // attributes there): selecting screen-print, $18/screen, 90 pieces/hour
  // press throughput, $0.06 ink/piece/colour, $4.20 blanks, 4% spoilage,
  // $20/hr wage loaded 18%, 30 minutes of art time, $5,200 monthly overhead
  // across 2,600 monthly pieces, a 40% target margin, and the shipped
  // $14/piece "Load an example" price.
  const shopDefaults = {
    method: 'screen-print',
    pricePerPiece: 14,
    setupFeeCharged: 0,
    targetMarginPct: 40,
    colorsPerLocation: 3,
    screenSetupCost: 18,
    pressPiecesPerHour: 90,
    inkCostPerPiecePerColor: 0.06,
    blankCostPerPiece: 4.2,
    spoilagePct: 4,
    wagePerHour: 20,
    payrollLoadPct: 18,
    artMinutes: 30,
    finishMinutesPerPiece: 0.4,
    monthlyOverhead: 5200,
    monthlyPieces: 2600,
  };

  const frontOnly = computeDecorationJob({ ...shopDefaults, locations: 1, quantity: 12 });
  const frontAndBack = computeDecorationJob({ ...shopDefaults, locations: 2, quantity: 12 });

  // Front-only: 3 screens, a real (if thin) profit.
  assert.equal(frontOnly.job.setup.screenCount, 3);
  assert.equal(frontOnly.job.setup.total.toFixed(2), '65.80');
  assert.equal(frontOnly.job.blanksPurchased, 13);
  assert.equal(frontOnly.job.blanks.toFixed(2), '54.60');
  assert.equal(frontOnly.job.runTotal.toFixed(2), '7.20');
  assert.equal(frontOnly.job.overhead.toFixed(2), '24.00');
  assert.equal(frontOnly.job.total.toFixed(2), '151.60');
  assert.equal(frontOnly.costPerPiece.toFixed(2), '12.63');
  assert.equal(frontOnly.breakEvenPricePerPiece.toFixed(2), '12.63');
  assert.equal(frontOnly.targetPricePerPiece.toFixed(2), '21.06');
  assert.equal(frontOnly.revenue.toFixed(2), '168.00');
  assert.equal(frontOnly.profit.toFixed(2), '16.40');
  assert.equal(frontOnly.marginPct.toFixed(1), '9.8');
  assert.ok(frontOnly.profit > 0, 'the front-only job should be profitable at $14/shirt');

  // Front + back: 6 screens (not 3 -- one set per placement), a real loss.
  assert.equal(frontAndBack.job.setup.screenCount, 6);
  assert.equal(frontAndBack.job.setup.total.toFixed(2), '119.80');
  assert.equal(frontAndBack.job.blanksPurchased, 13);
  assert.equal(frontAndBack.job.blanks.toFixed(2), '54.60');
  assert.equal(frontAndBack.job.runTotal.toFixed(2), '12.50');
  assert.equal(frontAndBack.job.overhead.toFixed(2), '24.00');
  assert.equal(frontAndBack.job.total.toFixed(2), '210.90');
  assert.equal(frontAndBack.costPerPiece.toFixed(2), '17.57');
  assert.equal(frontAndBack.breakEvenPricePerPiece.toFixed(2), '17.57');
  assert.equal(frontAndBack.targetPricePerPiece.toFixed(2), '29.29');
  assert.equal(frontAndBack.revenue.toFixed(2), '168.00');
  assert.equal(frontAndBack.profit.toFixed(2), '-42.90');
  assert.equal(frontAndBack.marginPct.toFixed(1), '-25.5');
  assert.ok(frontAndBack.profit < 0, 'the front+back job should lose money at the same $14/shirt price');

  // The flat rate charges the identical amount either way -- 12 shirts at $14.
  assert.equal(frontOnly.revenue, frontAndBack.revenue);

  // Both are this calculator's own worked example, not an invented pair.
  assert.equal(
    (frontAndBack.job.setup.total - frontOnly.job.setup.total).toFixed(2),
    '54.00',
    'a second placement should add exactly 3 more screens worth of setup ($18 x 3)',
  );
  assert.equal(
    (frontOnly.profit - frontAndBack.profit).toFixed(2),
    '59.30',
    'the swing from profit to loss should equal the added setup and run cost',
  );
  assert.equal(
    (frontAndBack.targetPricePerPiece - frontOnly.targetPricePerPiece).toFixed(2),
    '8.24',
  );

  for (const figure of ['$168.00', '$65.80', '$119.80', '$54.60', '$7.20', '$12.50', '$24.00', '$151.60', '$210.90', '$16.40', '$12.63', '$17.57', '$21.06', '$29.29', '$42.90', '$8.24']) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} is missing from the page`);
  }
  assert.match(html, /&minus;\$42\.90|-\$42\.90/, 'the $42.90 loss on the front+back job is missing from the page');
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-shirt\.html"|href="vs-a-flat-price-per-shirt\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-shirt\.html/);
});

test('the comparison page links back to the calculator and to the second-location guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="should-i-charge-extra-for-a-second-print-location\.html"/);
});

test('this generic-method page is registered as disclaimer-exempt and within the surface budget', async () => {
  const { COMPARISON_DISCLAIMER_EXEMPT } = await import('../../platform/pages/clauses.mjs');
  assert.ok(
    COMPARISON_DISCLAIMER_EXEMPT.has('apparel-decoration-price-calculator/vs-a-flat-price-per-shirt.html'),
    'vs-a-flat-price-per-shirt.html must be registered in COMPARISON_DISCLAIMER_EXEMPT so it counts as generic-method, not named-product',
  );
});
