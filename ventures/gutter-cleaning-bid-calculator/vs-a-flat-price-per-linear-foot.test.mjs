import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-price-per-linear-foot.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/);
});

test('names no vendor or competing product', () => {
  // This page compares against a generic pricing habit (a flat price per
  // linear foot), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Distinct from this venture's own vs-jobber.html,
  // which does name a product and carries its own "not affiliated" clause.
  assert.doesNotMatch(html, /Jobber/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/gutter-cleaning-bid-calculator\/vs-a-flat-price-per-linear-foot\.html">/);
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

  const baseCosts = {
    hourlyWage: 22, burdenRate: 30, minutesPer10ft: 8, minutesPerDownspout: 8,
    travelMinutes: 20, disposalPerVisit: 15, equipmentPerVisit: 10,
    overheadRate: 15, targetMargin: 25, visitsPerYear: 2, minimumCharge: 125,
    proposedPrice: null,
  };

  // A one-story house, open gutters, light leaves -- the profile a flat
  // per-foot rate is probably learned from.
  const easy = calculateBid({
    runs: [{ name: 'Whole house', linearFeet: 150, story: '1', pitch: 'low', guards: 'none', debris: 'leaves', downspouts: 5 }],
    ...baseCosts,
  });
  assert.equal(easy.totalLinearFeet, 150);
  assert.equal(easy.hoursPerVisit.toFixed(1), '3.0');
  assert.equal(easy.visitPrice.toFixed(2), '169.89');
  assert.equal(easy.pricePerLinearFoot.toFixed(2), '1.13');

  // The identical 150 feet on a two-story house with mesh guards and
  // needle debris -- same downspout count, same every other cost input.
  const hard = calculateBid({
    runs: [{ name: 'Whole house', linearFeet: 150, story: '2', pitch: 'moderate', guards: 'mesh', debris: 'needles', downspouts: 5 }],
    ...baseCosts,
  });
  assert.equal(hard.totalLinearFeet, 150);
  assert.equal(hard.hoursPerVisit.toFixed(1), '14.4');
  assert.equal(hard.visitPrice.toFixed(2), '667.79');
  assert.equal(hard.visitCost.toFixed(2), '500.84');
  assert.equal(hard.pricePerLinearFoot.toFixed(2), '4.45');

  // A rate learned per linear foot from the easy house, applied to the
  // identical footage of the hard house, reproduces the easy house's own
  // price -- because a flat rate times the same footage is that price.
  const flatPriceOnHardFootage = easy.pricePerLinearFoot * hard.totalLinearFeet;
  assert.equal(flatPriceOnHardFootage.toFixed(2), easy.visitPrice.toFixed(2));
  assert.ok(
    flatPriceOnHardFootage < hard.visitCost,
    'the flat-rate price should quote below the two-story house\'s own break-even cost',
  );
  assert.equal((hard.visitCost - flatPriceOnHardFootage).toFixed(2), '330.95');
  assert.equal((hard.visitPrice - flatPriceOnHardFootage).toFixed(2), '497.89');
  assert.equal(((hard.visitPrice - flatPriceOnHardFootage) * 2).toFixed(2), '995.79');

  assert.match(html, /\$169\.89/);
  assert.match(html, /\$1\.13/);
  assert.match(html, /\$500\.84/);
  assert.match(html, /\$667\.79/);
  assert.match(html, /\$4\.45/);
  assert.match(html, /\$330\.95/);
  assert.match(html, /\$497\.89/);
  assert.match(html, /\$995\.79/);
  assert.match(html, /3\.0 hours/);
  assert.match(html, /14\.4 hours/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-price-per-linear-foot\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-price-per-linear-foot\.html/);
});

test('the comparison page links back to the calculator and to the two-story guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="two-story-gutter-cleaning-cost\.html"/);
});
