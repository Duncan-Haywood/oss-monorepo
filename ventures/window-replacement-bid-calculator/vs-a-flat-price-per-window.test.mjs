import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-window.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // window), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-marketsharp.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /MarketSharp/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-price-per-window\.html">/);
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
    hourlyWage: 32,
    burdenRate: 28,
    milesOneWay: 12,
    speedMph: 35,
    setupHours: 0.5,
    minOnSiteHours: 0,
    tripFee: 0,
    scaffoldingCost: 150,
    disposalPerOpening: 18,
    permitCost: 0,
    otherCost: 0,
    overheadRate: 12,
    targetMargin: 25,
    proposedPrice: null,
  };

  // The stock first-floor brochure job -- the profile a flat per-window
  // rate is probably learned from.
  const easy = calculateBid({
    ...shared,
    openings: [{
      name: 'Stock double-hung',
      type: 'double-hung', frame: 'vinyl', install: 'insert', condition: 'clean',
      widthIn: 30, heightIn: 40, quantity: 8, story: 1, trim: false,
    }],
  });
  assert.equal(easy.openings[0].ui, 70);
  assert.equal(easy.totalHours.toFixed(1), '15.6');
  assert.equal(easy.totalCost.toFixed(2), '3071.48');
  assert.equal(easy.price.toFixed(2), '4095.30');
  assert.equal(easy.pricePerOpening.toFixed(2), '511.91');

  // Same 8 windows, but oversized second-floor wood casements, full-frame
  // tear-out, rot repair, plus interior casing and exterior capping.
  const hard = calculateBid({
    ...shared,
    openings: [{
      name: 'Oversized 2nd-floor casement, rot repair',
      type: 'casement', frame: 'wood', install: 'fullframe', condition: 'rot',
      widthIn: 48, heightIn: 64, quantity: 8, story: 2, trim: true,
    }],
    addOns: [
      { id: 'interiorCasing', label: 'Interior casing / returns', hoursPerOpening: 0.4, partsPerOpening: 38, enabled: true },
      { id: 'exteriorCapping', label: 'Exterior vinyl / aluminum capping', hoursPerOpening: 0.25, partsPerOpening: 28, enabled: true },
    ],
  });
  assert.equal(hard.openings[0].ui, 112);
  assert.equal(hard.totalHours.toFixed(1), '71.6');
  assert.equal(hard.totalCost.toFixed(2), '14107.24');
  assert.equal(hard.price.toFixed(2), '18809.65');
  assert.equal(hard.pricePerOpening.toFixed(2), '2351.21');

  // A rate learned per window from the easy job, applied to the harder
  // job's identical window count, reproduces that same rate times 8.
  const flatOnHard = easy.pricePerOpening * 8;
  assert.equal(flatOnHard.toFixed(2), '4095.30');
  assert.ok(
    flatOnHard < hard.totalCost,
    "the flat-rate price should quote below the harder job's own break-even cost",
  );
  assert.equal((hard.totalCost - flatOnHard).toFixed(2), '10011.94');
  assert.equal((hard.price - flatOnHard).toFixed(2), '14714.35');

  assert.match(html, /\$4,095\.30/);
  assert.match(html, /\$511\.91/);
  assert.match(html, /\$14,107\.24/);
  assert.match(html, /\$18,809\.65/);
  assert.match(html, /\$2,351\.21/);
  assert.match(html, /\$10,011\.94/);
  assert.match(html, /\$14,714\.35/);
  assert.match(html, /15\.6 crew-hours/);
  assert.match(html, /71\.6 crew-hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-window\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-window\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
