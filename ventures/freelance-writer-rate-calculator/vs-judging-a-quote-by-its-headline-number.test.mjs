import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-judging-a-quote-by-its-headline-number.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('names no vendor or competing product', () => {
  // Compares against a generic manual habit (judging a quote by its
  // headline number), not a named competitor, so this page claims the
  // no-vendor-named exemption in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT set rather than carrying a
  // not-affiliated clause.
  assert.doesNotMatch(html, /not\s+affiliated\s+with/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-judging-a-quote-by-its-headline-number\.html">/);
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

test('the worked-example figures match calc.mjs on the shipped example inputs', async () => {
  const { writerRateOutcome, money } = await import('./calc.mjs');

  // The exact figures index.html's own "Load an example" button loads.
  const result = writerRateOutcome({
    wordCount: 1500,
    perWordRate: 0.20,
    flatFee: 500,
    writingWordsPerHour: 500,
    researchHours: 4,
    revisionRounds: 2,
    hoursPerRevision: 1,
    targetHourlyRate: 75,
    isGhostwritten: false,
  });

  assert.equal(result.totalHours, 9);
  assert.equal(result.perWordTotal, 300);
  assert.equal(result.betterOption, 'flat-fee');
  assert.equal(money(result.perWordHourly), '$33.33');
  assert.equal(money(result.flatFeeHourly), '$55.56');
  assert.equal(money(result.hourlyDifference), '$22.22');
  assert.equal(money(result.requiredPerWordRate), '$0.45');
  assert.equal(result.requiredFlatFee, 675);

  assert.match(html, /\$33\.33\/hr/);
  assert.match(html, /\$55\.56\/hr/);
  assert.match(html, /\$22\.22\/hr/);
  assert.match(html, /\$0\.45\/word/);
  assert.match(html, /\$675 flat fee/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-judging-a-quote-by-its-headline-number\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-judging-a-quote-by-its-headline-number\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});
