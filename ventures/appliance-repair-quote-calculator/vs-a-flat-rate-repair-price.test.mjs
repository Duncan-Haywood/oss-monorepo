import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-rate-repair-price.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or business advice/);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (a flat rate repair
  // price book), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as the sibling ventures' generic-
  // method pages, and distinct from this venture's own vs-housecall-pro.html.
  assert.doesNotMatch(html, /Housecall Pro/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-rate-repair-price\.html">/);
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
  const { calculateQuote } = await import('./calc.mjs');

  const easy = {
    diagnosticHours: 0.5, repairHours: 1.5, travelHours: 0.5, laborRate: 80,
    tripCost: 35, partsCost: 120, partsMarkup: 25, callbackReserve: 5,
    overheadRate: 10, targetMargin: 30,
  };
  // Same "refrigerator not cooling" complaint, but the sealed-system
  // version of it: more repair hours, a far more expensive part.
  const hard = {
    ...easy,
    repairHours: 3.5, partsCost: 450,
  };

  const easyResult = calculateQuote(easy);
  assert.equal(easyResult.cost.toFixed(2), '444.68');
  assert.equal(easyResult.target.toFixed(2), '635.25');

  const hardResult = calculateQuote(hard);
  assert.equal(hardResult.cost.toFixed(2), '1105.91');
  assert.equal(hardResult.target.toFixed(2), '1579.88');

  const flatPriceForHard = easyResult.target;
  assert.ok(flatPriceForHard < hardResult.cost, 'the flat price should quote below the hard call\'s own break-even cost');
  assert.equal((hardResult.cost - flatPriceForHard).toFixed(2), '470.66');
  assert.equal((hardResult.target - flatPriceForHard).toFixed(2), '944.63');
  assert.ok(hardResult.target / easyResult.target > 2.4);

  assert.match(html, /\$444\.68/);
  assert.match(html, /\$635\.25/);
  assert.match(html, /\$1,105\.91/);
  assert.match(html, /\$1,579\.88/);
  assert.match(html, /\$470\.66/);
  assert.match(html, /\$944\.63/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-a-flat-rate-repair-price\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-rate-repair-price\.html/);
});

test('the comparison page links back to the calculator and to the repair-vs-replace guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="should-i-repair-or-replace-this-appliance\.html"/);
});
