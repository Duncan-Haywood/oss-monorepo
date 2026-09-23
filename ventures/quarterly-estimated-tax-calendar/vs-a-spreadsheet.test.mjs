import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-spreadsheet.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, legal, or financial advice/);
});

test('names no spreadsheet vendor', () => {
  // This page compares against a generic habit (a spreadsheet), not a named
  // product, so it is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause -- there is no spreadsheet company to disclaim a relationship
  // with. It does cross-link to this venture's own vs-keeper.html by name,
  // which is a different (named-product) comparison page and carries its
  // own "not affiliated" clause there, not here.
  assert.doesNotMatch(html, /Excel|Google Sheets|Airtable/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-spreadsheet\.html">/);
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

test('the real due-date shifts named on the page match quarterDueDates', async () => {
  const { quarterDueDates } = await import('./calc.mjs');

  assert.equal(quarterDueDates(2022).q1, '2022-04-18');
  assert.equal(quarterDueDates(2023).q4, '2024-01-16');
  assert.equal(quarterDueDates(2024).q2, '2024-06-17');

  assert.match(html, /April 18, 2022/);
  assert.match(html, /January 16, 2024/);
  assert.match(html, /June 17, 2024/);
});

test('the safe-harbor worked example matches requiredAnnualPayment on the shipped numbers', async () => {
  const { requiredAnnualPayment } = await import('./calc.mjs');

  // A filer who only ever divides last year's tax by 4.
  const lastYearOnlyPerQuarter = 15000 / 4;
  assert.equal(lastYearOnlyPerQuarter, 3750);

  // The same filer, once an $8,000 current-year estimate is entered too --
  // the 90%-of-this-year branch is lower and wins.
  const r = requiredAnnualPayment({ priorYearTax: 15000, priorYearAGI: 95000, currentYearEstimate: 8000 });
  assert.equal(r.required, 7200);
  assert.match(r.basis, /90% of this year's estimated tax/);
  const correctPerQuarter = r.required / 4;
  assert.equal(correctPerQuarter, 1800);

  const gapPerQuarter = lastYearOnlyPerQuarter - correctPerQuarter;
  assert.equal(gapPerQuarter, 1950);
  assert.equal(gapPerQuarter * 4, 7800);

  assert.match(html, /\$15,000/);
  assert.match(html, /\$3,750/);
  assert.match(html, /\$8,000/);
  assert.match(html, /\$7,200/);
  assert.match(html, /\$1,800/);
  assert.match(html, /\$1,950 a quarter/);
  assert.match(html, /\$7,800 for the year/);
});

test('the catch-up worked example matches computeSchedule on the shipped numbers', async () => {
  const { computeSchedule } = await import('./calc.mjs');

  const schedule = computeSchedule({
    taxYear: 2025,
    priorYearTax: 12000,
    priorYearAGI: 95000,
    withholding: 0,
    asOfDate: '2025-08-01',
    paidByQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 },
  });

  assert.equal(schedule.required, 12000);
  assert.equal(schedule.perQuarter, 3000);
  assert.equal(schedule.pace.requiredToDate, 6000);
  assert.equal(schedule.pace.paidToDate, 0);
  assert.equal(schedule.pace.nextQuarterCatchUp, 6000);
  assert.equal(schedule.pace.nextQuarterCatchUp, schedule.perQuarter * 2);

  assert.match(html, /\$12,000/);
  assert.match(html, /flat quarterly share of <strong>\$3,000<\/strong>/);
  assert.match(html, /twice the flat share/);
  assert.match(html, /\$6,000/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-a-spreadsheet\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-spreadsheet\.html/);
});

test('the comparison page links back to the calculator and to the Keeper comparison', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="vs-keeper\.html"/);
});
