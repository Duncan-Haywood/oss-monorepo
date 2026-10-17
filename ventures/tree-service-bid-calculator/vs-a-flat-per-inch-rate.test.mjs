import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-inch-rate.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('carries the best-effort hosting notice and the sponsors link', () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat per-inch
  // rate), not a named product, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- there is no company to disclaim a relationship with.
  // Distinct from this venture's own vs-singleops.html, which names
  // SingleOps specifically.
  assert.doesNotMatch(html, /SingleOps/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/tree-service-bid-calculator\/vs-a-flat-per-inch-rate\.html">/);
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

test('the worked-example figures match calc.mjs on a 12-inch pine and a 24-inch oak', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const base = () => ({
    crewHourlyRate: 180, burdenRate: 30, equipmentHourly: 45, craneDayRate: 1200,
    dumpFeePerTree: 85, otherJobCost: 0, overheadRate: 15, targetMargin: 25,
    minimumJob: 450, travelMinutes: 40,
  });

  const pine = calculateBid({
    ...base(),
    trees: [{ name: 'Street pine', dbhInches: 12, heightFeet: 40, species: 'softwood', access: 'street', haul: 'leave', grindStump: false }],
  });
  const oak = calculateBid({
    ...base(),
    trees: [{ name: 'Backyard oak', dbhInches: 24, heightFeet: 60, species: 'hardwood', access: 'backyard', haul: 'chip_haul', grindStump: true, nearStructure: true }],
  });

  assert.equal(pine.totalDbh, 12);
  assert.equal(pine.jobCost.toFixed(2), '397.58');
  assert.equal(pine.recommendedPrice.toFixed(2), '530.10');
  assert.equal(pine.pricePerInch.toFixed(2), '44.18');

  assert.equal(oak.totalDbh, 24);
  assert.equal(oak.jobCost.toFixed(2), '4897.39');
  assert.equal(oak.recommendedPrice.toFixed(2), '6529.85');

  const flatQuoteOnOak = pine.pricePerInch * oak.totalDbh;
  assert.equal(flatQuoteOnOak.toFixed(2), '1060.21');
  assert.ok(flatQuoteOnOak < oak.jobCost, "the flat per-inch quote should price below the oak's own break-even cost");
  assert.equal((oak.jobCost - flatQuoteOnOak).toFixed(2), '3837.18');
  assert.equal((oak.recommendedPrice - flatQuoteOnOak).toFixed(2), '5469.65');
  assert.equal((oak.recommendedPrice / pine.recommendedPrice).toFixed(2), '12.32');

  assert.match(html, /\$397\.58/);
  assert.match(html, /\$530\.10/);
  assert.match(html, /\$44\.18/);
  assert.match(html, /\$4,897\.39/);
  assert.match(html, /\$6,529\.85/);
  assert.match(html, /\$1,060\.21/);
  assert.match(html, /\$3,837\.18/);
  assert.match(html, /\$5,469\.65/);
  assert.match(html, /12\.32/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-inch-rate\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-inch-rate\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-to-bid-tree-removal\.html"/);
});
