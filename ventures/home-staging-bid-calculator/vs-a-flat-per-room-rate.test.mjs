import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-room-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor, competing calculator, or platform', () => {
  // This page compares against a generic pricing habit (a flat per-room
  // rate), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause. Distinct from this venture's own
  // vs-hutch.html and vs-honeybook.html, which name real products.
  assert.doesNotMatch(html, /Hutch|HoneyBook/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/home-staging-bid-calculator\/vs-a-flat-per-room-rate\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped defaults', async () => {
  const { calculateQuote, DEFAULTS } = await import('./calc.mjs');

  const base = calculateQuote(DEFAULTS);
  assert.equal(base.totalCostAtIncludedTerm.toFixed(2), '700.42');
  assert.equal(base.basePrice.toFixed(2), '1150.61');
  assert.equal(base.baseMarginPct.toFixed(2), '30.00');
  assert.equal(base.expectedTotalCost.toFixed(2), '920.42');
  assert.equal(base.expectedTotalRevenue.toFixed(2), '1400.61');
  assert.equal(base.expectedMarginPct.toFixed(2), '34.28');

  const flatQuote = 200 * DEFAULTS.roomsStaged;
  assert.equal(flatQuote, 800);

  const marginAtFlatIncluded = ((flatQuote - base.totalCostAtIncludedTerm) / flatQuote) * 100;
  assert.equal(marginAtFlatIncluded.toFixed(2), '12.45');

  const shortfallAtFlatExpected = base.expectedTotalCost - flatQuote;
  assert.equal(shortfallAtFlatExpected.toFixed(2), '120.42');

  assert.match(html, /\$800/);
  assert.match(html, /\$1,150\.61/);
  assert.match(html, /\$700\.42/);
  assert.match(html, /12\.45%/);
  assert.match(html, /\$1,400\.61/);
  assert.match(html, /\$920\.42/);
  assert.match(html, /34\.28%/);
  assert.match(html, /\$120\.42/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-room-rate\.html"|href="vs-a-flat-per-room-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-room-rate\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-home-staging\.html"/);
});
