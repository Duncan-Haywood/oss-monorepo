import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipAnnualContributions,
  projectTrumpAccount,
  money,
  SEED_DEPOSIT,
  ANNUAL_CONTRIBUTION_CAP,
  EMPLOYER_CONTRIBUTION_CAP,
  EARLY_WITHDRAWAL_PENALTY_RATE,
  PENALTY_FREE_AGE,
  MINIMUM_DISTRIBUTION_AGE,
} from './calc.mjs';

test('clipAnnualContributions leaves untouched contributions under both caps', () => {
  const r = clipAnnualContributions(2000, 1000);
  assert.equal(r.family, 2000);
  assert.equal(r.employer, 1000);
  assert.equal(r.total, 3000);
  assert.equal(r.familyClipped, false);
  assert.equal(r.employerClipped, false);
});

test('clipAnnualContributions caps the employer portion at $2,500 even with family room to spare', () => {
  const r = clipAnnualContributions(500, 4000);
  assert.equal(r.employer, EMPLOYER_CONTRIBUTION_CAP);
  assert.equal(r.employerClipped, true);
  assert.equal(r.family, 500);
  assert.equal(r.familyClipped, false);
});

test('clipAnnualContributions gives family only the room left after the employer cap', () => {
  const r = clipAnnualContributions(10000, 2500);
  assert.equal(r.employer, 2500);
  assert.equal(r.family, ANNUAL_CONTRIBUTION_CAP - 2500);
  assert.equal(r.total, ANNUAL_CONTRIBUTION_CAP);
  assert.equal(r.familyClipped, true);
});

test('clipAnnualContributions: employer requesting more than its own $2,500 sub-cap is clipped there first', () => {
  const r = clipAnnualContributions(1000, 5000);
  assert.equal(r.employer, EMPLOYER_CONTRIBUTION_CAP); // employer sub-cap binds first
  assert.equal(r.family, 1000); // under the $2,500 of room left, so untouched
  assert.equal(r.employerClipped, true);
  assert.equal(r.familyClipped, false);
});

test('clipAnnualContributions: family requesting the full $5,000 with an employer contribution present is clipped to the remaining room', () => {
  const r = clipAnnualContributions(5000, 2500);
  assert.equal(r.employer, EMPLOYER_CONTRIBUTION_CAP);
  assert.equal(r.family, ANNUAL_CONTRIBUTION_CAP - EMPLOYER_CONTRIBUTION_CAP);
  assert.equal(r.familyClipped, true);
});

test('negative or non-numeric contributions are treated as zero, not thrown', () => {
  const r = clipAnnualContributions(-500, 'abc');
  assert.equal(r.family, 0);
  assert.equal(r.employer, 0);
});

test('the $1,000 seed is included when eligible and excluded when not', () => {
  const withSeed = projectTrumpAccount({ currentAge: 0, withdrawalAge: 18, seedEligible: true, annualReturnPercent: 0 });
  const withoutSeed = projectTrumpAccount({ currentAge: 0, withdrawalAge: 18, seedEligible: false, annualReturnPercent: 0 });
  assert.equal(withSeed.balance - withoutSeed.balance, SEED_DEPOSIT);
  assert.equal(withSeed.nonBasis - withoutSeed.nonBasis, SEED_DEPOSIT);
});

test('at 0% return, the balance is exactly the seed plus every year\'s contributions, no more', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    seedEligible: true,
    annualFamilyContribution: 1000,
    annualEmployerContribution: 500,
    annualReturnPercent: 0,
  });
  assert.equal(result.years, 18);
  assert.equal(result.balance, SEED_DEPOSIT + 18 * 1500);
  assert.equal(result.totalGrowth, 0);
});

test('a positive return rate produces growth beyond total contributions', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    annualFamilyContribution: 1000,
    annualReturnPercent: 7,
  });
  assert.ok(result.balance > result.totalContributed);
  assert.equal(result.totalGrowth, result.balance - result.totalContributed);
});

test('basis is exactly the sum of family contributions -- seed and employer money are never basis', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    seedEligible: true,
    annualFamilyContribution: 2000,
    annualEmployerContribution: 1000,
    annualReturnPercent: 5,
  });
  assert.equal(result.basis, 2000 * 18);
  assert.equal(result.nonBasis, SEED_DEPOSIT + 1000 * 18);
});

