import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-saturday-special-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or health-department advice/);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat per-unit
  // Saturday-special price), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-servicecore.html,
  // which does name a product and carries its own clause.
  assert.doesNotMatch(html, /ServiceCore/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-saturday-special-price\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.equal(question['@type'], 'Question');
    assert.equal(question.acceptedAnswer['@type'], 'Answer');
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

test('the worked-example figures match calc.mjs on the shipped fleet', async () => {
  const { calculateQuote } = await import('./calc.mjs');

  const units = [
    { name: 'Standard portable restroom', quantity: 4, rentPerDay: 18, serviceEach: 28 },
    { name: 'Wheelchair-accessible unit', quantity: 1, rentPerDay: 40, serviceEach: 38 },
  ];
  const base = {
    units,
    deliveryFee: 85,
    pickupFee: 85,
    milesOneWay: 18,
    ratePerMile: 3.5,
    weekendPremiumPct: 0,
    consumablesPerUnit: 8,
    otherCost: 0,
    overheadRate: 12,
    targetMargin: 25,
  };

  // The genuine weekend booking: Friday drop through Sunday pickup is three
  // days on site, not one, plus one extra mid-weekend pump-out.
  const weekend = calculateQuote({ ...base, daysOnSite: 3, serviceVisits: 1 });
  assert.equal(weekend.totalCost.toFixed(2), '1061.76');
  assert.equal(weekend.price.toFixed(2), '1415.68');

  // A flat Saturday-special quote: a single advertised per-unit price times
  // the same five units, with no view of days on site, pump-outs, or the
  // two round trips.
  const flatPerUnit = 150;
  const totalUnits = units.reduce((sum, unit) => sum + unit.quantity, 0);
  assert.equal(totalUnits, 5);
  const flatQuote = flatPerUnit * totalUnits;
  assert.equal(flatQuote, 750);

  assert.ok(flatQuote < weekend.totalCost, 'the flat quote should undercut the weekend job\'s own break-even cost');
  assert.equal((weekend.totalCost - flatQuote).toFixed(2), '311.76');
  assert.equal((weekend.price - flatQuote).toFixed(2), '665.68');

  assert.match(html, /\$1,061\.76/);
  assert.match(html, /\$1,415\.68/);
  assert.match(html, /\$750/);
  assert.match(html, /\$311\.76/);
  assert.match(html, /\$665\.68/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-saturday-special-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-saturday-special-price\.html/);
});

test('the comparison page links back to the calculator and to the fleet-size guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-many\.html"/);
});
