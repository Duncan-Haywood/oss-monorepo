import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCosts, employerBurden, ALL_INPUT_IDS, REQUIRED_INPUT_IDS } from './calc.mjs';

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

/** The page's own worked example: a $28/hr full-time role vs. a $40/hr contractor at the same hours. */
const BASE = {
  employeeHourlyWage: 28,
  employeeHoursPerWeek: 40,
  employeeWeeksPerYear: 52,
  ficaPercent: 7.65,
  futaPercent: 0.6,
  futaWageBase: 7000,
  sutaPercent: 2.7,
  sutaWageBase: 9500,
  workersCompRate: 1.5,
  ptoHolidayPercent: 5.8,
  retirementMatchPercent: 0,
  healthInsuranceMonthly: 500,
  payrollAdminAnnual: 600,
  onboardingOneTimeCost: 1200,
  contractorHourlyRate: 40,
  contractorHoursPerYear: 2080,
  contractorAdminAnnual: 75,
  contractorOneTimeCost: 0,
};

test('ALL_INPUT_IDS and REQUIRED_INPUT_IDS agree — every field is required here', () => {
  assert.deepEqual([...REQUIRED_INPUT_IDS], [...ALL_INPUT_IDS]);
});

test('employee annual wages and hours are the straightforward product', () => {
  const result = compareCosts(BASE);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.hoursWorkedPerYear, 2080); // 40 * 52
  near(result.annualWages, 58240); // 28 * 2080
});

test('FUTA and SUTA are capped at the wage base, not a flat percentage of wages', () => {
  const result = compareCosts(BASE);
  assert.equal(result.ok, true);
  const futaItem = result.burden.items.find((i) => i.key === 'futa');
  const sutaItem = result.burden.items.find((i) => i.key === 'suta');
  // futa: 0.6% of min(58240, 7000) = 42
  near(futaItem.amount, 42);
  // suta: 2.7% of min(58240, 9500) = 256.5
  near(sutaItem.amount, 256.5);
});

test('employer burden itemises FICA, workers comp, PTO, health insurance and admin', () => {
  const result = compareCosts(BASE);
  const byKey = Object.fromEntries(result.burden.items.map((i) => [i.key, i.amount]));
  near(byKey.fica, 58240 * 0.0765); // 4455.36
  near(byKey.workersComp, 58240 * 0.015); // 873.6
  near(byKey.pto, 58240 * 0.058); // 3377.92
  near(byKey.retirement, 0);
  near(byKey.health, 500 * 12); // 6000
  near(byKey.payrollAdmin, 600);
});

test('the ongoing annual employee cost sums wages and every burden item, no onboarding', () => {
  const result = compareCosts(BASE);
  const expectedBurden = 4455.36 + 42 + 256.5 + 873.6 + 3377.92 + 0 + 6000 + 600;
  near(result.burden.total, expectedBurden, 0.1);
  near(result.employeeOngoingAnnualCost, 58240 + expectedBurden, 0.1);
  // Year one adds the one-time onboarding cost on top of the ongoing figure.
  near(result.employeeYear1Cost, result.employeeOngoingAnnualCost + 1200, 0.1);
});

test('contractor cost is rate times hours plus 1099 admin, ongoing; plus one-time setup for year one', () => {
  const result = compareCosts(BASE);
  near(result.contractorOngoingAnnualCost, 40 * 2080 + 75); // 83275
  near(result.contractorHourlyCost, (40 * 2080 + 75) / 2080);
  near(result.contractorYear1Cost, result.contractorOngoingAnnualCost + 0);
});

test('the break-even contractor rate reproduces the employee ongoing cost when charged instead', () => {
  const result = compareCosts(BASE);
  const impliedAnnual = result.breakEvenContractorRate * BASE.contractorHoursPerYear + BASE.contractorAdminAnnual;
  near(impliedAnnual, result.employeeOngoingAnnualCost, 0.5);
});

test('break-even rate does not depend on the contractor rate actually entered', () => {
  const cheaper = compareCosts({ ...BASE, contractorHourlyRate: 20 });
  const pricier = compareCosts({ ...BASE, contractorHourlyRate: 200 });
  near(cheaper.breakEvenContractorRate, pricier.breakEvenContractorRate, 0.01);
});

test('cheaperOngoing flips with the gap sign', () => {
  const employeeCheaper = compareCosts({ ...BASE, contractorHourlyRate: 200 });
  assert.equal(employeeCheaper.cheaperOngoing, 'employee');
  assert.ok(employeeCheaper.gapOngoingAnnual < 0);

  const contractorCheaper = compareCosts({ ...BASE, contractorHourlyRate: 5, employeeHourlyWage: 90 });
  assert.equal(contractorCheaper.cheaperOngoing, 'contractor');
  assert.ok(contractorCheaper.gapOngoingAnnual > 0);
});

test('a field below its minimum is rejected with a field-level error, not a thrown exception', () => {
  const result = compareCosts({ ...BASE, employeeHourlyWage: 0 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'employeeHourlyWage'));
});

test('a non-numeric field is rejected rather than producing NaN downstream', () => {
  const result = compareCosts({ ...BASE, contractorHoursPerYear: 'a lot' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.field === 'contractorHoursPerYear'));
});

test('all field-level errors are collected in one pass, not one-at-a-time', () => {
  const result = compareCosts({ ...BASE, employeeHourlyWage: -1, contractorHourlyRate: -1 });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('a large mismatch between employee and contractor hours is flagged as not apples-to-apples', () => {
  const result = compareCosts({ ...BASE, contractorHoursPerYear: 500 });
  assert.equal(result.ok, true);
  assert.ok(result.notes.some((n) => /apples-to-apples/.test(n)));
});

test('matched hours produce no hours-mismatch note', () => {
  const result = compareCosts(BASE);
  assert.equal(result.ok, true);
  assert.ok(!result.notes.some((n) => /apples-to-apples/.test(n)));
});

test('notes always carry the worker-classification disclaimer, and never a classification verdict', () => {
  const result = compareCosts(BASE);
  const text = result.notes.join(' ');
  assert.match(text, /does not determine.*legally be a W-2 employee or a 1099 independent contractor/);
  assert.doesNotMatch(text, /should be classified as|is legally an employee|is legally a contractor/i);
});

test('employerBurden is a pure function callable on its own', () => {
  const burden = employerBurden({
    annualWages: 10000,
    ficaPercent: 7.65,
    futaPercent: 0.6,
    futaWageBase: 7000,
    sutaPercent: 2.7,
    sutaWageBase: 9500,
    workersCompRate: 1.5,
    ptoHolidayPercent: 5.8,
    retirementMatchPercent: 0,
    healthInsuranceMonthly: 0,
    payrollAdminAnnual: 0,
  });
  near(burden.total, 10000 * (0.0765 + 0.058 + 0.015) + 7000 * 0.006 + 9500 * 0.027, 0.1);
});
