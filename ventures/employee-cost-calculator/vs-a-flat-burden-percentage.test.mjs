import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-a-flat-burden-percentage.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the full liability disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, accounting, or financial advice/i);
});

// This page compares against a generic pricing method (a flat burden
// percentage), not a named competitor or product, so it names no company.
test('names no competitor product or company', () => {
  assert.doesNotMatch(html, /ADP|Gusto|QuickBooks|Paychex/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-a-flat-burden-percentage\.html">/);
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
  assert.match(indexHtml, /href="\.?\/?vs-a-flat-burden-percentage\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-a-flat-burden-percentage\.html/);
});

test('the comparison page links back to the calculator', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The three worked-example rows are the page's factual claim about the
// calculator's own arithmetic -- if calc.mjs ever changes, this page's
// numbers must be re-derived, not left stale. The "full-time" role matches
// index.html's own shipped default form values exactly, so a reader who
// opens the calculator with nothing changed sees this page's own middle row.
test('the worked-example table figures match compareCosts run against the stated roles', async () => {
  const { compareCosts } = await import('./calc.mjs');

  const shared = {
    ficaPercent: 7.65, futaPercent: 0.6, futaWageBase: 7000,
    sutaPercent: 2.7, sutaWageBase: 9500, workersCompRate: 1.5,
    contractorHourlyRate: 40, contractorHoursPerYear: 2080, contractorAdminAnnual: 75, contractorOneTimeCost: 0,
  };

  const partTime = compareCosts({
    ...shared,
    employeeHourlyWage: 16, employeeHoursPerWeek: 20, employeeWeeksPerYear: 50,
    ptoHolidayPercent: 0, retirementMatchPercent: 0, healthInsuranceMonthly: 0,
    payrollAdminAnnual: 300, onboardingOneTimeCost: 250,
    contractorHourlyRate: 22, contractorHoursPerYear: 1000, contractorAdminAnnual: 50,
  });

  const fullTime = compareCosts({
    ...shared,
    employeeHourlyWage: 28, employeeHoursPerWeek: 40, employeeWeeksPerYear: 52,
    ptoHolidayPercent: 5.8, retirementMatchPercent: 0, healthInsuranceMonthly: 500,
    payrollAdminAnnual: 600, onboardingOneTimeCost: 1200,
  });

  const senior = compareCosts({
    ...shared,
    employeeHourlyWage: 55, employeeHoursPerWeek: 40, employeeWeeksPerYear: 52,
    ptoHolidayPercent: 5.8, retirementMatchPercent: 3, healthInsuranceMonthly: 800,
    payrollAdminAnnual: 900, onboardingOneTimeCost: 3000,
    contractorHourlyRate: 75, contractorAdminAnnual: 100,
  });

  assert.equal(partTime.burdenPercentOfWages.toFixed(2), '12.89');
  assert.equal(partTime.employeeOngoingAnnualCost.toFixed(2), '18062.50');
  assert.equal(fullTime.burdenPercentOfWages.toFixed(2), '26.79');
  assert.equal(fullTime.employeeOngoingAnnualCost.toFixed(2), '73845.38');
  assert.equal(senior.burdenPercentOfWages.toFixed(2), '27.39');
  assert.equal(senior.employeeOngoingAnnualCost.toFixed(2), '145733.30');

  const flat25 = (r) => r.annualWages * 1.25;
  assert.equal((partTime.employeeOngoingAnnualCost - flat25(partTime)).toFixed(2), '-1937.50');
  assert.equal((fullTime.employeeOngoingAnnualCost - flat25(fullTime)).toFixed(2), '1045.38');
  assert.equal((senior.employeeOngoingAnnualCost - flat25(senior)).toFixed(2), '2733.30');

  assert.match(html, /12\.89%/);
  assert.match(html, /\$18,062\.50/);
  assert.match(html, /26\.79%/);
  assert.match(html, /\$73,845\.38/);
  assert.match(html, /27\.39%/);
  assert.match(html, /\$145,733\.30/);
  assert.match(html, /\$1,937\.50/);
  assert.match(html, /\$1,045\.38/);
  assert.match(html, /\$2,733\.30/);
});