test('the tax-free and taxable amounts are a true pro-rata split that sums back to the balance', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    annualFamilyContribution: 3000,
    annualEmployerContribution: 1000,
    annualReturnPercent: 6,
  });
  assert.ok(Math.abs(result.taxFreeAmount + result.taxableAmount - result.balance) < 1e-6);
  assert.ok(Math.abs(result.taxFreeFraction - result.basis / result.balance) < 1e-9);
});

test('an account funded ENTIRELY by family contributions (no seed, no employer) is 100% basis', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    seedEligible: false,
    annualFamilyContribution: 4000,
    annualEmployerContribution: 0,
    annualReturnPercent: 0, // isolate the pro-rata question from growth, which is never basis
  });
  assert.equal(result.taxFreeFraction, 1);
  assert.equal(result.taxableAmount, 0);
});

test('the 10% penalty applies before 59.5 for a non-qualified use, and only on the taxable portion', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    annualFamilyContribution: 1000,
    annualEmployerContribution: 500,
    qualifiedUse: false,
  });
  assert.equal(result.isPenaltyFree, false);
  assert.equal(result.penalty, result.taxableAmount * EARLY_WITHDRAWAL_PENALTY_RATE);
  assert.ok(result.penalty > 0);
});

test('a qualified use waives the penalty even well before 59.5', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    annualFamilyContribution: 1000,
    qualifiedUse: true,
  });
  assert.equal(result.isPenaltyFree, true);
  assert.equal(result.penalty, 0);
  assert.ok(result.incomeTax >= 0); // income tax on the taxable portion still applies
});

test('withdrawing at or after 59.5 waives the penalty even for a non-qualified use', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 60,
    annualFamilyContribution: 1000,
    qualifiedUse: false,
  });
  assert.equal(result.isPenaltyFree, true);
  assert.equal(result.penalty, 0);
});

test('a withdrawal age below 18 is raised to 18 and a high-severity finding names it', () => {
  const result = projectTrumpAccount({ currentAge: 0, withdrawalAge: 10, annualFamilyContribution: 500 });
  assert.equal(result.withdrawalAgeUsed, MINIMUM_DISTRIBUTION_AGE);
  assert.ok(result.findings.some((f) => f.severity === 'high' && /raised to 18/i.test(f.title)));
});

test('zero years between current age and withdrawal age still returns a valid, non-throwing result', () => {
  const result = projectTrumpAccount({ currentAge: 18, withdrawalAge: 18, annualFamilyContribution: 1000 });
  assert.equal(result.years, 0);
  assert.equal(result.balance, SEED_DEPOSIT); // seed only -- no contribution years elapsed
});

test('a requested contribution above the combined cap produces the clipped-contribution finding', () => {
  const result = projectTrumpAccount({
    currentAge: 0,
    withdrawalAge: 18,
    annualFamilyContribution: 8000,
    annualEmployerContribution: 3000,
  });
  assert.ok(result.findings.some((f) => /reduced to the statutory cap/i.test(f.title)));
  assert.equal(result.familyPerYear + result.employerPerYear, ANNUAL_CONTRIBUTION_CAP);
});

test('employer contributions trigger the payroll-tax finding; a family-only projection does not', () => {
  const withEmployer = projectTrumpAccount({ currentAge: 0, withdrawalAge: 18, annualEmployerContribution: 1000 });
  const familyOnly = projectTrumpAccount({ currentAge: 0, withdrawalAge: 18, annualFamilyContribution: 1000, annualEmployerContribution: 0 });
  assert.ok(withEmployer.findings.some((f) => /payroll/i.test(f.detail)));
  assert.ok(!familyOnly.findings.some((f) => /payroll/i.test(f.detail)));
});

test('money() formats whole dollars with a thousands separator and no cents', () => {
  assert.equal(money(1000), '$1,000');
  assert.equal(money(0), '$0');
  assert.equal(money(1234567), '$1,234,567');
});

test('every projection carries the federal-income-tax-only / July 4 2026 informational finding', () => {
  const result = projectTrumpAccount({ currentAge: 0, withdrawalAge: 18 });
  assert.ok(result.findings.some((f) => /July 4, 2026/.test(f.detail)));
});
