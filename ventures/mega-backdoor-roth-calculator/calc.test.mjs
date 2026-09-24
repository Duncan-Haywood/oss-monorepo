import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIMITS,
  YEARS,
  DEFAULTS,
  catchUpBand,
  electiveDeferralLimit,
  overall415cLimit,
  computeHeadroom,
} from './calc.mjs';

test('2025 and 2026 IRS limits match the published figures', () => {
  assert.deepEqual(YEARS, [2025, 2026]);
  assert.equal(LIMITS[2025].electiveDeferral, 23500);
  assert.equal(LIMITS[2025].catchUp5059, 7500);
  assert.equal(LIMITS[2025].catchUp6063, 11250);
  assert.equal(LIMITS[2025].overall415c, 70000);
  assert.equal(LIMITS[2026].electiveDeferral, 24500);
  assert.equal(LIMITS[2026].catchUp5059, 8000);
  assert.equal(LIMITS[2026].catchUp6063, 11250);
  assert.equal(LIMITS[2026].overall415c, 72000);
});

test('catch-up band: under 50 gets none, 50-59 and 64+ get standard, 60-63 get enhanced', () => {
  assert.equal(catchUpBand(35), 'none');
  assert.equal(catchUpBand(49), 'none');
  assert.equal(catchUpBand(50), 'standard');
  assert.equal(catchUpBand(59), 'standard');
  assert.equal(catchUpBand(60), 'enhanced');
  assert.equal(catchUpBand(63), 'enhanced');
  assert.equal(catchUpBand(64), 'standard');
  assert.equal(catchUpBand(70), 'standard');
});

test('elective deferral limit adds the right catch-up on top of the base figure', () => {
  assert.equal(electiveDeferralLimit(2025, 35), 23500);
  assert.equal(electiveDeferralLimit(2025, 55), 31000);
  assert.equal(electiveDeferralLimit(2025, 61), 34750);
  assert.equal(electiveDeferralLimit(2026, 35), 24500);
  assert.equal(electiveDeferralLimit(2026, 55), 32500);
  assert.equal(electiveDeferralLimit(2026, 61), 35750);
});

test('overall 415(c) limit adds the right catch-up on top of the base figure', () => {
  assert.equal(overall415cLimit(2025, 35), 70000);
  assert.equal(overall415cLimit(2025, 55), 77500);
  assert.equal(overall415cLimit(2025, 61), 81250);
  assert.equal(overall415cLimit(2026, 35), 72000);
  assert.equal(overall415cLimit(2026, 55), 80000);
  assert.equal(overall415cLimit(2026, 61), 83250);
});

test('an unrecognized year falls back to the current default year rather than throwing', () => {
  const result = computeHeadroom({ ...DEFAULTS, year: 2031 });
  assert.equal(result.year, DEFAULTS.year);
});

test('headroom is the 415(c) limit minus everything already counted, at defaults', () => {
  const result = computeHeadroom(DEFAULTS);
  // 2026, age 35: 415(c) = 72000. Already counted: 12000 deferral +
  // (6000 YTD employer + 6000 expected additional employer) + 0 after-tax
  // = 24000. Headroom = 72000 - 24000 = 48000.
  assert.equal(result.overall415cLimit, 72000);
  assert.equal(result.alreadyCounted, 24000);
  assert.equal(result.irsAfterTaxHeadroom, 48000);
  assert.equal(result.maxAdditionalAfterTax, 48000);
  assert.equal(result.bindingConstraint, 'irs');
  assert.equal(result.perPaycheckAmount, round2(48000 / 13));
});

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

test('headroom never goes negative when contributions already exceed the 415(c) limit', () => {
  const result = computeHeadroom({
    ...DEFAULTS,
    ytdElectiveDeferral: 24500,
    ytdEmployerContributions: 40000,
    afterTaxContributedYTD: 20000,
  });
  assert.equal(result.irsAfterTaxHeadroom, 0);
  assert.equal(result.maxAdditionalAfterTax, 0);
  assert.equal(result.bindingConstraint, 'none');
  assert.ok(result.findings.includes('already-over-415c'));
});

test('a plan-imposed after-tax percentage cap binds when it is lower than the IRS headroom', () => {
  const result = computeHeadroom({
    ...DEFAULTS,
    eligibleCompensation: 150000,
    planAfterTaxCapPercent: 10, // plan caps after-tax at 10% of pay = 15000
    afterTaxContributedYTD: 5000,
  });
  // plan cap headroom = 15000 - 5000 = 10000, well below the 48000 IRS headroom
  assert.equal(result.planAfterTaxHeadroom, 10000);
  assert.equal(result.maxAdditionalAfterTax, 10000);
  assert.equal(result.bindingConstraint, 'plan');
  assert.ok(result.findings.includes('plan-caps-below-irs'));
});

test('no plan cap entered leaves planAfterTaxHeadroom null and the IRS figure binds', () => {
  const result = computeHeadroom({ ...DEFAULTS, planAfterTaxCapPercent: '', eligibleCompensation: '' });
  assert.equal(result.planAfterTaxHeadroom, null);
  assert.equal(result.bindingConstraint, 'irs');
});

test('an elective deferral above the age-adjusted limit is flagged rather than silently accepted', () => {
  const result = computeHeadroom({ ...DEFAULTS, age: 35, ytdElectiveDeferral: 30000 });
  assert.ok(result.findings.includes('elective-deferral-exceeds-limit'));
});

test('zero pay periods remaining with real headroom left is flagged, not divided by zero', () => {
  const result = computeHeadroom({ ...DEFAULTS, payPeriodsRemaining: 0 });
  assert.equal(result.perPaycheckAmount, null);
  assert.ok(result.findings.includes('no-pay-periods-remaining'));
});

test('a periodic conversion with real growth reports a tax-cost finding and a nonzero estimate', () => {
  const result = computeHeadroom({
    ...DEFAULTS,
    conversionFrequency: 'periodic',
    estimatedGrowthBeforeConversion: 1000,
    marginalTaxRatePercent: 32,
  });
  assert.equal(result.estimatedConversionTax, 320);
  assert.ok(result.findings.includes('periodic-conversion-has-a-tax-cost'));
});

test('an automatic/immediate conversion reports zero estimated conversion tax regardless of a stray growth figure', () => {
  const result = computeHeadroom({
    ...DEFAULTS,
    conversionFrequency: 'automatic',
    estimatedGrowthBeforeConversion: 1000,
    marginalTaxRatePercent: 32,
  });
  assert.equal(result.estimatedConversionTax, 0);
  assert.ok(!result.findings.includes('periodic-conversion-has-a-tax-cost'));
});

test('negative or garbage inputs clamp to zero rather than producing negative or NaN headroom', () => {
  const result = computeHeadroom({
    ...DEFAULTS,
    ytdElectiveDeferral: -5000,
    ytdEmployerContributions: 'not a number',
    afterTaxContributedYTD: null,
  });
  assert.ok(Number.isFinite(result.irsAfterTaxHeadroom));
  assert.ok(result.irsAfterTaxHeadroom >= 0);
});
