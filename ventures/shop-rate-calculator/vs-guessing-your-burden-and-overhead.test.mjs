import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-guessing-your-burden-and-overhead.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, engineering, or fire-safety advice/i);
});

test('names no vendor, competing calculator, or field-service platform', () => {
  // This page compares against a generic pricing habit (the 20%/10% rule of
  // thumb), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Pinning the absence of a competitor name here is what
  // keeps that exemption honest: an edit that later named one would need to
  // add the disclaimer and leave this exemption, and this test would catch
  // the page claiming both at once.
  assert.doesNotMatch(html, /ServiceTitan|Housecall|Jobber|Workiz/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="vs-guessing-your-burden-and-overhead\.html">/);
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

test('every FAQPage answer is on the page verbatim', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    const answer = question.acceptedAnswer.text;
    assert.ok(html.includes(`<p>${answer}</p>`), `FAQ answer for "${question.name}" is not on the page verbatim`);
  }
});

test('the worked-example figures match calc.mjs on the shipped defaults', async () => {
  const { calculateShopRate } = await import('./calc.mjs');
  const result = calculateShopRate({
    hourlyWage: 28,
    fieldCrewCount: 3,
    paidHoursPerWeek: 40,
    paidWeeksPerYear: 52,
    paidDaysOffPerYear: 15,
    nonBillablePercent: 20,
    payrollTaxPercent: 10,
    workersCompPercent: 8,
    liabilityInsurancePercent: 2,
    benefitsPerYear: 4800,
    vehicleToolsPerYear: 9600,
    ownerAdminSalary: 65000,
    officeRentUtilities: 9000,
    softwareAccountingLegal: 4800,
    marketingAndLeads: 7200,
    insuranceLicensesOther: 6000,
    annualMaterialAndSubCost: 180000,
    targetMargin: 12,
  });
  assert.ok(result.ok);
  assert.equal(result.burdenRate.toFixed(1), '92.0');
  assert.equal(result.overheadRate.toFixed(1), '21.3');
  assert.equal(result.billRatePerHour.toFixed(2), '74.07');

  // The naive 20%/10% guess, applied to the same wage and target margin.
  const naiveLoaded = 28 * 1.2 * 1.1;
  const naiveBillRate = naiveLoaded / (1 - 0.12);
  assert.equal(naiveBillRate.toFixed(2), '42.00');
  assert.equal((result.billRatePerHour - naiveBillRate).toFixed(2), '32.07');

  assert.match(html, /\$74\.07/);
  assert.match(html, /\$42\.00/);
  assert.match(html, /\$32\.07/);
  assert.match(html, /92% payroll burden/);
  assert.match(html, /21\.3% overhead rate/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.?\/?vs-guessing-your-burden-and-overhead\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-guessing-your-burden-and-overhead\.html/);
});

test('the comparison page links back to the calculator and to the rate walkthrough', () => {
  assert.match(html, /<a href="index\.html">/);
  assert.match(html, /href="what-should-i-charge-per-hour\.html"/);
});
