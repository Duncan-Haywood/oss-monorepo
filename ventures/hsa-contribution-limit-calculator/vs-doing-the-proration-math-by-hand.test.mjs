import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-doing-the-proration-math-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, legal, or financial advice/);
});

test('carries the nothing-uploaded disclaimer', () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

// This page compares against doing the proration/last-month-rule arithmetic
// by hand -- a generic method every filer already has, not a company or
// product this could be mistaken for -- so it names no company and carries
// no affiliation disclaimer. It is listed in platform/pages/clauses.mjs's
// COMPARISON_DISCLAIMER_EXEMPT instead. Same discipline as
// 1099-k-threshold-checker's vs-checking-the-threshold-yourself.html.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /not affiliated with/i);
  assert.doesNotMatch(html, /Fidelity|TurboTax|H&R Block|Optum|HealthEquity|Lively/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-doing-the-proration-math-by-hand\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-doing-the-proration-math-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-doing-the-proration-math-by-hand\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example numbers are this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The 6-month/family/age-55
// scenario matches index.html's own shipped "load example" button exactly,
// so a reader who opens the calculator and clicks it sees this page's own
// worked example.
test('the worked-example figures match calc.mjs run against the stated scenarios', async () => {
  const { contributionLimitOutcome } = await import('./calc.mjs');

  const proratedExample = contributionLimitOutcome({
    coverage: 'family',
    eligibleMonths: 6,
    age55Plus: true,
    useLastMonthRule: false,
  });
  assert.equal(proratedExample.baseLimit, 4375);
  assert.equal(proratedExample.catchUpLimit, 500);
  assert.equal(proratedExample.totalLimit, 4875);

  const lastMonthRuleExample = contributionLimitOutcome({
    coverage: 'family',
    eligibleMonths: 6,
    age55Plus: true,
    useLastMonthRule: true,
  });
  assert.equal(lastMonthRuleExample.baseLimit, 8750);
  assert.equal(lastMonthRuleExample.catchUpLimit, 1000);
  assert.equal(lastMonthRuleExample.totalLimit, 9750);

  // The "common hand-check error" figure this page names: forgetting to
  // prorate the catch-up (adding the full $1,000 to the correctly prorated
  // base), which the page states overstates the total by $500.
  const handCheckError = proratedExample.baseLimit + 1000;
  assert.equal(handCheckError, 5375);
  assert.equal(handCheckError - proratedExample.totalLimit, 500);

  assert.match(html, /\$4,375\.00/);
  assert.match(html, /\$500\.00/);
  assert.match(html, /\$4,875\.00/);
  assert.match(html, /\$5,375\.00/);
  assert.match(html, /\$9,750\.00/);
  assert.match(html, /\$8,750\.00/);
  assert.match(html, /\$1,000\.00/);
});
