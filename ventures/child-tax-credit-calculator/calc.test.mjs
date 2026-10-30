import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseOutReduction,
  computeChildTaxCredit,
  money,
  CTC_PER_CHILD,
  ODC_PER_DEPENDENT,
  ACTC_CAP_PER_CHILD,
  EARNED_INCOME_FLOOR,
  PHASEOUT_THRESHOLD_OTHER,
  PHASEOUT_THRESHOLD_JOINT,
  PHASEOUT_RATE_PER_1000,
} from './calc.mjs';

test('phaseOutReduction is zero at and below the threshold', () => {
  assert.equal(phaseOutReduction(200000, 'single'), 0);
  assert.equal(phaseOutReduction(400000, 'joint'), 0);
  assert.equal(phaseOutReduction(0, 'single'), 0);
});

// Sourced (WebSearch-verified 2026-09-25 against multiple independent
// summaries): "$50 for each $1,000 (or fraction thereof)" -- even $1 over
// the threshold costs a full $50, i.e. round UP to the next $1,000.
test('phaseOutReduction rounds UP to the next $1,000, even $1 over', () => {
  assert.equal(phaseOutReduction(200001, 'single'), 50);
  assert.equal(phaseOutReduction(201000, 'single'), 50);
  assert.equal(phaseOutReduction(201001, 'single'), 100);
});

test('phaseOutReduction worked example: $215,500 single is $800 (16 x $50)', () => {
  assert.equal(phaseOutReduction(215500, 'single'), 800);
});

test('phaseOutReduction uses the $400,000 threshold for joint, $200,000 for everyone else', () => {
  assert.equal(phaseOutReduction(250000, 'joint'), 0);
  assert.equal(phaseOutReduction(250000, 'mfs'), 2500);
  assert.equal(phaseOutReduction(250000, 'hoh'), 2500);
  assert.equal(phaseOutReduction(250000, 'qss'), 2500);
});

test('no filer SSN zeroes everything regardless of dependents', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'joint',
    magi: 80000,
    earnedIncome: 80000,
    qualifyingChildren: 2,
    filerHasSsn: false,
  });
  assert.equal(result.totalAfter, 0);
  assert.equal(result.maxRefundable, 0);
  assert.ok(result.findings.some((f) => /Social Security number/.test(f.title)));
});

test('no dependents entered is flagged, not silently zero', () => {
  const result = computeChildTaxCredit({ filingStatus: 'single', magi: 50000, filerHasSsn: true });
  assert.equal(result.totalAfter, 0);
  assert.ok(result.findings.some((f) => /No qualifying children/.test(f.title)));
});

test('one qualifying child, low income, under the phase-out: full $2,200 CTC', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 60000,
    earnedIncome: 60000,
    qualifyingChildren: 1,
    filerHasSsn: true,
  });
  assert.equal(result.grossCtc, CTC_PER_CHILD);
  assert.equal(result.reduction, 0);
  assert.equal(result.ctcAfter, CTC_PER_CHILD);
  assert.equal(result.totalAfter, CTC_PER_CHILD);
});

test('other dependents use the $500 ODC amount, separate from the CTC pool', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 60000,
    earnedIncome: 60000,
    qualifyingChildren: 1,
    otherDependents: 2,
    filerHasSsn: true,
  });
  assert.equal(result.grossOdc, 2 * ODC_PER_DEPENDENT);
  assert.equal(result.odcAfter, 2 * ODC_PER_DEPENDENT);
  assert.equal(result.grossTotal, CTC_PER_CHILD + 2 * ODC_PER_DEPENDENT);
});

// The residual-split identity this module's header comment derives: the
// reduction lands on the ODC pool first, and only the leftover spills into
// the CTC pool -- because the reduction is a flat number independent of
// pool composition, this always reproduces the combined total exactly.
test('phase-out reduction is absorbed by the ODC pool before touching the CTC pool', () => {
  // ODC pool is $1,000 (2 dependents); a $600 reduction should come
  // entirely out of ODC, leaving the CTC pool untouched.
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 200001 + 11 * 1000, // -> reduction = 12 * $50 = $600
    earnedIncome: 60000,
    qualifyingChildren: 1,
    otherDependents: 2,
    filerHasSsn: true,
  });
  assert.equal(result.reduction, 600);
  assert.equal(result.odcAfter, 1000 - 600);
  assert.equal(result.ctcAfter, CTC_PER_CHILD);
});

test('a reduction bigger than the ODC pool spills the remainder into the CTC pool', () => {
  // ODC pool is $500 (1 dependent); reduction of $600 leaves ODC at $0 and
  // spends the other $100 against the $2,200 CTC pool.
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 200001 + 11 * 1000, // -> reduction = 12 * $50 = $600
    earnedIncome: 60000,
    qualifyingChildren: 1,
    otherDependents: 1,
    filerHasSsn: true,
  });
  assert.equal(result.reduction, 600);
  assert.equal(result.odcAfter, 0);
  assert.equal(result.ctcAfter, CTC_PER_CHILD - 100);
  assert.equal(result.totalAfter, result.ctcAfter + result.odcAfter);
});

test('fully phased out at a high enough MAGI', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 500000,
    earnedIncome: 300000,
    qualifyingChildren: 1,
    filerHasSsn: true,
  });
  assert.equal(result.totalAfter, 0);
  assert.ok(result.findings.some((f) => /Fully phased out/.test(f.title)));
});

