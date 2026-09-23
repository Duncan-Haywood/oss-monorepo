import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-per-room-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat per-room
  // special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-
  // method pages, and distinct from this venture's own vs-servicemonster.html.
  assert.doesNotMatch(html, /ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-per-room-special\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped starting example', async () => {
  const { calculateJob } = await import('./calc.mjs');

  const base = {
    rooms: [
      { name: 'Living room', squareFeet: 320, productionRate: 280, petTreatment: true },
      { name: 'Bedroom', squareFeet: 180, productionRate: 280, petTreatment: true },
      { name: 'Bedroom', squareFeet: 140, productionRate: 280, petTreatment: false },
      { name: 'Bedroom', squareFeet: 120, productionRate: 280, petTreatment: false },
      { name: 'Hall / landing', squareFeet: 60, productionRate: 280, petTreatment: false },
    ],
    upholstery: [],
    stairFlights: 2,
    minutesPerFlight: 12,
    furnitureMoveMinutes: 25,
    travelMinutes: 40,
    extraPassMultiplier: 1,
    hourlyWage: 20,
    burdenRate: 30,
    chemicalsPerSqFt: 0.04,
    petChemistryPerRoom: 12,
    otherJobCost: 12,
    overheadRate: 15,
    targetMargin: 35,
    minimumCharge: 149,
    proposedPrice: null,
  };

  const hard = calculateJob(base);
  assert.equal(hard.totalHours.toFixed(1), '6.2');
  assert.equal(hard.jobCost.toFixed(2), '264.43');
  assert.equal(hard.quotedPrice.toFixed(2), '406.81');
  assert.equal(hard.hiddenHoursShare.toFixed(1), '52.7');

  // Same 5-room, 820 sq ft package -- "the same flat price" -- but the
  // vacant, light-soil, no-stairs, short-drive profile a flat per-room
  // special is actually priced on.
  const easy = calculateJob({
    ...base,
    rooms: base.rooms.map((room) => ({ ...room, petTreatment: false })),
    stairFlights: 0,
    furnitureMoveMinutes: 0,
    travelMinutes: 10,
  });
  assert.equal(easy.totalHours.toFixed(1), '3.1');
  assert.equal(easy.quotedPrice.toFixed(2), '221.64');

  const flatPrice = Math.round(easy.quotedPrice / 5) * 5;
  assert.equal(flatPrice, 220);
  assert.ok(flatPrice < hard.jobCost, 'the flat price should quote below the hard stop\'s own break-even cost');
  assert.equal((hard.jobCost - flatPrice).toFixed(2), '44.43');
  assert.equal((hard.quotedPrice - flatPrice).toFixed(2), '186.81');
  assert.ok(hard.totalHours / easy.totalHours > 1.9);

  assert.match(html, /\$221\.64/);
  assert.match(html, /\$264\.43/);
  assert.match(html, /\$406\.81/);
  assert.match(html, /\$44\.43/);
  assert.match(html, /\$186\.81/);
  assert.match(html, /\$220\b/);
  assert.match(html, /52\.7%/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-per-room-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-per-room-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-price-carpet-cleaning\.html"/);
});
