import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-square-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, legal, tax, financial, or engineering advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-aspire.html,
  // which names Aspire specifically.
  assert.doesNotMatch(html, /Aspire/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/paver-patio-bid-calculator\/vs-a-flat-rate-per-square-foot\.html">/);
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

test('the worked-example figures match calc.mjs on a 12x16 patio coupon and a 20x24 circular driveway pad', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const baseRates = {
    hoursPerFinishedSf: 0.08, hoursPerEdgeLf: 0.05, excavateYdPerHour: 2,
    paverCostPerSf: 4.5, gravelCostPerCuYd: 48, sandCostPerCuYd: 52,
    polymericCoverageSf: 80, polymericBagCost: 28, edgeCostPerLf: 3.75,
    haulCostPerCuYd: 55, hourlyWage: 32, burdenRate: 30,
    travelAndEquipment: 375, overheadRate: 15, targetMargin: 22,
    beddingIn: 1, paverThicknessIn: 2.375,
  };

  // The coupon: a 12x16 running-bond patio on 6in of base with spoils left
  // on site -- the job a flat per-square-foot rate is usually set on.
  const small = calculateBid({
    ...baseRates,
    lengthFeet: 12, widthFeet: 16,
    wastePct: 7, patternLaborFactor: 1.0,
    baseDepthIn: 6, haulAway: false,
  });

  // A 20x24 circular/fan driveway pad on 10in of base with haul-away.
  const big = calculateBid({
    ...baseRates,
    lengthFeet: 20, widthFeet: 24,
    wastePct: 18, patternLaborFactor: 1.35,
    baseDepthIn: 10, haulAway: true,
  });

  const money = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  assert.equal(money(small.totalCost), '3,065.87');
  assert.equal(money(small.price), '3,930.60');
  assert.equal(money(small.pricePerSqFt), '20.47');

  assert.equal(money(big.totalCost), '9,259.22');
  assert.equal(money(big.price), '11,870.79');

  const flatQuoteForBig = small.pricePerSqFt * big.areaSqFt;
  assert.equal(money(flatQuoteForBig), '9,826.50');
  assert.ok(flatQuoteForBig > big.totalCost, 'the flat quote should still clear break-even in this worked example');
  assert.equal(money(flatQuoteForBig - big.totalCost), '567.28');
  assert.equal(money(big.price - flatQuoteForBig), '2,044.29');

  const realizedMarginPct = (flatQuoteForBig - big.totalCost) / flatQuoteForBig * 100;
  assert.equal(realizedMarginPct.toFixed(1), '5.8');

  const ratio = big.price / small.price;
  assert.equal(ratio.toFixed(2), '3.02');
  assert.equal((big.areaSqFt / small.areaSqFt).toFixed(2), '2.50');

  for (const figure of [
    '$3,065.87', '$3,930.60', '$20.47',
    '$9,259.22', '$11,870.79',
    '$9,826.50', '$567.28', '$2,044.29', '5.8%',
    '3.02 times',
  ]) {
    assert.ok(html.includes(figure), `worked-example figure ${figure} not found verbatim on the page`);
  }
});

test('links back to the calculator and the guide, and is linked from the index page', () => {
  assert.match(html, /<a href="\.\/">Paver Patio Bid Calculator<\/a>/);
  assert.match(html, /<a href="\.\/how-much-to-charge-for-a-paver-patio\.html">how much to charge for a paver patio<\/a>/);
  assert.match(indexHtml, /vs-a-flat-rate-per-square-foot\.html/);
});

test('is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-square-foot\.html/);
});
