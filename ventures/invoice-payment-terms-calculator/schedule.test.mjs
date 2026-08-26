import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEDULE_PRESETS,
  compareSchedules,
  depositForPeakExposure,
  depositSchedule,
  scheduleCopy,
  scheduleNote,
  scheduleOutcome,
} from "./schedule.mjs";

/**
 * The shipped defaults: a $6,000 project over 30 days, Net 30, paid 12 days
 * late, with a deposit that clears in 5 because nobody starts before it does.
 */
const SHARED = {
  projectValue: 6000,
  projectDays: 30,
  termsDays: 30,
  avgDaysLate: 12,
  annualCarryRate: 24,
  depositCollectionDays: 5,
};

/** The same project where the client treats the deposit like any other invoice. */
const SLOW_DEPOSIT = { ...SHARED, depositCollectionDays: 42 };

const billOnce = SCHEDULE_PRESETS.find((s) => s.id === "on-completion");
const halfDeposit = SCHEDULE_PRESETS.find((s) => s.id === "half-deposit");
const thirds = SCHEDULE_PRESETS.find((s) => s.id === "thirds");

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

test("billing once at the end leaves the whole project unpaid on handover day", () => {
  const out = scheduleOutcome(billOnce, SHARED);
  assert.equal(out.unpaidAtHandover, 6000);
  assert.equal(out.cashBeforeHandover, 0);
  // Invoiced on day 30, Net 30, twelve days late.
  assert.equal(out.fullyPaidDay, 72);
  assert.equal(out.daysUnpaidAfterHandover, 42);
  assert.equal(out.weightedDaysToCash, 72);
});

test("a 50% deposit halves what is unpaid at handover", () => {
  const out = scheduleOutcome(halfDeposit, SHARED);
  // The deposit clears on day 5; the balance is invoiced at handover and
  // collected on the ordinary 42-day cycle.
  assert.equal(out.milestones[0].paidDay, 5);
  assert.equal(out.milestones[1].paidDay, 72);
  assert.equal(out.cashBeforeHandover, 3000);
  assert.equal(out.unpaidAtHandover, 3000);
  assert.equal(out.peakExposure, 3000);
});

test("a deposit collected like any other invoice protects nothing on a short project", () => {
  // This is the finding, not a corner case: the percentage on the contract is
  // irrelevant if the money lands after the work is finished.
  const out = scheduleOutcome(halfDeposit, SLOW_DEPOSIT);
  assert.equal(out.milestones[0].paidDay, 42);
  assert.equal(out.cashBeforeHandover, 0);
  assert.equal(out.unpaidAtHandover, 6000);
  assert.equal(out.peakExposure, 6000);
  // And no percentage rescues it, which is why the solve returns null.
  assert.equal(depositForPeakExposure(3000, SLOW_DEPOSIT), null);
});

test("a midpoint bill only helps if it too clears before handover", () => {
  // Thirds on a 42-day cycle: the day-15 progress bill lands on day 57, well
  // after the day-30 handover, so only the deposit is in hand.
  const out = scheduleOutcome(thirds, SHARED);
  assert.equal(out.milestones.map((m) => m.paidDay).join(","), "5,57,72");
  assert.equal(out.cashBeforeHandover, 2040);
  assert.equal(out.unpaidAtHandover, 3960);
  // So on these terms the three-way split is *worse* at handover than a
  // straight half deposit, which is not what the schedule looks like.
  assert.ok(out.unpaidAtHandover > scheduleOutcome(halfDeposit, SHARED).unpaidAtHandover);
});

test("milestones must add up to the whole project", () => {
  assert.throws(
    () => scheduleOutcome({ id: "bad", milestones: [{ label: "Half", pct: 50, atPct: 0 }] }, SHARED),
    /adds up to 50%/,
  );
});

