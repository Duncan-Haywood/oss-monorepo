import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-for-every-call.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat rate for
  // every call), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause. Distinct from this venture's own
  // vs-jobber.html, vs-workiz.html, and vs-housecall-pro.html, which name
  // real products.
  assert.doesNotMatch(html, /Jobber|Workiz|Housecall Pro/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/locksmith-bid-calculator\/vs-a-flat-rate-for-every-call\.html">/);
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

  const day = calculateQuote({ ...DEFAULTS, emergencyCall: false });
  assert.equal(day.cost.toFixed(2), '198.54');
  assert.equal(day.finalPrice.toFixed(2), '283.62');
  assert.equal(day.profitMarginPct.toFixed(2), '30.00');

  const night = calculateQuote({ ...DEFAULTS, emergencyCall: true });
  assert.equal(night.cost.toFixed(2), '243.39');
  assert.equal(night.finalPrice.toFixed(2), '347.69');
  assert.equal(night.profitMarginPct.toFixed(2), '30.00');

  const flatQuoteOnNight = day.finalPrice;
  assert.ok(flatQuoteOnNight > night.cost, 'the flat price should still cover the night job\'s cost');
  const marginAtFlatPrice = (flatQuoteOnNight - night.cost) / flatQuoteOnNight * 100;
  assert.equal(marginAtFlatPrice.toFixed(2), '14.19');
  assert.equal((night.finalPrice - flatQuoteOnNight).toFixed(2), '64.07');

  assert.match(html, /\$198\.54/);
  assert.match(html, /\$283\.62/);
  assert.match(html, /\$243\.39/);
  assert.match(html, /\$347\.69/);
  assert.match(html, /14\.19%/);
  assert.match(html, /\$64\.07/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-for-every-call\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-for-every-call\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-should-a-locksmith-charge-for-a-service-call\.html"/);
});
