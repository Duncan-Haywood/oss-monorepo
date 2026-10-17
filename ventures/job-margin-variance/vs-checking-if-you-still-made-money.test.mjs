import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-if-you-still-made-money.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, tax, accounting, or business advice/);
});

test('carries the nothing-leaves-your-browser notice and the sponsors/license link', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /LICENSE/);
});

test('names no vendor, accounting suite, or competing calculator', () => {
  // This page compares against a generic review habit (checking whether the
  // final invoice cleared the bid), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause. Distinct from this venture's own
  // vs-quickbooks-job-costing.html, which names QuickBooks/Intuit
  // specifically and already carries the trademark disclaimer.
  assert.doesNotMatch(html, /QuickBooks|Intuit|Buildertrend|Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-if-you-still-made-money\.html">/);
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

test('the worked-example figures match calc.mjs on a stated set of inputs', async () => {
  const { calculate } = await import('./calc.mjs');

  const result = calculate({
    estimatedHours: 16,
    actualHours: 20,
    estimatedMaterials: 420,
    actualMaterials: 465,
    estimatedOther: 80,
    actualOther: 95,
    hourlyRate: 55,
    bidPrice: 2000,
  });

  assert.equal(result.laborCostVariance, 220);
  assert.equal(result.rows.find((r) => r.label === 'Materials').variance, 45);
  assert.equal(result.rows.find((r) => r.label === 'Other costs').variance, 15);
  assert.equal(result.totalCostVariance, 280);
  assert.equal(result.largest.label, 'Labor hours');
  assert.equal(result.margin.actualProfit, 340);
  assert.equal(result.margin.estimatedProfit, 620);
  assert.equal(result.margin.estimatedMarginPct, 31);
  assert.equal(result.margin.actualMarginPct, 17);
  assert.equal(result.margin.marginPointsVariance, -14);

  const laborSharePct = (result.laborCostVariance / result.totalCostVariance) * 100;
  assert.ok(laborSharePct > 78 && laborSharePct < 79, `expected ~79%, got ${laborSharePct}`);

  assert.match(html, /\$220/);
  assert.match(html, /\$45/);
  assert.match(html, /\$15/);
  assert.match(html, /\$340/);
  assert.match(html, /\$620/);
  assert.match(html, /31\.0%/);
  assert.match(html, /17\.0%/);
  assert.match(html, /14\.0 points/);
  assert.match(html, /79%/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-checking-if-you-still-made-money\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-checking-if-you-still-made-money\.html/);
});

test('the comparison page links back to the calculator and to the variance guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/why-did-my-job-cost-more-than-i-estimated\.html"/);
});
