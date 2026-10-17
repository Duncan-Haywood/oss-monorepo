import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-vehicle-size-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /It is not legal, safety, or automotive advice/);
});

test('carries the VLT / tint-darkness-law gap disclaimer', () => {
  assert.match(html, /does not check your state's window tint darkness \(VLT%\) law/);
});

// This page compares against a generic pricing method (a flat per-vehicle
// price by size class), not a named competitor, so it names no company and
// carries no affiliation disclaimer -- it is listed in
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT instead. Same
// discipline as wildlife-exclusion-bid-calculator's
// vs-a-flat-395-removal-fee.test.mjs and landscape-lighting-bid-calculator's
// vs-a-flat-150-per-light-special.test.mjs.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /not affiliated with/i);
  assert.doesNotMatch(html, /3M|Llumar|SunTek|XPEL|Ceramic Pro|Tint World/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-per-vehicle-size-price\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-per-vehicle-size-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-vehicle-size-price\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example table is this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The "mid" job (full kit,
// ceramic, no removal) matches index.html's own shipped default form values
// exactly, so a reader who opens the calculator with nothing changed sees
// this page's own middle row.
test('the worked-example table figures match calc.mjs run against the stated jobs', async () => {
  const { calculateTintBid, pricingGap, DEFAULTS } = await import('./calc.mjs');

  const light = {
    ...DEFAULTS,
    rearDoorWindows: 0,
    quarterWindows: 0,
    rearWindshield: 0,
    filmTier: 'dyed',
  };
  const mid = DEFAULTS;
  const heavy = { ...DEFAULTS, removeOldTint: true };

  const lightResult = calculateTintBid(light);
  const midResult = calculateTintBid(mid);
  const heavyResult = calculateTintBid(heavy);

  assert.equal(lightResult.priceAtMargin.toFixed(2), '60.46');
  assert.equal(lightResult.finalPrice.toFixed(2), '120.00');
  assert.equal(midResult.finalPrice.toFixed(2), '370.27');
  assert.equal(heavyResult.finalPrice.toFixed(2), '429.14');

  const lightGap = pricingGap(light);
  const midGap = pricingGap(mid);
  const heavyGap = pricingGap(heavy);

  assert.equal(lightGap.naiveQuote, 200);
  assert.equal(lightGap.underpriced, false);
  assert.equal(Math.abs(lightGap.dollarGap).toFixed(2), '80.00');

  assert.equal(midGap.underpriced, true);
  assert.equal(midGap.dollarGap.toFixed(2), '170.27');
  assert.equal((midGap.percentGap * 100).toFixed(0), '85');

  assert.equal(heavyGap.underpriced, true);
  assert.equal(heavyGap.dollarGap.toFixed(2), '229.14');
  assert.equal((heavyGap.percentGap * 100).toFixed(0), '115');

  assert.match(html, /\$120\.00/);
  assert.match(html, /\$200\.00/);
  assert.match(html, /\$80\.00/);
  assert.match(html, /\$370\.27/);
  assert.match(html, /\$170\.27/);
  assert.match(html, /\$429\.14/);
  assert.match(html, /\$229\.14/);
  assert.match(html, /\$60\.46/);
});
