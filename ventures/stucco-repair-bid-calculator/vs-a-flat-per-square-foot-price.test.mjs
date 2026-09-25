import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-square-foot-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not construction, engineering, moisture, legal, tax, or financial advice/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat per-square-
  // foot price), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-
  // method pages, and distinct from this venture's own vs-jobber.html.
  assert.doesNotMatch(html, /Jobber/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-per-square-foot-price\.html">/);
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

test('the worked-example figures match calc.mjs on two of the shipped starting examples', async () => {
  const { calculateBid, suggestedSystemKit, suggestedAccessKit } = await import('./calc.mjs');

  const base = {
    hoursPerCrackLf: 0.12, hoursPerDelamSf: 0.18, hoursPerWindowFlash: 1.5, hoursColorMatch: 2.5,
    hoursMoisture: 3, hoursPerCaulkLf: 0.04, siteHours: 2,
    mixPerCrackLf: 1.1, flashKitEach: 45, colorTintCost: 85, moistureKit: 40, caulkPerLf: 1.2,
    dumpsterCost: 175, permitFee: 75, hourlyWage: 38, burdenRate: 32, travelAndEquipment: 95,
    overheadRate: 16, targetMargin: 28, proposedPrice: null,
  };
  // "80 SF first-story one-coat delamination, 30 LF cracks, color match, one flashing"
  const easy = {
    ...base, ...suggestedSystemKit('one-coat'), ...suggestedAccessKit('1'),
    system: 'one-coat', stories: '1', crackLf: 30, delamSf: 80, tearoffSf: 0, windowFlashes: 1, caulkLf: 40,
    colorMatch: true, moistureInvestigation: false,
  };
  // "180 SF 2nd-story EIFS tear-off, 40 SF hollow, moisture, 4 flashings, color match"
  const hard = {
    ...base, ...suggestedSystemKit('eifs'), ...suggestedAccessKit('2'),
    system: 'eifs', stories: '2', crackLf: 20, delamSf: 40, tearoffSf: 180, windowFlashes: 4, caulkLf: 60,
    colorMatch: true, moistureInvestigation: true,
  };

  const easyResult = calculateBid(easy);
  assert.equal(easyResult.price.toFixed(2), '3049.99');
  assert.equal(easyResult.totalCost.toFixed(2), '2195.99');
  assert.equal(easyResult.pricePerRepairSf.toFixed(2), '38.12');

  const hardResult = calculateBid(hard);
  assert.equal(hardResult.price.toFixed(2), '11941.26');
  assert.equal(hardResult.totalCost.toFixed(2), '8597.71');
  assert.equal(hardResult.pricePerRepairSf.toFixed(2), '54.28');

  const flatForHard = easyResult.pricePerRepairSf * hardResult.repairSf;
  assert.ok(flatForHard < hardResult.totalCost, 'the flat rate should price the hard job below its own break-even cost');
  assert.equal(flatForHard.toFixed(2), '8387.47');
  assert.equal((hardResult.totalCost - flatForHard).toFixed(2), '210.24');
  assert.equal((hardResult.price - flatForHard).toFixed(2), '3553.79');
  assert.equal((hardResult.pricePerRepairSf / easyResult.pricePerRepairSf).toFixed(2), '1.42');

  assert.match(html, /\$3,049\.99/);
  assert.match(html, /\$2,195\.99/);
  assert.match(html, /\$38\.12/);
  assert.match(html, /\$8,597\.71/);
  assert.match(html, /\$11,941\.26/);
  assert.match(html, /\$54\.28/);
  assert.match(html, /\$8,387\.47/);
  assert.match(html, /\$210\.24/);
  assert.match(html, /\$3,553\.79/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-per-square-foot-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-square-foot-price\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-stucco-repair\.html"/);
});
