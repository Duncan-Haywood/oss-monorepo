import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-10-cents-a-square-foot-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/i);
});

test('names no vendor or competing platform', () => {
  // This page compares against a generic pricing habit (a flat rate per
  // square foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as this venture's own vs-jobber.html
  // and vs-gorilladesk.html, which do name a product and carry their own
  // "not affiliated" clauses.
  assert.doesNotMatch(html, /Jobber|GorillaDesk|ServiceTitan|Housecall/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/pressure-washing-bid-calculator\/vs-a-flat-10-cents-a-square-foot-price\.html">/);
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

test('the worked-example figures match calc.mjs on a driveway-only job vs. a siding-heavy add-on job', async () => {
  const { calculateBid } = await import('./calc.mjs');

  const rates = {
    hourlyWage: 22,
    burdenRate: 25,
    roundTripMinutes: 40,
    setupMinutes: 20,
    waterCost: 8,
    equipmentWear: 15,
    otherCost: 0,
    overheadRate: 15,
    targetMargin: 25,
    minimumJob: 175,
  };

  // The job the flat rate is built on: a driveway-only wash, large enough
  // that the $175 minimum job never binds.
  const easy = calculateBid({
    ...rates,
    surfaces: [
      { name: 'Concrete driveway', squareFeet: 2000, productionRate: 1000, chemicalCost: 2000 * 0.015 },
    ],
  });
  assert.equal(easy.totalSquareFeet, 2000);
  assert.equal(easy.minimumApplied, false);
  assert.equal(easy.bidPrice.toFixed(2), '207.77');
  assert.equal(easy.breakEvenPrice.toFixed(2), '155.82');

  // The add-on job: the same small driveway call-out, plus a full siding
  // wash once the crew is already on-site. Siding's production rate is
  // half the driveway's, so it dominates the wash hours even though the
  // driveway is what the customer originally called about.
  const hard = calculateBid({
    ...rates,
    surfaces: [
      { name: 'Concrete driveway', squareFeet: 300, productionRate: 1000, chemicalCost: 300 * 0.015 },
      { name: 'House siding (soft wash)', squareFeet: 2400, productionRate: 500, chemicalCost: 2400 * 0.02 },
    ],
  });
  assert.equal(hard.totalSquareFeet, 2700);
  assert.equal(hard.surfaces[1].hoursShare.toFixed(1), '94.1');
  assert.equal(hard.bidPrice.toFixed(2), '372.98');
  assert.equal(hard.breakEvenPrice.toFixed(2), '279.74');

  // The rate is fit to the easy job by construction: its own price divided
  // by its own square footage, applied to the hard job's total square
  // footage -- a flat per-square-foot rate has no line for which surfaces
  // that footage is made of.
  const rate = easy.bidPrice / easy.totalSquareFeet;
  assert.equal(rate.toFixed(4), '0.1039');
  const flatOnHard = rate * hard.totalSquareFeet;
  assert.equal(flatOnHard.toFixed(2), '280.48');
  assert.ok(flatOnHard > hard.breakEvenPrice, 'the flat rate should still clear the hard job\'s own break-even cost');
  assert.equal((flatOnHard - hard.breakEvenPrice).toFixed(2), '0.75');
  assert.equal((hard.bidPrice - flatOnHard).toFixed(2), '92.50');
  const realizedMargin = (flatOnHard - hard.breakEvenPrice) / flatOnHard * 100;
  assert.equal(realizedMargin.toFixed(1), '0.3');

  assert.match(html, /\$207\.77/);
  assert.match(html, /\$155\.82/);
  assert.match(html, /\$0\.1039/);
  assert.match(html, /\$372\.98/);
  assert.match(html, /\$279\.74/);
  assert.match(html, /\$280\.48/);
  assert.match(html, /\$0\.75/);
  assert.match(html, /\$92\.50/);
  assert.match(html, /94% of the wash hours/);
  assert.match(html, /0\.3% margin/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-10-cents-a-square-foot-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-10-cents-a-square-foot-price\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-to-charge\.html"/);
});
