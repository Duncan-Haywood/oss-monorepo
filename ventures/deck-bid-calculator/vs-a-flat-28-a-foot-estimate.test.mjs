import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-28-a-foot-estimate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/i);
});

// This page compares against a generic pricing method (a flat per-square-foot
// estimate), not a named competitor, so it names no company and carries no
// affiliation disclaimer -- unlike vs-quoteiq.html, which does both.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /QuoteIQ|Jobber|Housecall Pro|ServiceTitan/i);
});

test('the canonical tag names this file, matching the venture convention', () => {
  assert.match(html, /<link rel="canonical" href="vs-a-flat-28-a-foot-estimate\.html">/);
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

// The JSON-LD text and the visible prose must read as the same string once
// HTML entities are decoded (the visible prose spells the em dash as
// &mdash;, matching the venture's own convention; JSON-LD spells it as the
// literal character), or faq-visible.test.mjs's punctuation-diff check fails
// the build -- pin it here too so a future edit to one side alone is caught
// locally.
test('the FAQPage JSON-LD answers are verbatim on the page (entities decoded)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const decoded = html.replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’').replace(/&times;/g, '×');
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(decoded.includes(answer), `answer for "${question.name}" is not verbatim in the visible page`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-28-a-foot-estimate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-28-a-foot-estimate\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example table figures are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs's presets or defaults ever
// change, this page's numbers must be re-derived, not left stale.
test('the worked-example table figures match calc.mjs run against the shipped presets and defaults', async () => {
  const { calculateBid } = await import('./calc.mjs');

  // The form's own shipped defaults (index.html), not numbers invented for
  // this page.
  const rates = {
    hourlyWage: 42,
    burdenRate: 30,
    milesOneWay: 14,
    speedMph: 28,
    setupHours: 1.5,
    minOnSiteHours: 8,
    tripFee: 125,
    disposalPerSf: 2.4,
    footingEach: 85,
    permitCost: 175,
    otherCost: 40,
    overheadRate: 15,
    targetMargin: 22,
  };

  const lowPatio = calculateBid({
    ...rates,
    sections: [{ name: 'Patio deck', lengthFt: 20, widthFt: 20, heightFt: 0.5, material: 'pt' }],
    railingLf: 0,
    stairs: [],
    demoSf: 0,
  });

  // The calculator's own shipped index.html defaults: Main deck 14x20 + Wrap
  // 10x12, both 3 ft up, pt material, 46 lf wood railing, one yard stair (1
  // run, 4 ft wide, 5 risers), 280 sf of tear-out.
  const defaultJob = calculateBid({
    ...rates,
    sections: [
      { name: 'Main deck', lengthFt: 14, widthFt: 20, heightFt: 3, material: 'pt' },
      { name: 'Wrap', lengthFt: 10, widthFt: 12, heightFt: 3, material: 'pt' },
    ],
    railingLf: 46,
    railingStyle: 'wood',
    stairs: [{ name: 'Yard stair', runs: 1, widthFt: 4, risers: 5 }],
    demoSf: 280,
  });

  const elevatedComposite = calculateBid({
    ...rates,
    sections: [{ name: 'Main deck', lengthFt: 16, widthFt: 24, heightFt: 8, material: 'composite' }],
    railingLf: 80,
    railingStyle: 'cable',
    stairs: [{ name: 'Main stair', runs: 1, widthFt: 5, risers: 14 }],
    demoSf: 0,
  });

  assert.equal(lowPatio.totalCost.toFixed(2), '10773.09');
  assert.equal(defaultJob.totalCost.toFixed(2), '17692.80');
  assert.equal(elevatedComposite.totalCost.toFixed(2), '29826.09');

  assert.equal(lowPatio.deckSquareFeet, 400);
  assert.equal(defaultJob.deckSquareFeet, 400);
  assert.equal(elevatedComposite.deckSquareFeet, 384);

  assert.match(html, /\$10,773\.09/);
  assert.match(html, /\$17,692\.80/);
  assert.match(html, /\$29,826\.09/);

  // The $28-a-foot estimate shown is the venture's own headline anchor --
  // this venture's own README.md and how-much-to-charge.html both already
  // name "$28-a-foot" as the postcard rate a flat quote loses money on.
  assert.match(html, /\$11,200\.00/);
  assert.match(html, /\$10,752\.00/);
  assert.match(html, /\$426\.91/);
  assert.match(html, /\$6,492\.80/);
  assert.match(html, /\$19,074\.09/);
});
