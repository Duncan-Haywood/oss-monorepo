import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-189-broken-spring-special.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or engineering advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat $189
  // broken-spring special), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-housecall-pro.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Housecall Pro/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-189-broken-spring-special\.html">/);
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
  const { calculateBid, suggestedLaborHours, suggestedSpringCost } = await import('./calc.mjs');

  const shared = {
    hourlyWage: 28,
    burdenRate: 30,
    costPerMile: 0.75,
    averageMph: 30,
    overheadRate: 15,
    targetMargin: 25,
    afterHoursMultiplier: 1,
    permitCost: 0,
    hardwareCost: 0,
    disposalCost: 0,
    doorCost: 0,
    openerCost: 0,
  };

  // Nearby single door, standard-cycle spring -- the profile a $189 flat
  // special is probably learned from.
  const near = calculateBid({
    ...shared,
    jobType: 'spring_only',
    widthFt: 8, heightFt: 7,
    springCost: suggestedSpringCost(8, false),
    laborHours: suggestedLaborHours('spring_only', 8),
    roundTripMiles: 6,
  });
  assert.equal(near.doorClass, 'single');
  assert.equal(near.springCost, 95);
  assert.equal(near.driveHours, 0.2);
  assert.equal(near.travelCost.toFixed(2), '11.78');
  assert.equal(near.travelShare.toFixed(1), '5.4');
  assert.equal(near.totalCost.toFixed(2), '164.66');
  assert.equal(near.price.toFixed(2), '219.54');

  // Distant double door, high-cycle spring -- the same $189 special quoted
  // sight unseen.
  const far = calculateBid({
    ...shared,
    jobType: 'spring_only',
    widthFt: 16, heightFt: 7,
    springCost: suggestedSpringCost(16, true),
    laborHours: suggestedLaborHours('spring_only', 16),
    roundTripMiles: 42,
  });
  assert.equal(far.doorClass, 'double');
  assert.equal(far.springCost, 280);
  assert.equal(far.driveHours, 1.4);
  assert.equal(far.shopLaborCost.toFixed(2), '45.50');
  assert.equal(far.travelCost.toFixed(2), '82.46');
  assert.equal(far.travelShare.toFixed(1), '13.2');
  assert.ok(far.travelCost > far.shopLaborCost, 'travel should exceed shop labor on the far ticket');
  assert.equal(far.travelEatsJob, true);
  assert.equal(far.totalCost.toFixed(2), '469.15');
  assert.equal(far.price.toFixed(2), '625.54');

  // The same flat $189 special on each ticket.
  const flat = 189;
  const nearProfitAtFlat = flat - near.totalCost;
  const farLossAtFlat = far.totalCost - flat;
  assert.equal(nearProfitAtFlat.toFixed(2), '24.34');
  assert.equal((nearProfitAtFlat / flat * 100).toFixed(1), '12.9');
  assert.equal(farLossAtFlat.toFixed(2), '280.15');
  assert.equal((far.price - flat).toFixed(2), '436.54');

  assert.match(html, /\$164\.66/);
  assert.match(html, /\$219\.54/);
  assert.match(html, /\$11\.78/);
  assert.match(html, /\$24\.34/);
  assert.match(html, /\$469\.15/);
  assert.match(html, /\$625\.54/);
  assert.match(html, /\$82\.46/);
  assert.match(html, /\$45\.50/);
  assert.match(html, /\$280\.15/);
  assert.match(html, /\$436\.54/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-189-broken-spring-special\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-189-broken-spring-special\.html/);
});

test('the comparison page links back to the calculator and to the pricing guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge-for-a-broken-spring\.html"/);
});
