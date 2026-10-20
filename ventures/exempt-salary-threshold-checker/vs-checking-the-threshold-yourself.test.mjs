import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-the-threshold-yourself.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/);
});

test('carries the nothing-uploaded disclaimer', () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

// This page compares against checking the FLSA threshold by hand -- a
// generic method every employer/HR team already has, not a company or
// product this could be mistaken for -- so it names no company and carries
// no affiliation disclaimer. It is listed in platform/pages/clauses.mjs's
// COMPARISON_DISCLAIMER_EXEMPT instead. Same discipline as
// 1099-k-threshold-checker's own vs-checking-the-threshold-yourself.html.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /not affiliated with/i);
  assert.doesNotMatch(html, /Gusto|ADP|Paychex|Rippling|BambooHR|Workday/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-the-threshold-yourself\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-checking-the-threshold-yourself\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-checking-the-threshold-yourself\.html/);
});

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example figures are this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The professional-exemption
// scenario matches index.html's own shipped "load an example" button
// exactly, so a reader who opens the checker and clicks it sees this
// page's own first worked-example row.
test('the worked-example figures match calc.mjs run against the stated scenarios', async () => {
  const { exemptionOutcome } = await import('./calc.mjs');

  const professional = exemptionOutcome({
    jurisdiction: 'NY_DOWNSTATE',
    category: 'professional',
    weeklySalary: 900,
  });
  assert.equal(professional.applicableThreshold, 684);
  assert.equal(professional.usesFederalOnly, true);
  assert.equal(professional.meetsThreshold, true);
  assert.equal(professional.shortfall, 0);

  const administrative = exemptionOutcome({
    jurisdiction: 'NY_DOWNSTATE',
    category: 'executive_administrative',
    weeklySalary: 900,
  });
  assert.equal(administrative.applicableThreshold, 1275);
  assert.equal(administrative.usesFederalOnly, false);
  assert.equal(administrative.meetsThreshold, false);
  assert.equal(administrative.shortfall, 375);

  assert.match(html, /\$684\.00/);
  assert.match(html, /\$1,275\.00/);
  assert.match(html, /\$375\.00/);
  assert.match(html, /\$900/);
});
