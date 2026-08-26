import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTerms, compareEarlyPay, compareFactor, earlyPayNote, factorNote, FACTOR_DEFAULTS, termsCopy } from './calc.mjs';
import fs from 'node:fs';

const input = { amount: 1200, invoiceDate: '2026-08-24', termsDays: 30, annualLateRate: 18, graceDays: 10, monthlyBurn: 3000, outstanding: 3 };

test('calculates due date, exposure, and late-fee scenarios', () => {
  const result = calculateTerms(input);
  assert.equal(result.dueDate, '2026-09-23');
  assert.equal(result.exposure, 3600);
  assert.equal(result.fees[0].fee, 11.835616438356164);
  assert.equal(result.runwayDays, 36);
});

test('grace period prevents fees during the grace window', () => {
  const result = calculateTerms({ ...input, graceDays: 30 });
  assert.equal(result.fees.find(row => row.days === 30).fee, 0);
});

test('rejects calendar dates that JavaScript would normalize', () => {
  assert.throws(() => calculateTerms({ ...input, invoiceDate: '2026-02-30' }), /valid invoice date/);
});

test('rejects missing invoice details instead of throwing an implementation error', () => {
  assert.throws(() => calculateTerms(), /invoice details/);
});

test('creates transparent copyable terms without claiming compliance', () => {
  assert.match(termsCopy(calculateTerms(input)), /due 2026-09-23/);
  assert.match(termsCopy(calculateTerms(input)), /18% annual interest/);
});

test('does not ship a stale hardcoded invoice date', () => {
  const page = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /id="invoiceDate"[^>]*value="\d{4}-\d{2}-\d{2}"/);
  assert.match(page, /invoiceDate.*new Date\(\)\.toISOString\(\)/s);
});

test('offers local draft persistence without an upload path', () => {
  const page = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /invoice-terms-draft-v1/);
  assert.match(page, /Save draft in this browser/);
  assert.doesNotMatch(page, /fetch\(/);
});

const earlyPay = {
  amount: 1200,
  termsDays: 30,
  earlyPayDays: 10,
  earlyPayDiscountPct: 2,
  annualCarryRate: 24,
  takeRatePct: 100,
};

test('2/10 Net 30 at 24% still leaves waiting ahead of the discount', () => {
  const comparison = compareEarlyPay(earlyPay);
  assert.equal(comparison.earlyCash, 1176);
  assert.equal(comparison.waitCash, 1200);
  assert.equal(comparison.discountCost, 24);
  assert.equal(comparison.daysSaved, 20);
  assert.ok(Math.abs(comparison.earlyCarry - (1176 * 0.24 * 10 / 365)) < 1e-9);
  assert.ok(Math.abs(comparison.waitCarry - (1200 * 0.24 * 30 / 365)) < 1e-9);
  assert.ok(Math.abs(comparison.earlyAfterFloat - (1176 - comparison.earlyCarry)) < 1e-12);
  assert.ok(Math.abs(comparison.waitAfterFloat - (1200 - comparison.waitCarry)) < 1e-12);
  assert.ok(comparison.waitAfterFloat - comparison.earlyAfterFloat > 8);
  assert.ok(comparison.waitAfterFloat - comparison.earlyAfterFloat < 8.1);
  assert.equal(comparison.earlyBeatsWait, false);
  assert.ok(comparison.breakEvenAnnualRate > 36.1);
  assert.ok(comparison.breakEvenAnnualRate < 36.2);
  assert.ok(comparison.discountApr > 37.2);
  assert.ok(comparison.discountApr < 37.3);
});

test('50% money flips 2/10 Net 30 ahead of waiting', () => {
  const comparison = compareEarlyPay({ ...earlyPay, annualCarryRate: 50 });
  assert.equal(comparison.earlyBeatsWait, true);
  assert.ok(comparison.earlyPremium > 9.2);
  assert.ok(comparison.earlyPremium < 9.3);
});

test('cheap 6% capital still leaves waiting ahead of 2/10', () => {
  const comparison = compareEarlyPay({ ...earlyPay, annualCarryRate: 6 });
  assert.equal(comparison.earlyBeatsWait, false);
  assert.ok(-comparison.earlyPremium > 20);
});

test('a 40% take rate scales the mix without flipping a losing discount', () => {
  const comparison = compareEarlyPay({ ...earlyPay, takeRatePct: 40 });
  assert.equal(comparison.earlyBeatsWait, false);
  assert.ok(comparison.mixPremium < 0);
  assert.equal(
    comparison.mixedAfterFloat,
    0.4 * comparison.earlyAfterFloat + 0.6 * comparison.waitAfterFloat,
  );
});

test('earlyPayNote does not tell them to offer or take the discount', () => {
  const note = earlyPayNote(compareEarlyPay(earlyPay));
  assert.match(note, /\$1,176\.33/);
  assert.match(note, /\$24\.00/);
  assert.doesNotMatch(note, /should offer|must take|should take|must offer/i);
});

