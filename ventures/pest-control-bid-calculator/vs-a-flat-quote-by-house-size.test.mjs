import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-quote-by-house-size.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat quote by
  // house size), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-pestpac.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /PestPac/);
  assert.doesNotMatch(html, /WorkWave/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-quote-by-house-size\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const acceptedAnswer = question.acceptedAnswer;
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the worked-example figures match calc.mjs on the shipped cost inputs', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const shared = {
    oneWayMinutes: 22,
    frequency: 'quarterly',
    hourlyWage: 20,
    burdenRate: 30,
    vehicleCostPerVisit: 8,
    otherPerVisit: 0,
    overheadRate: 15,
    targetMargin: 25,
    proposedRecurring: null,
    waiveInitial: false,
  };

  // Exterior-only spray at a house -- the profile a flat house-size rate is
  // probably learned from.
  const exteriorOnly = calculateBid({
    ...shared,
    services: [
      { name: 'Exterior perimeter spray', minutes: 18, quantity: 1, everyVisit: true, materialPerUnit: 4.5 },
    ],
  });
  assert.equal(exteriorOnly.recurringVisitHours.toFixed(2), '1.03');
  assert.equal(exteriorOnly.recurringCost.toFixed(2), '45.27');
  assert.equal(exteriorOnly.recurringPrice.toFixed(2), '60.36');
  assert.equal(exteriorOnly.annualRecurring.toFixed(2), '241.45');

  // Same size house, an eight-station rodent account added to the same
  // exterior spray -- station count and interior work a house-size quote
  // cannot see.
  const rodentJob = calculateBid({
    ...shared,
    services: [
      { name: 'Exterior perimeter spray', minutes: 18, quantity: 1, everyVisit: true, materialPerUnit: 4.5 },
      { name: 'Rodent bait station check', minutes: 4, quantity: 8, everyVisit: true, materialPerUnit: 1.75 },
    ],
  });
  assert.equal(rodentJob.recurringVisitHours.toFixed(2), '1.57');
  assert.equal(rodentJob.recurringCost.toFixed(2), '77.32');
  assert.equal(rodentJob.recurringPrice.toFixed(2), '103.09');
  assert.equal(rodentJob.annualRecurring.toFixed(2), '412.36');

  // A rate learned per visit from the exterior-only stop, applied to the
  // rodent account, quotes below that account's own break-even cost.
  const flatRateOnRodentJob = exteriorOnly.recurringPrice;
  assert.equal(flatRateOnRodentJob.toFixed(2), '60.36');
  assert.ok(
    flatRateOnRodentJob < rodentJob.recurringCost,
    'the house-size rate should quote below the rodent account\'s own break-even cost',
  );
  assert.equal((rodentJob.recurringCost - flatRateOnRodentJob).toFixed(2), '16.96');
  assert.equal(
    ((rodentJob.recurringPrice - flatRateOnRodentJob) * rodentJob.visitsPerYear).toFixed(2),
    '170.92',
  );

  assert.match(html, /\$45\.27/);
  assert.match(html, /\$60\.36/);
  assert.match(html, /\$241\.45/);
  assert.match(html, /\$77\.32/);
  assert.match(html, /\$103\.09/);
  assert.match(html, /\$412\.36/);
  assert.match(html, /\$16\.96/);
  assert.match(html, /\$170\.92/);
  assert.match(html, /1\.03 crew-hours/);
  assert.match(html, /1\.57 crew-hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-quote-by-house-size\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-quote-by-house-size\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
