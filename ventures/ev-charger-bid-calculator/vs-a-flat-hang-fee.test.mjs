import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-hang-fee.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or business advice/i);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat hang fee),
  // not a named product, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- there is no company to disclaim a relationship with. Same
  // discipline as the sibling ventures' generic-method pages, and distinct
  // from this venture's own vs-servicetitan.html / vs-workiz.html pages.
  assert.doesNotMatch(html, /ServiceTitan|Workiz|Jobber|ServiceMonster/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/ev-charger-bid-calculator\/vs-a-flat-hang-fee\.html">/);
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
  const { calculateBid, defaultInputs } = await import('./calc.mjs');
  const garage = () => ({ ...defaultInputs(), proposedPrice: '' });

  const easy = calculateBid(garage());
  assert.equal(easy.price.toFixed(2), '1263.36');
  assert.equal(easy.totalCost.toFixed(2), '947.52');
  assert.equal(easy.breakEvenPrice.toFixed(2), '947.52');

  // Same 48 A charger -- "the same fee" -- but a detached-garage trench and
  // a service upgrade instead of a 25-foot indoor spare-slot hang.
  const hard = calculateBid({
    ...garage(),
    location: 'detached_garage',
    runFeet: 70,
    trenchFeet: 60,
    panelWork: 'service_upgrade',
  });
  assert.equal(hard.price.toFixed(2), '4586.61');
  assert.equal(hard.totalCost.toFixed(2), '3439.95');

  const flatFeeForHard = easy.price;
  assert.equal(flatFeeForHard.toFixed(2), '1263.36');
  assert.ok(flatFeeForHard < hard.totalCost, 'the flat fee should quote below the hard job\'s own break-even cost');
  assert.equal((hard.totalCost - flatFeeForHard).toFixed(2), '2176.59');
  assert.equal((hard.price - flatFeeForHard).toFixed(2), '3323.25');
  assert.ok(hard.price / easy.price > 3.5);

  assert.match(html, /\$1,263\.36/);
  assert.match(html, /\$947\.52/);
  assert.match(html, /\$4,586\.61/);
  assert.match(html, /\$3,439\.95/);
  assert.match(html, /\$2,176\.59/);
  assert.match(html, /\$3,323\.25/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-hang-fee\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-hang-fee\.html/);
});

test('the comparison page links back to the calculator and to the pricing walkthrough', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="how-much-to-charge\.html"/);
});