test('compareEarlyPay rejects impossible discounts and inverted windows', () => {
  assert.throws(() => compareEarlyPay({ ...earlyPay, amount: 0 }), /greater than zero/);
  assert.throws(() => compareEarlyPay({ ...earlyPay, earlyPayDiscountPct: 100 }), /below 100/);
  assert.throws(() => compareEarlyPay({ ...earlyPay, earlyPayDays: 45 }), /cannot be later/);
  assert.throws(() => compareEarlyPay({ ...earlyPay, takeRatePct: 101 }), /between 0 and 100/);
  assert.throws(() => compareEarlyPay({ ...earlyPay, annualCarryRate: -1 }), /non-negative/);
});

// --- when the cash actually lands -----------------------------------

import { PAY_RUN_SCHEDULES, compareTermsLandings, projectSettlement, settlementNote } from './calc.mjs';

const settle = { amount: 1200, invoiceDate: '2026-08-24', termsDays: 30, annualCarryRate: 24 };

test('semimonthly client pushes a Sep 23 due date to the Oct 1 run', () => {
  const p = projectSettlement({ ...settle, payRun: 'semimonthly' });
  assert.equal(p.dueDate, '2026-09-23');
  assert.equal(p.settlementDate, '2026-10-01');
  assert.equal(p.driftDays, 8);
  assert.equal(p.totalWaitDays, 38);
  assert.equal(p.landsOnDueDate, false);
});

test('drift is priced at the carrying rate already on the form', () => {
  const p = projectSettlement({ ...settle, payRun: 'semimonthly' });
  assert.equal(p.driftCarryCost, 1200 * 0.24 * (8 / 365));
});

test('a due date landing on a run day has no drift', () => {
  const p = projectSettlement({ ...settle, invoiceDate: '2026-09-01', payRun: 'semimonthly', termsDays: 14 });
  assert.equal(p.dueDate, '2026-09-15');
  assert.equal(p.settlementDate, '2026-09-15');
  assert.equal(p.driftDays, 0);
  assert.equal(p.landsOnDueDate, true);
});

test('weekdays schedule carries a weekend due date to Monday', () => {
  // 2026-09-26 is a Saturday.
  const p = projectSettlement({ ...settle, invoiceDate: '2026-08-27', payRun: 'weekdays' });
  assert.equal(p.dueDate, '2026-09-26');
  assert.equal(p.settlementDate, '2026-09-28');
  assert.equal(p.driftDays, 2);
});

test('weekdays is the default when no schedule is given', () => {
  const p = projectSettlement({ ...settle, invoiceDate: '2026-08-27' });
  assert.equal(p.schedule, 'weekdays');
  assert.equal(p.settlementDate, '2026-09-28');
});

test('on-due reproduces the plain contractual due date', () => {
  const p = projectSettlement({ ...settle, payRun: 'on-due' });
  assert.equal(p.settlementDate, calculateTerms(settle).dueDate);
  assert.equal(p.driftDays, 0);
  assert.equal(p.earlierRun, null);
});

test('a monthly run day clamps to the end of a short month', () => {
  const p = projectSettlement({ ...settle, invoiceDate: '2027-01-20', payRun: 'monthly', payRunDay: 31 });
  assert.equal(p.dueDate, '2027-02-19');
  assert.equal(p.settlementDate, '2027-02-28');
});

test('a weekly run lands on the chosen weekday', () => {
  const p = projectSettlement({ ...settle, payRun: 'weekly', payRunWeekday: 1 });
  assert.equal(new Date(`${p.settlementDate}T00:00:00Z`).getUTCDay(), 1);
  assert.equal(p.settlementDate, '2026-09-28');
});

test('the send-earlier tip appears only when batching gives leverage', () => {
  // Monthly run: 22 days earlier buys 30 days sooner.
  const batched = projectSettlement({ ...settle, payRun: 'monthly', payRunDay: 1 });
  assert.equal(batched.earlierRun.sendEarlierDays, 22);
  assert.equal(batched.earlierRun.daysSooner, 30);
  assert.equal(batched.earlierRun.invoiceBy, '2026-08-02');

  // Weekdays: every shift is 1-for-1, so there is nothing to say.
  const flat = projectSettlement({ ...settle, invoiceDate: '2026-08-26', payRun: 'weekdays' });
  assert.equal(flat.earlierRun, null);
});

test('a longer term can land on the same run as a shorter one', () => {
  const rows = compareTermsLandings({ ...settle, payRun: 'monthly', payRunDay: 1 });
  const net30 = rows.find(r => r.termsDays === 30);
  const net15 = rows.find(r => r.termsDays === 15);
  assert.equal(net15.settlementDate, net30.settlementDate);
  assert.equal(net30.landsWith, 15);
  assert.equal(net30.freeExtraDays, 15);
  assert.equal(net15.landsWith, null);
});

