import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eicTableLookup,
  computeEitc,
  paramsFor,
  money,
  INVESTMENT_INCOME_LIMIT,
  EITC_PARAMS,
} from './calc.mjs';

test('paramsFor caps at 3+ children', () => {
  assert.equal(paramsFor(3).max, 8231);
  assert.equal(paramsFor(4).max, 8231);
  assert.equal(paramsFor(10).max, 8231);
});

test('eicTableLookup is $0 at $0 and below', () => {
  assert.equal(eicTableLookup(0, 1, false), 0);
  assert.equal(eicTableLookup(-100, 1, false), 0);
});

// Sourced (WebSearch-verified 2026-09-25): the phase-in rate for 1 child
// is 34%, reaching the $4,427 max exactly at the $13,020 earned income
// amount.
test('eicTableLookup phases in at the published rate for 1 child', () => {
  assert.equal(Math.round(eicTableLookup(10000, 1, false)), Math.round(10000 * 0.34));
  assert.equal(eicTableLookup(13020, 1, false), 4427);
});

test('eicTableLookup plateaus at the maximum between the earned income amount and the threshold', () => {
  assert.equal(eicTableLookup(13020, 1, false), 4427);
  assert.equal(eicTableLookup(20000, 1, false), 4427);
  assert.equal(eicTableLookup(23890, 1, false), 4427);
});

// Worked example (WebSearch-verified 2026-09-25): single filer, 1 child,
// $215,500-style overage math -- but scaled to EITC's own numbers. At
// $23,890 + $10,000 = $33,890, reduction is 10000 * 0.1598 = $1,598, so
// credit = 4427 - 1598 = $2,829.
test('eicTableLookup phases out at the published rate for 1 child, single', () => {
  const credit = eicTableLookup(33890, 1, false);
  assert.equal(Math.round(credit * 100) / 100, 4427 - 10000 * 0.1598);
});

test('eicTableLookup reaches exactly $0 at the completed-phaseout ceiling', () => {
  assert.equal(eicTableLookup(51593, 1, false), 0);
  assert.ok(eicTableLookup(51592, 1, false) > 0);
});

test('eicTableLookup uses the higher joint thresholds', () => {
  // At $23,890 (single threshold), a joint filer is still on the plateau
  // since the joint threshold is $31,160.
  assert.equal(eicTableLookup(28000, 1, true), 4427);
  assert.equal(eicTableLookup(28000, 1, false), 4427 - (28000 - 23890) * 0.1598);
});

test('0 children and no age checkbox: not eligible', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 9000,
    qualifyingChildren: 0,
    filerAge25to64: false,
  });
  assert.equal(result.credit, 0);
  assert.ok(result.findings.some((f) => /25-64/.test(f.title)));
});

test('0 children with age checkbox checked: eligible', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 8680,
    qualifyingChildren: 0,
    filerAge25to64: true,
  });
  assert.equal(result.credit, 664);
});

test('investment income over the limit zeroes the credit regardless of earned income', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 15000,
    agi: 15000,
    investmentIncome: INVESTMENT_INCOME_LIMIT + 1,
    qualifyingChildren: 1,
  });
  assert.equal(result.credit, 0);
  assert.ok(result.findings.some((f) => /investment income/i.test(f.title)));
});

test('investment income at exactly the limit does not disqualify', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 13020,
    agi: 13020,
    investmentIncome: INVESTMENT_INCOME_LIMIT,
    qualifyingChildren: 1,
  });
  assert.equal(result.credit, 4427);
});

test('MFS without the living-apart checkbox: not eligible', () => {
  const result = computeEitc({
    filingStatus: 'mfs',
    earnedIncome: 15000,
    qualifyingChildren: 1,
    livedApartFromSpouse: false,
  });
  assert.equal(result.credit, 0);
  assert.ok(result.findings.some((f) => /married filing separately/i.test(f.title)));
});

test('MFS with a qualifying child and the living-apart exception: eligible using single thresholds', () => {
  const result = computeEitc({
    filingStatus: 'mfs',
    earnedIncome: 13020,
    agi: 13020,
    qualifyingChildren: 1,
    livedApartFromSpouse: true,
  });
  assert.equal(result.credit, 4427);
  assert.ok(result.findings.some((f) => /living-apart exception/i.test(f.title)));
});

test('MFS with the checkbox but zero qualifying children: still not eligible', () => {
  const result = computeEitc({
    filingStatus: 'mfs',
    earnedIncome: 9000,
    qualifyingChildren: 0,
    livedApartFromSpouse: true,
    filerAge25to64: true,
  });
  assert.equal(result.credit, 0);
});

// The core differentiator this venture's header comment documents: the
// credit is computed twice (earned income, AGI) and the SMALLER wins.
test('AGI higher than earned income (e.g. investment income under the cap, or a working spouse) can cap the credit below the earned-income lookup', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 13020, // would be the full $4,427 on its own
    agi: 33890, // pushes into the phase-out range
    qualifyingChildren: 1,
  });
  assert.equal(result.creditFromEarned, 4427);
  assert.ok(result.creditFromAgi < result.creditFromEarned);
  assert.equal(result.credit, result.creditFromAgi);
  assert.ok(result.findings.some((f) => /AGI, not earned income/.test(f.title)));
});

test('when AGI is not higher than earned income, only the earned-income lookup applies', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 13020,
    agi: 13020,
    qualifyingChildren: 1,
  });
  assert.equal(result.credit, 4427);
  assert.ok(result.findings.some((f) => /does not reduce this credit further/i.test(f.title)));
});

test('no earned income: credit is $0 with an explanatory finding', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 0,
    qualifyingChildren: 1,
  });
  assert.equal(result.credit, 0);
  assert.ok(result.findings.some((f) => /No earned income/.test(f.title)));
});

test('fully phased out by earned income alone', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 70000,
    agi: 70000,
    qualifyingChildren: 1,
  });
  assert.equal(result.credit, 0);
  assert.ok(result.findings.some((f) => /Fully phased out/.test(f.title)));
});

test('3 or more children uses the same phase-out rate as 2 children but a higher max', () => {
  assert.equal(EITC_PARAMS[3].phaseOutRate, EITC_PARAMS[2].phaseOutRate);
  assert.ok(EITC_PARAMS[3].max > EITC_PARAMS[2].max);
});

test('money formats without a sign for zero and positive values, with a leading minus for negative', () => {
  assert.equal(money(0), '$0');
  assert.equal(money(4427), '$4,427');
  assert.equal(money(-5), '-$5');
});

test('non-numeric and negative inputs are treated as zero, never NaN', () => {
  const result = computeEitc({
    filingStatus: 'single',
    earnedIncome: 'not a number',
    agi: -500,
    qualifyingChildren: -3,
    filerAge25to64: true,
  });
  assert.equal(result.credit, 0);
  assert.ok(Number.isFinite(result.credit));
});
