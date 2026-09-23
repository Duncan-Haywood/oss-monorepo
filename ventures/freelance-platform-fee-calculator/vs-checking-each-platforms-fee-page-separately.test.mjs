import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-each-platforms-fee-page-separately.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or legal advice/);
});

test('carries the not-affiliated disclaimer for both named platforms', () => {
  // Unlike a page comparing against a generic habit (COMPARISON_DISCLAIMER_EXEMPT
  // in platform/pages/clauses.mjs), this page names Upwork and Fiverr -- they
  // are literally the two fee pages a freelancer would check by hand -- so it
  // carries the same "not affiliated" clause as index.html rather than
  // claiming the no-vendor-named exemption.
  assert.match(html, /Not affiliated with, endorsed by, or sponsored by <strong>Upwork<\/strong> or <strong>Fiverr<\/strong>/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/freelance-platform-fee-calculator\/vs-checking-each-platforms-fee-page-separately\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped example inputs', async () => {
  const { comparePlatforms } = await import('./calc.mjs');

  const jobPrice = 3000;

  // The freelancer's own quoted, contract-specific rate -- the only figure
  // Upwork's own fee page can give you since May 2025.
  const actual = comparePlatforms({ jobPrice, upworkFeePercent: 5 });
  assert.equal(actual.upwork.platformFee, 150);
  assert.equal(actual.upwork.takeHome, 2850);
  assert.equal(actual.upwork.effectiveTakeHomePercent, 95);

  // The retired lifetime-billing tiers Upwork charged before May 1, 2025:
  // 20% on the first $500 billed to a client, 10% up to $10,000, 5% above.
  // Recomputed here rather than imported from calc.mjs -- calc.mjs
  // deliberately encodes no Upwork formula any more (see its module
  // comment), so the retired formula this page warns against has nowhere
  // else in the repo to live.
  function retiredTieredFee(price) {
    let fee = 0;
    let remaining = price;
    const tier1 = Math.min(remaining, 500);
    fee += tier1 * 0.2;
    remaining -= tier1;
    const tier2 = Math.min(remaining, 10000 - 500);
    fee += tier2 * 0.1;
    remaining -= tier2;
    fee += remaining * 0.05;
    return fee;
  }
  const retiredFee = retiredTieredFee(jobPrice);
  const retiredTakeHome = jobPrice - retiredFee;
  assert.equal(retiredFee, 350);
  assert.equal(retiredTakeHome, 2650);
  assert.equal((retiredTakeHome / jobPrice * 100).toFixed(1), '88.3');

  const gap = actual.upwork.takeHome - retiredTakeHome;
  assert.equal(gap, 200);

  assert.match(html, /\$2,850/);
  assert.match(html, /95%/);
  assert.match(html, /\$2,650/);
  assert.match(html, /88\.3%/);
  assert.match(html, /\$200/);
  assert.match(html, /\$350 fee/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-checking-each-platforms-fee-page-separately\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-checking-each-platforms-fee-page-separately\.html/);
});

test('the comparison page links back to the calculator and to the Upwork-fee guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-does-upwork-take\.html"/);
});
