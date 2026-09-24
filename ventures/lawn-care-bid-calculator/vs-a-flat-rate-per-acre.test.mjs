import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-per-acre.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
});

test('names no vendor or competing calculator', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // acre), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-
  // method pages, and distinct from this venture's own vs-lmn.html.
  assert.doesNotMatch(html, /LMN|Granum/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-rate-per-acre\.html">/);
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
  const { calculateBid } = await import('./calc.mjs');

  const base = {
    services: [
      { name: 'Turf mowing', unit: 'sqft', quantity: 10000, productionRate: 20000 },
      { name: 'Edging & blowing', unit: 'minutes', quantity: 25, productionRate: 60 },
      { name: 'Bed weeding / detail', unit: 'sqft', quantity: 350, productionRate: 400 },
    ],
    visitsPerWeek: 1,
    serviceWeeksPerYear: 32,
    oneWayMinutes: 18,
    crewSize: 1,
    hourlyWage: 18,
    burdenRate: 25,
    fuelPerVisit: 8,
    dumpPerVisit: 0,
    equipmentMonthly: 40,
    otherMonthly: 0,
    overheadRate: 12,
    targetMargin: 25,
    proposedPrice: null,
  };

  const hard = calculateBid(base);
  assert.equal(hard.hoursPerVisit.toFixed(1), '2.4');
  assert.equal(hard.monthlyPrice.toFixed(2), '459.73');
  assert.equal(hard.breakEvenMonthlyPrice.toFixed(2), '344.80');
  assert.equal(hard.turfAcres.toFixed(4), '0.2296');

  const mow = hard.services.find((s) => s.name === 'Turf mowing');
  const nonMowShare = 100 - mow.hoursShare;
  assert.equal(nonMowShare.toFixed(1), '79.1');

  // Same 10,000 sq ft, 0.23-acre turf area -- "the same flat rate per acre"
  // -- but the open, bed-free, short-hop profile a flat rate is actually
  // set on.
  const easy = calculateBid({
    ...base,
    services: [{ name: 'Turf mowing', unit: 'sqft', quantity: 10000, productionRate: 20000 }],
    oneWayMinutes: 0,
  });
  assert.equal(easy.hoursPerVisit.toFixed(1), '0.5');
  assert.equal(easy.monthlyPrice.toFixed(2), '184.30');
  assert.equal(easy.pricePerAcreMonth.toFixed(2), '802.82');

  const flatMonthly = easy.pricePerAcreMonth * hard.turfAcres;
  assert.equal(flatMonthly.toFixed(2), '184.30');
  assert.ok(flatMonthly < hard.breakEvenMonthlyPrice, 'the flat rate should quote below the harder stop\'s own break-even cost');
  assert.equal((hard.monthlyPrice - flatMonthly).toFixed(2), '275.43');
  assert.equal((hard.breakEvenMonthlyPrice - flatMonthly).toFixed(2), '160.49');
  assert.ok(hard.hoursPerVisit / easy.hoursPerVisit > 4.7);

  assert.match(html, /\$184\.30/);
  assert.match(html, /\$802\.82/);
  assert.match(html, /\$459\.73/);
  assert.match(html, /\$275\.43/);
  assert.match(html, /\$160\.49/);
  assert.match(html, /\$344\.80/);
  assert.match(html, /79\.1%/);
  assert.match(html, /4\.8 times/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-flat-rate-per-acre\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-per-acre\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-to-price-lawn-mowing\.html"/);
});
