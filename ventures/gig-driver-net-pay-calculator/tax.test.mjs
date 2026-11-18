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

test('the $400 floor applies to 92.35% of profit, as on Schedule SE', () => {
  // $420 of profit is $387.87 of net earnings from self-employment: none owed.
  assert.equal(selfEmploymentTax(420).total, 0);
  assert.equal(selfEmploymentTax(433).total, 0);
  // $434 of profit is $400.80 of net earnings: SE tax is due on all of it.
  close(selfEmploymentTax(434).total, 434 * 0.9235 * 0.153);
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

// Red-team guards, 2026-11-10: each test below failed against a seeded mutant
// that the suite above let through.
test('rejects null and non-numeric text, not just blanks', () => {
  assert.throws(() => compareDeductions({ ...base, grossIncome: null }), /Gross income must be a number/);
  assert.throws(() => compareDeductions({ ...base, grossIncome: 'abc' }), /Gross income must be a number/);
  assert.throws(() => compareDeductions({ ...base, mpg: undefined }), /Miles per gallon must be a number/);
});

test('under the $400 floor every part of self-employment tax is zero', () => {
  assert.deepEqual(selfEmploymentTax(100), { base: 0, socialSecurity: 0, medicare: 0, total: 0, halfDeduction: 0 });
});

test('keep is net profit minus total tax for both methods', () => {
  const r = compareDeductions(base);
  for (const m of [r.standard, r.actual]) close(m.keep, m.netProfit - m.totalTax);
  assert.ok(r.standard.keep < r.standard.netProfit);
});

test('break-even per mile is the actual car cost divided by business miles', () => {
  const r = compareDeductions({ ...base, totalMiles: 30000 });
  close(r.breakEvenPerMile, r.actualCar / 25000);
  assert.equal(compareDeductions({ ...base, businessMiles: 0, totalMiles: 0 }).breakEvenPerMile, null);
});

test('other wages default to none: a profit at the wage base pays full Social Security', () => {
  // Gross chosen so standard-method net earnings sit just under the 2026 base,
  // where even $1 of assumed W-2 wages would shave the Social Security part.
  const raw = { ...base, grossIncome: 220000, incomeTaxRatePercent: 0 };
  delete raw.otherWages;
  const r = compareDeductions(raw);
  close(r.standard.se.socialSecurity, Math.min(r.standard.se.base, DEFAULTS_2026.socialSecurityWageBase) * 0.124);
});

// Real defect, 2026-11-10: the page passes '' for a box the driver clears, and
// the optional boxes (parking, other costs, W-2 wages, rate, wage base) threw
// "must be a number" instead of falling back to their defaults.
test('a cleared optional box falls back to its default instead of erroring', () => {
  const filled = compareDeductions(base);
  const cleared = compareDeductions({ ...base, parkingTolls: '', otherWages: '', standardRate: '', socialSecurityWageBase: '' });
  close(cleared.standard.totalTax, filled.standard.totalTax);
  close(compareDeductions({ ...base, otherDeductible: '' }).standard.netProfit, filled.standard.netProfit + 600);
  close(compareDeductions({ ...base, incomeTaxRatePercent: '' }).standard.incomeTax, 0);
  // Required boxes still refuse a blank.
  assert.throws(() => compareDeductions({ ...base, businessMiles: '' }), /Business miles/);
});

test('the page says which income-tax deductions it leaves out, QBI included', () => {
  assert.match(html, /qualified business income/i);
});

test('clearing any box on the page gives a named error or finite figures, never NaN', () => {
  const ids = JSON.parse(html.match(/const IDS = (\[[^\]]*\])/)[1]);
  assert.ok(ids.length >= 14);
  const finite = (value, path) => {
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) finite(v, `${path}.${k}`);
    else if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} is ${value}`);
  };
  for (const id of ids) {
    let r;
    try { r = compareDeductions({ ...base, totalMiles: 30000, [id]: '' }); }
    catch (e) { assert.match(e.message, /must|less than/, `${id}: ${e.message}`); continue; }
    finite({ ...r, breakEvenPerMile: r.breakEvenPerMile ?? 0 }, id);
  }
});
