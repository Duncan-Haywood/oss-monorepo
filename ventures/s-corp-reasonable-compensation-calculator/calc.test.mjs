import test from 'node:test';
import assert from 'node:assert/strict';
import {
  costApproach, marketApproach, incomeApproach, payrollTaxOnWage,
  estimateReasonableCompensation, wageFor, money, SS_WAGE_BASE,
} from './calc.mjs';

test('costApproach sums duty wages weighted by time and full-time ratio', () => {
  const { amount, percentTotal } = costApproach([
    { occupation: 'general-operations-manager', percentOfTime: 60 },
    { occupation: 'bookkeeping-clerk', percentOfTime: 40 },
  ], 40);
  // 101000*0.6 + 48000*0.4 = 60600 + 19200 = 79800
  assert.equal(amount, 79800);
  assert.equal(percentTotal, 100);
});

test('costApproach scales down for a part-time owner', () => {
  const { amount } = costApproach([{ occupation: 'general-operations-manager', percentOfTime: 100 }], 20);
  assert.equal(amount, 50500);
});

test('costApproach flags duty percentages that do not sum to 100', () => {
  const under = costApproach([{ occupation: 'attorney', percentOfTime: 50 }], 40);
  assert.equal(under.percentTotal, 50);
  const over = costApproach([
    { occupation: 'attorney', percentOfTime: 70 },
    { occupation: 'bookkeeping-clerk', percentOfTime: 70 },
  ], 40);
  assert.equal(over.percentTotal, 140);
});

test('marketApproach reads the primary occupation wage, hours-scaled', () => {
  assert.equal(marketApproach('general-operations-manager', 40), 101000);
  assert.equal(marketApproach('general-operations-manager', 20), 50500);
  assert.equal(marketApproach('unknown-occupation', 40), 0);
});

test('incomeApproach nets a required return off profit, never negative', () => {
  assert.equal(incomeApproach(200000, 500000, 10), 150000);
  assert.equal(incomeApproach(10000, 500000, 10), 0);
  assert.equal(incomeApproach(100000, 0, 10), 100000);
});

test('payrollTaxOnWage: combined 15.3% under the wage base, no additional Medicare below threshold', () => {
  const r = payrollTaxOnWage(100000, { taxYear: 2025, filingStatus: 'single' });
  assert.equal(r.ssTax, 12400);
  assert.equal(r.medicareTax, 2900);
  assert.equal(r.additionalMedicareTax, 0);
  assert.equal(r.total, 15300);
});

test('payrollTaxOnWage: Social Security portion caps at the wage base, Medicare does not', () => {
  const r = payrollTaxOnWage(220000, { taxYear: 2025, filingStatus: 'single' });
  assert.equal(r.ssTax, 176100 * 0.124);
  assert.equal(r.medicareTax, 220000 * 0.029);
  assert.equal(Math.round(r.additionalMedicareTax), 180); // (220000-200000)*0.009
  assert.equal(Math.round(r.total * 100) / 100, Math.round((r.ssTax + r.medicareTax + r.additionalMedicareTax) * 100) / 100);
});

test('payrollTaxOnWage: 2026 wage base is $184,500, distinct from 2025', () => {
  assert.equal(SS_WAGE_BASE[2025], 176100);
  assert.equal(SS_WAGE_BASE[2026], 184500);
  const at2025Base = payrollTaxOnWage(184500, { taxYear: 2025, filingStatus: 'single' });
  const at2026Base = payrollTaxOnWage(184500, { taxYear: 2026, filingStatus: 'single' });
  // Fully inside the higher 2026 base, so none of it is above-the-cap Medicare-only tax
  assert.ok(at2026Base.ssTax > at2025Base.ssTax);
});

test('payrollTaxOnWage: joint filers get the higher $250,000 Additional Medicare threshold', () => {
  const single = payrollTaxOnWage(260000, { taxYear: 2025, filingStatus: 'single' });
  const joint = payrollTaxOnWage(260000, { taxYear: 2025, filingStatus: 'joint' });
  assert.ok(single.additionalMedicareTax > joint.additionalMedicareTax);
  assert.equal(Math.round(joint.additionalMedicareTax), 90); // (260000-250000)*0.009
});

test('estimateReasonableCompensation: income approach does not constrain a highly profitable business', () => {
  const r = estimateReasonableCompensation({
    duties: [{ occupation: 'general-operations-manager', percentOfTime: 100 }],
    primaryOccupation: 'general-operations-manager',
    hoursPerWeek: 40,
    netProfitBeforeComp: 500000,
    capitalInvested: 200000,
    requiredReturnPercent: 10,
    taxYear: 2025,
    filingStatus: 'single',
  });
  assert.equal(r.cost, 101000);
  assert.equal(r.market, 101000);
  assert.equal(r.income, 480000);
  assert.equal(r.low, 101000);
  assert.equal(r.high, 101000);
  assert.ok(r.findings.some((f) => /does not constrain/i.test(f.title)));
});

test('estimateReasonableCompensation: income approach pulls the whole range down for a thinly capitalized business', () => {
  const r = estimateReasonableCompensation({
    duties: [{ occupation: 'general-operations-manager', percentOfTime: 100 }],
    primaryOccupation: 'general-operations-manager',
    hoursPerWeek: 40,
    netProfitBeforeComp: 50000,
    capitalInvested: 200000,
    requiredReturnPercent: 10,
    taxYear: 2025,
    filingStatus: 'single',
  });
  assert.equal(r.income, 30000);
  assert.equal(r.low, 30000);
  assert.equal(r.high, 30000);
  assert.equal(r.lowApproach, 'income');
  assert.equal(r.highApproach, 'income');
  assert.ok(r.findings.some((f) => /lowers the defensible range/i.test(f.title)));
});

test('estimateReasonableCompensation: cost and market approaches can disagree, range spans both', () => {
  const r = estimateReasonableCompensation({
    duties: [
      { occupation: 'attorney', percentOfTime: 50 },
      { occupation: 'bookkeeping-clerk', percentOfTime: 50 },
    ],
    primaryOccupation: 'attorney',
    hoursPerWeek: 40,
    netProfitBeforeComp: 900000,
    capitalInvested: 100000,
    requiredReturnPercent: 10,
    taxYear: 2025,
    filingStatus: 'single',
  });
  // cost = 145000*0.5 + 48000*0.5 = 96500; market = 145000
  assert.equal(r.cost, 96500);
  assert.equal(r.market, 145000);
  assert.equal(r.low, 96500);
  assert.equal(r.high, 145000);
  assert.equal(r.lowApproach, 'cost');
  assert.equal(r.highApproach, 'market');
});

test('estimateReasonableCompensation: payroll-tax delta reflects the actual low/high wage figures', () => {
  const r = estimateReasonableCompensation({
    duties: [{ occupation: 'attorney', percentOfTime: 100 }],
    primaryOccupation: 'attorney',
    hoursPerWeek: 40,
    netProfitBeforeComp: 900000,
    capitalInvested: 0,
    requiredReturnPercent: 10,
    taxYear: 2025,
    filingStatus: 'single',
  });
  assert.equal(r.low, 145000);
  assert.equal(r.high, 145000);
  assert.equal(r.payrollTaxDelta, 0);
});

test('wageFor and money helpers', () => {
  assert.equal(wageFor('attorney'), 145000);
  assert.equal(wageFor('not-a-real-occupation'), 0);
  assert.equal(money(0), '$0');
  assert.equal(money(101000), '$101,000');
  assert.equal(money(-500), '-$500');
});
