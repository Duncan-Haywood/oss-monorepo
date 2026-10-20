import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-checking-the-deadline-yourself.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/);
});

test('carries the nothing-uploaded disclaimer', () => {
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
});

// This page compares against checking the final-paycheck deadline by hand
// -- a generic method every employer/HR team already has, not a company
// or product this could be mistaken for -- so it names no company and
// carries no affiliation disclaimer. It is listed in
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT instead.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /not affiliated with/i);
  assert.doesNotMatch(html, /Gusto|ADP|Paychex|Rippling|BambooHR|Workday/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-checking-the-deadline-yourself\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-checking-the-deadline-yourself\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-checking-the-deadline-yourself\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="index\.html">/);
});

// The worked-example figures are this page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The first scenario matches
// index.html's own shipped "load an example" button exactly.
test('the worked-example figures match calc.mjs run against the stated scenarios', async () => {
  const { finalPaycheckDeadline, formatDate } = await import('./calc.mjs');

  const caNoNotice = finalPaycheckDeadline({
    state: 'CA',
    separationType: 'voluntary',
    separationDate: '2026-10-01',
    noticeGiven: false,
    accruedPtoHours: 40,
    hourlyRate: 28,
  });
  assert.equal(formatDate(caNoNotice.deadlineDate), 'Sun, Oct 4, 2026');
  assert.equal(caNoNotice.deadlineDescription, '3 calendar days after separation');
  assert.equal(caNoNotice.ptoPayoutAmount, 1120);
  assert.equal(caNoNotice.ptoPayoutRequired, true);

  const caWithNotice = finalPaycheckDeadline({
    state: 'CA',
    separationType: 'voluntary',
    separationDate: '2026-10-01',
    noticeGiven: true,
    accruedPtoHours: 40,
    hourlyRate: 28,
  });
  assert.equal(formatDate(caWithNotice.deadlineDate), 'Thu, Oct 1, 2026');
  assert.equal(caWithNotice.deadlineDescription, 'the day of separation');

  const nyFired = finalPaycheckDeadline({
    state: 'NY',
    separationType: 'involuntary',
    separationDate: '2026-10-01',
    nextPaydayDate: '2026-10-10',
  });
  assert.equal(formatDate(nyFired.deadlineDate), 'Sat, Oct 10, 2026');
  assert.equal(nyFired.deadlineDescription, 'the next regularly scheduled payday');
  assert.equal(nyFired.ptoPayoutRequired, false);

  assert.match(html, /Sun, Oct 4, 2026/);
  assert.match(html, /Thu, Oct 1, 2026/);
  assert.match(html, /Sat, Oct 10, 2026/);
  assert.match(html, /\$1,120\.00/);
});