test("funding cost is the carrying rate on dollar-days of unpaid work", () => {
  const out = scheduleOutcome(billOnce, SHARED);
  // Exposure ramps 0 → $6,000 over 30 days, then holds $6,000 for 42 more.
  const expectedDollarDays = (6000 / 2) * 30 + 6000 * 42;
  close(out.exposureDayDollars, expectedDollarDays);
  close(out.fundingCost, (expectedDollarDays * 0.24) / 365);
  close(out.netAfterFunding, 6000 - out.fundingCost);
});

test("a prepaid client is not credited back as if they were lending to you", () => {
  // 100% up front on Net 0: exposure is negative for the whole project, and a
  // negative carrying cost would be a fiction.
  const prepaid = {
    id: "prepaid",
    label: "Paid in full up front",
    milestones: [{ label: "Full prepayment", pct: 100, atPct: 0 }],
  };
  const out = scheduleOutcome(prepaid, {
    ...SHARED,
    termsDays: 0,
    avgDaysLate: 0,
    depositCollectionDays: 0,
  });
  assert.equal(out.fundingCost, 0);
  assert.equal(out.exposureDayDollars, 0);
  assert.equal(out.unpaidAtHandover, 0);
  assert.equal(out.peakExposure, 0);
});

test("the positive-area integral catches the segment where exposure crosses zero", () => {
  // Half up front on Net 0 over a 40-day project: the client is $3,000 ahead
  // on day 0 and you are level on day 20. Only days 20–40 are financed by you,
  // so the dollar-days are the triangle after the crossing, not the whole span.
  const half = {
    id: "half-prepaid",
    label: "Half up front",
    milestones: [
      { label: "Deposit", pct: 50, atPct: 0 },
      { label: "Balance", pct: 50, atPct: 100 },
    ],
  };
  const out = scheduleOutcome(half, {
    projectValue: 6000,
    projectDays: 40,
    termsDays: 0,
    avgDaysLate: 0,
    depositCollectionDays: 0,
    annualCarryRate: 24,
  });
  // Days 0–40: exposure runs −3000 → +3000, positive only over the last 20 days.
  close(out.exposureDayDollars, (3000 * 20) / 2);
  assert.equal(out.unpaidAtHandover, 3000);
  assert.equal(out.peakExposure, 3000);
});

test("the deposit solve inverts the peak-exposure formula it is derived from", () => {
  // Short collection cycle, so a deposit genuinely can cap the peak.
  const fast = { ...SHARED, termsDays: 5, avgDaysLate: 0 };
  const share = depositForPeakExposure(2400, fast);
  assert.equal(share, 60);
  const out = scheduleOutcome(depositSchedule(share), fast);
  close(out.peakExposure, 2400, 1e-9);
});

test("no deposit caps the peak below what is delivered before the first payment", () => {
  const fast = { ...SHARED, termsDays: 5, avgDaysLate: 0 };
  // Five days of a 30-day project is $1,000 of work delivered unpaid, so
  // $1,000 is exactly reachable and anything under it is not.
  assert.equal(depositForPeakExposure(1000, fast), 83.33);
  assert.equal(depositForPeakExposure(999, fast), null);
  // A ceiling at or above the project value needs no deposit at all.
  assert.equal(depositForPeakExposure(6000, fast), 0);
});

test("the comparison ranks on unpaid work at handover and reports timing separately", () => {
  const fast = { ...SHARED, termsDays: 7, avgDaysLate: 0 };
  const comparison = compareSchedules([...SCHEDULE_PRESETS, depositSchedule(30)], fast);
  assert.equal(comparison.outcomes.length, 4);
  assert.equal(comparison.safest.id, "thirds");
  assert.equal(comparison.billOnce.id, "on-completion");
  // Ranked really is sorted, and billing once really is worst.
  assert.equal(comparison.ranked[comparison.ranked.length - 1].id, "on-completion");
  for (let i = 1; i < comparison.ranked.length; i += 1) {
    assert.ok(comparison.ranked[i].unpaidAtHandover >= comparison.ranked[i - 1].unpaidAtHandover);
  }
});

