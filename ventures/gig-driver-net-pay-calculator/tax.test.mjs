import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareDeductions, selfEmploymentTax, DEFAULTS_2026 } from './tax.mjs';

const html = readFileSync(new URL('./tax.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

const base = { grossIncome: 40000, businessMiles: 25000, mpg: 28, gasPrice: 3.49, maintenancePerMile: 0.07,
  insuranceAnnual: 1800, depreciationAnnual: 3000, parkingTolls: 0, otherDeductible: 600, incomeTaxRatePercent: 12 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);

test('self-employment tax is 15.3% of 92.35% of profit under the wage base', () => {
  const se = selfEmploymentTax(10000);
  close(se.total, 10000 * 0.9235 * 0.153);
  close(se.halfDeduction, se.total / 2);
});

test('no self-employment tax under $400 of profit', () => {
  assert.equal(selfEmploymentTax(399).total, 0);
  assert.equal(selfEmploymentTax(-5000).total, 0);
});

test('other wages use up the Social Security base, Medicare keeps going', () => {
  const se = selfEmploymentTax(50000, { otherWages: DEFAULTS_2026.socialSecurityWageBase });
  assert.equal(se.socialSecurity, 0);
  close(se.medicare, 50000 * 0.9235 * 0.029);
});

test('standard deduction is miles times rate; actual shares insurance and depreciation by business use', () => {
  const r = compareDeductions({ ...base, totalMiles: 30000 });
  close(r.standardCar, 25000 * 0.725);
  close(r.runningCost, 25000 * (3.49 / 28 + 0.07));
  close(r.actualCar, r.runningCost + (1800 + 3000) * (25000 / 30000));
});

test('the method with the larger deduction owes less tax', () => {
  const r = compareDeductions(base);
  assert.equal(r.better, r.standard.deduction > r.actual.deduction ? 'standard' : 'actual');
  assert.ok(r.taxDifference > 0);
  close(r.standard.quarterly * 4, r.standard.totalTax);
});

test('a heavy-depreciation car beats the standard rate', () => {
  const r = compareDeductions({ ...base, depreciationAnnual: 14000, mpg: 14 });
  assert.equal(r.better, 'actual');
});

test('income tax rate 0 leaves only self-employment tax', () => {
  const r = compareDeductions({ ...base, incomeTaxRatePercent: 0 });
  close(r.standard.totalTax, r.standard.se.total);
});

test('rejects bad input', () => {
  assert.throws(() => compareDeductions({ ...base, grossIncome: '' }), /Gross income/);
  assert.throws(() => compareDeductions({ ...base, mpg: 0 }), /Miles per gallon/);
  assert.throws(() => compareDeductions({ ...base, totalMiles: 100 }), /Total miles/);
  assert.throws(() => compareDeductions({ ...base, incomeTaxRatePercent: 100 }), /Income tax rate/);
});

test('page carries disclaimer, privacy note, and is linked and in the sitemap', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not tax, financial, or legal advice/i);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<link rel="canonical" href="tax\.html">/);
  assert.match(html, /from '\.\/tax\.mjs'/);
  assert.match(index, /href="tax\.html"/);
  assert.match(sitemap, /gig-driver-net-pay-calculator\/tax\.html/);
});

test('the page worked example matches the calculation', () => {
  const r = compareDeductions({ grossIncome: 40000, businessMiles: 25000, mpg: 28, gasPrice: 3.49, maintenancePerMile: 0.07,
    insuranceAnnual: 1800, depreciationAnnual: 3000, otherDeductible: 600, incomeTaxRatePercent: 12 });
  for (const text of [`$${Math.round(r.standard.totalTax).toLocaleString('en-US')}`, `$${Math.round(r.actual.totalTax).toLocaleString('en-US')}`]) {
    assert.ok(html.includes(text), `page should state ${text}`);
  }
});