test('the terms ladder includes the operator’s own term and marks it', () => {
  const rows = compareTermsLandings({ ...settle, termsDays: 21 });
  const own = rows.filter(r => r.isCurrent);
  assert.equal(own.length, 1);
  assert.equal(own[0].termsDays, 21);
  assert.deepEqual(rows.map(r => r.termsDays), [7, 15, 21, 30, 45, 60]);
});

test('rejects a schedule that is not on the list', () => {
  assert.throws(() => projectSettlement({ ...settle, payRun: 'whenever' }), /payment schedule/);
});

test('rejects an out-of-range monthly day and weekly weekday', () => {
  assert.throws(() => projectSettlement({ ...settle, payRun: 'monthly', payRunDay: 0 }), /between 1 and 31/);
  assert.throws(() => projectSettlement({ ...settle, payRun: 'weekly', payRunWeekday: 9 }), /between 0/);
});

test('rejects an invalid invoice date', () => {
  assert.throws(() => projectSettlement({ ...settle, invoiceDate: '2026-02-30' }), /valid invoice date/);
});

test('every advertised schedule projects a real date', () => {
  for (const { id } of PAY_RUN_SCHEDULES) {
    const p = projectSettlement({ ...settle, payRun: id });
    assert.match(p.settlementDate, /^\d{4}-\d{2}-\d{2}$/, id);
    assert.ok(p.totalWaitDays >= settle.termsDays, id);
  }
});

test('the settlement note states the drift and never advises', () => {
  const note = settlementNote(projectSettlement({ ...settle, payRun: 'semimonthly' }));
  assert.match(note, /2026-10-01/);
  assert.match(note, /8 days later/);
  assert.doesNotMatch(note, /you should|we recommend/i);
});

const factor = {
  amount: 1200,
  termsDays: 30,
  factorFeePct: 3,
  advancePct: 90,
  reserveDays: 35,
  annualCarryRate: 24,
};

test('3% factoring at 24% still leaves waiting ahead of the fee', () => {
  const comparison = compareFactor(factor);
  assert.equal(comparison.fee, 36);
  assert.equal(comparison.advanceFace, 1080);
  assert.equal(comparison.advanceNow, 1044);
  assert.equal(comparison.reserve, 120);
  assert.equal(comparison.waitCash, 1200);
  assert.ok(Math.abs(comparison.waitCarry - (1200 * 0.24 * 30 / 365)) < 1e-9);
  assert.ok(Math.abs(comparison.reserveCarry - (120 * 0.24 * 35 / 365)) < 1e-9);
  assert.ok(Math.abs(comparison.factorAfterFloat - (1044 + 120 - comparison.reserveCarry)) < 1e-12);
  assert.ok(Math.abs(comparison.waitAfterFloat - (1200 - comparison.waitCarry)) < 1e-12);
  assert.equal(comparison.factorBeatsWait, false);
  assert.ok(-comparison.factorPremium > 14);
  assert.ok(-comparison.factorPremium < 16);
  assert.ok(comparison.breakEvenFeePct > 1.7);
  assert.ok(comparison.breakEvenFeePct < 1.8);
});

test('50% money flips 3% factoring ahead of waiting', () => {
  const comparison = compareFactor({ ...factor, annualCarryRate: 50 });
  assert.equal(comparison.factorBeatsWait, true);
  assert.ok(comparison.factorPremium > 7.5);
  assert.ok(comparison.factorPremium < 7.6);
});

test('a 1.5% factor fee at 24% flips ahead of waiting', () => {
  const comparison = compareFactor({ ...factor, factorFeePct: 1.5 });
  assert.equal(comparison.factorBeatsWait, true);
  assert.ok(comparison.factorPremium > 2);
  assert.ok(comparison.factorPremium < 4);
});

test('factorNote does not tell them to factor or wait', () => {
  const note = factorNote(compareFactor(factor));
  assert.match(note, /\$1,176\.33/);
  assert.match(note, /\$36\.00/);
  assert.doesNotMatch(note, /should factor|must factor|should wait|must wait/i);
});

test('compareFactor rejects impossible fees and advances', () => {
  assert.throws(() => compareFactor({ ...factor, amount: 0 }), /greater than zero/);
  assert.throws(() => compareFactor({ ...factor, factorFeePct: 100 }), /below 100/);
  assert.throws(() => compareFactor({ ...factor, advancePct: 0 }), /above 0/);
  assert.throws(() => compareFactor({ ...factor, advancePct: 101 }), /at most 100/);
  assert.throws(() => compareFactor({ ...factor, reserveDays: -1 }), /zero or more/);
  assert.throws(() => compareFactor({ ...factor, annualCarryRate: -1 }), /non-negative/);
});

test('exports the factor defaults the page starts from', () => {
  assert.equal(FACTOR_DEFAULTS.factorFeePct, 3);
  assert.equal(FACTOR_DEFAULTS.advancePct, 90);
  assert.equal(FACTOR_DEFAULTS.reserveDays, 35);
});