test("the readout names the exposure gap, and never tells the reader what to do", () => {
  const fast = { ...SHARED, termsDays: 7, avgDaysLate: 0 };
  const comparison = compareSchedules([...SCHEDULE_PRESETS, depositSchedule(50)], fast);
  const note = scheduleNote(comparison, "your-deposit");
  assert.match(note, /\$3,000\.00/);
  assert.match(note, /\$6,000\.00/);
  assert.doesNotMatch(note, /you should|you must|always ask|never bill/i);
});

test("the readout stays honest when a deposit changes nothing", () => {
  // On the shipped defaults nothing clears before handover, so the split
  // cannot reduce handover exposure and the sentence must not pretend it did.
  const comparison = compareSchedules([...SCHEDULE_PRESETS, depositSchedule(50)], SLOW_DEPOSIT);
  const note = scheduleNote(comparison, "your-deposit");
  assert.match(note, /does not reduce what is unpaid on handover day/);
  assert.match(note, /nothing on this schedule clears inside a 30-day project/);
  assert.match(note, /the deposit takes 42 days to collect/);
  // It still reports the financing it does save, rather than rounding the
  // whole split down to "useless".
  assert.match(note, /does cut financing cost by \$59\.18/);
  assert.match(note, /shortening the collection cycle is the only thing that moves the exposure/);
});

test("the contract wording describes the schedule that was built", () => {
  const out = scheduleOutcome(depositSchedule(40), SHARED);
  const copy = scheduleCopy(out);
  assert.match(copy, /\$6,000\.00 project/);
  assert.match(copy, /Deposit: 40% of the project fee \(\$2,400\.00\), invoiced on acceptance of this proposal/);
  assert.match(copy, /Balance on completion: 60% of the project fee \(\$3,600\.00\), invoiced on completion/);
  assert.match(copy, /payable within 30 days/);
  // It states terms, not the late-payment assumption, which is not a term.
  assert.doesNotMatch(copy, /42 days/);
});

test("a midpoint progress bill is worded as a progress point", () => {
  const copy = scheduleCopy(scheduleOutcome(thirds, SHARED));
  assert.match(copy, /Midpoint progress bill: 33% of the project fee \(\$1,980\.00\), invoiced at the 50% progress point/);
});

test("inputs that cannot describe a project are rejected rather than guessed", () => {
  assert.throws(() => scheduleOutcome(billOnce, { ...SHARED, projectValue: 0 }), /greater than zero/);
  assert.throws(() => scheduleOutcome(billOnce, { ...SHARED, projectDays: 0 }), /more than zero days/);
  assert.throws(() => scheduleOutcome(billOnce, { ...SHARED, termsDays: -1 }), /zero or more days/);
  assert.throws(() => scheduleOutcome(billOnce, { ...SHARED, avgDaysLate: -3 }), /zero or more/);
  assert.throws(() => scheduleOutcome(billOnce, { ...SHARED, annualCarryRate: -1 }), /non-negative/);
  assert.throws(() => scheduleOutcome(billOnce, { ...SHARED, depositCollectionDays: -2 }), /zero or more/);
  assert.throws(() => scheduleOutcome(billOnce, { ...SHARED, projectValue: "many" }), /must be a number/);
  assert.throws(() => depositSchedule(140), /between 0 and 100/);
});

test("longer terms cost more to finance and put the money further away", () => {
  const net15 = scheduleOutcome(billOnce, { ...SHARED, termsDays: 15 });
  const net60 = scheduleOutcome(billOnce, { ...SHARED, termsDays: 60 });
  assert.ok(net60.fundingCost > net15.fundingCost);
  assert.equal(net60.fullyPaidDay - net15.fullyPaidDay, 45);
  // Terms change when you are paid, never how much finished work is unpaid on
  // the day you hand it over under a single end invoice.
  assert.equal(net15.unpaidAtHandover, net60.unpaidAtHandover);
});