// Sourced worked example (WebSearch-verified 2026-09-25): $50,000 earned
// income -> (50000 - 2500) * 0.15 = $7,125, well over the $1,700-per-child
// cap for a single child, so the child cap binds.
test('ACTC ceiling is the smallest of the three limits -- child cap binds here', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 60000,
    earnedIncome: 50000,
    qualifyingChildren: 1,
    filerHasSsn: true,
  });
  assert.equal(result.maxRefundable, ACTC_CAP_PER_CHILD);
});

test('ACTC ceiling is limited by 15% of earned income over $2,500 when that is smaller', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 60000,
    earnedIncome: 10000, // (10000-2500)*0.15 = 1125, under the $1,700 cap
    qualifyingChildren: 1,
    filerHasSsn: true,
  });
  assert.equal(result.maxRefundable, 1125);
});

test('earned income at or below the $2,500 floor: zero refundable ACTC, findings say why', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 60000,
    earnedIncome: 2000,
    qualifyingChildren: 1,
    filerHasSsn: true,
  });
  assert.equal(result.maxRefundable, 0);
  assert.ok(result.findings.some((f) => /under \$2,500/.test(f.title)));
});

test('ODC-only dependents never contribute to the refundable ACTC ceiling', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 60000,
    earnedIncome: 60000,
    qualifyingChildren: 0,
    otherDependents: 3,
    filerHasSsn: true,
  });
  assert.equal(result.maxRefundable, 0);
  assert.equal(result.totalAfter, 3 * ODC_PER_DEPENDENT);
});

test('MFS is allowed (unlike this portfolio\'s senior-deduction-calculator) and uses the lower threshold', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'mfs',
    magi: 60000,
    earnedIncome: 60000,
    qualifyingChildren: 1,
    filerHasSsn: true,
  });
  assert.equal(result.totalAfter, CTC_PER_CHILD);
  assert.ok(result.findings.some((f) => /married filing separately is allowed/i.test(f.title)));
});

test('money formats without a sign for zero and positive values, with a leading minus for negative', () => {
  assert.equal(money(0), '$0');
  assert.equal(money(2200), '$2,200');
  assert.equal(money(-5), '-$5');
});

test('non-numeric and negative inputs are treated as zero, never NaN or negative counts', () => {
  const result = computeChildTaxCredit({
    filingStatus: 'single',
    magi: 'not a number',
    earnedIncome: -500,
    qualifyingChildren: -3,
    otherDependents: 'two',
    filerHasSsn: true,
  });
  assert.equal(result.totalAfter, 0);
  assert.ok(Number.isFinite(result.totalAfter));
});

// Red-team 2026-10-29: guards for finding selection and the zero result.
const titles = (r) => r.findings.map((f) => f.title);
const base = { filingStatus: 'single', magi: 50000, earnedIncome: 50000, filerHasSsn: true };

test('zero results (no SSN, no dependents) report a zero reduction', () => {
  assert.equal(computeChildTaxCredit({ ...base, filerHasSsn: false, qualifyingChildren: 1 }).reduction, 0);
  assert.equal(computeChildTaxCredit({ ...base }).reduction, 0);
});

test('under the threshold the finding is "full amount", not a phase-out finding', () => {
  const t = titles(computeChildTaxCredit({ ...base, qualifyingChildren: 1 }));
  assert.ok(t.includes('Full amount before the income phase-out binds'));
  assert.ok(!t.some((x) => /phase-out$|phased out/.test(x)));
});

test('a partial phase-out is "Reduced", and only a fully exhausted credit is "Fully phased out"', () => {
  const part = titles(computeChildTaxCredit({ ...base, magi: 210000, qualifyingChildren: 1 }));
  assert.ok(part.includes('Reduced by the income phase-out'));
  assert.ok(!part.includes('Fully phased out at this income'));
  const full = titles(computeChildTaxCredit({ ...base, magi: 300000, qualifyingChildren: 1 }));
  assert.ok(full.includes('Fully phased out at this income'));
});

test('the Credit for Other Dependents note appears only when other dependents are entered', () => {
  const none = titles(computeChildTaxCredit({ ...base, qualifyingChildren: 1 }));
  assert.ok(!none.some((x) => /Credit for Other Dependents/.test(x)));
  const one = titles(computeChildTaxCredit({ ...base, otherDependents: 1 }));
  assert.ok(one.some((x) => /Credit for Other Dependents/.test(x)));
});

test('the earned-income-floor note needs a qualifying child; other-dependent-only returns skip it', () => {
  const odcOnly = titles(computeChildTaxCredit({ ...base, earnedIncome: 1000, otherDependents: 1 }));
  assert.ok(!odcOnly.some((x) => /No refundable Additional/.test(x)));
  const child = titles(computeChildTaxCredit({ ...base, earnedIncome: 1000, qualifyingChildren: 1 }));
  assert.ok(child.some((x) => /No refundable Additional/.test(x)));
});

test('earned income exactly at the floor yields neither the floor note nor an "Up to" refundable note', () => {
  const t = titles(computeChildTaxCredit({ ...base, earnedIncome: EARNED_INCOME_FLOOR, qualifyingChildren: 1 }));
  assert.ok(!t.some((x) => /No refundable Additional|Up to/.test(x)));
});
