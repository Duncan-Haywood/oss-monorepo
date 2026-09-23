import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-installed-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a plumbing-code determination, a fixture specification, legal, tax, or financial advice/i);
});

test('names no vendor, competing calculator, or field service platform', () => {
  // This page compares against a generic pricing habit (a flat installed
  // price), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with, unlike this venture's own vs-servicetitan.html.
  assert.doesNotMatch(html, /ServiceTitan|ServiceMonster|ServiceFusion|Housecall Pro|Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-installed-price\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped presets', async () => {
  const {
    calculateBid,
    suggestedScopeKit,
    suggestedToiletKit,
    suggestedRoughInKit,
    suggestedExtraKit,
  } = await import('./calc.mjs');

  function special() {
    const kit = {
      ...suggestedScopeKit('swap-only'),
      ...suggestedToiletKit('two-piece-standard'),
      ...suggestedRoughInKit('12-inch'),
      ...suggestedExtraKit(),
    };
    return {
      toiletCount: 1, scope: 'swap-only', toilet: 'two-piece-standard', roughIn: '12-inch',
      travelMiles: 6, includeHaul: false, includeWaxFree: false, includeBidetSeat: false,
      hourlyWage: 42, burdenRate: 30, overheadRate: 15, targetMargin: 20,
      travelAndEquipment: 45, otherCost: 0, ...kit,
    };
  }

  function losingJob() {
    const kit = {
      ...suggestedScopeKit('flange-repair'),
      ...suggestedToiletKit('one-piece'),
      ...suggestedRoughInKit('10-inch'),
      ...suggestedExtraKit(),
    };
    return {
      toiletCount: 1, scope: 'flange-repair', toilet: 'one-piece', roughIn: '10-inch',
      travelMiles: 18, includeHaul: true, includeWaxFree: true, includeBidetSeat: true,
      hourlyWage: 42, burdenRate: 30, overheadRate: 15, targetMargin: 20,
      travelAndEquipment: 85, otherCost: 0, ...kit,
    };
  }

  const cheap = calculateBid(special());
  assert.equal(cheap.price.toFixed(2), '565.65');
  assert.equal(cheap.totalCost.toFixed(2), '452.52');

  const heavy = calculateBid(losingJob());
  assert.equal(heavy.price.toFixed(2), '1937.11');
  assert.equal(heavy.totalCost.toFixed(2), '1549.69');

  // Applying the cheap job's own flat installed price to the heavy job,
  // the way a "$249 installed" special is applied regardless of scope,
  // toilet type, or rough-in. Both jobs are one toilet, so the flat price
  // transfers directly with no per-unit conversion.
  const flatQuote = cheap.price;
  assert.ok(flatQuote < heavy.totalCost, 'the flat price should quote below the heavy job\'s own break-even cost');
  assert.equal((heavy.totalCost - flatQuote).toFixed(2), '984.04');
  assert.equal((heavy.price - flatQuote).toFixed(2), '1371.46');

  assert.match(html, /\$565\.65/);
  assert.match(html, /\$452\.52/);
  assert.match(html, /\$1,937\.11/);
  assert.match(html, /\$1,549\.69/);
  assert.match(html, /\$984\.04/);
  assert.match(html, /\$1,371\.46/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-installed-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-installed-price\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="how-much-to-charge-to-replace-a-toilet\.html"/);
});
