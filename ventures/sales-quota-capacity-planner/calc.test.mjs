import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planCapacity, rampFactor, effectiveAttainment, normalizeInputs, parseRepRoster, monthIndex, monthLabel,
  toCsv, encodeState, decodeState, ATTAINMENT_DELTAS, ATTRITION_MULTIPLIERS,
} from './calc.mjs';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// Round numbers on purpose: quota 120,000 at 100% attainment is exactly 10,000 per ramped rep-month.
const BASE = {
  planStart: '2027-01', targetBookings: 270000, quota: 120000, rampMonths: 3, rampCurve: 'linear',
  pctAtOrOverQuota: 100, avgAttainmentOfRest: 100, monthlyAttritionPct: 0, hiringLeadTimeMonths: 2,
  existingReps: [], pipelineCoverage: 3, winRatePct: 33.3333, fullyLoadedAnnualCost: 120000,
};
const withIn = (o) => ({ ...BASE, ...o });

test('month helpers round-trip and reject bad input', () => {
  assert.equal(monthLabel(monthIndex('2027-01')), '2027-01');
  assert.equal(monthLabel(monthIndex('2027-12') + 1), '2028-01');
  assert.throws(() => monthIndex('2027-13'), /YYYY-MM/);
  assert.throws(() => monthIndex(''), /YYYY-MM/);
});

test('linear ramp: month k of an N-month ramp is k/N, capped at 100%', () => {
  assert.equal(rampFactor(0, 4), 0);
  assert.equal(rampFactor(1, 4), 0.25);
  assert.equal(rampFactor(2, 4), 0.5);
  assert.equal(rampFactor(4, 4), 1);
  assert.equal(rampFactor(30, 4), 1);
  assert.equal(rampFactor(1, 0), 1);
});

test('cliff ramp: nothing until the ramp is over, then 100%', () => {
  assert.equal(rampFactor(3, 3, 'cliff'), 0);
  assert.equal(rampFactor(4, 3, 'cliff'), 1);
});

test('effective attainment blends the at/over-quota share with the rest', () => {
  const n = normalizeInputs(withIn({ pctAtOrOverQuota: 55, avgAttainmentOfRest: 70 }));
  close(effectiveAttainment(n), 86.5);
});

test('fully ramped reps with no attrition book quota / 12 per month', () => {
  const r = planCapacity(withIn({ existingReps: [{ count: 2, start: '2020-01' }], targetBookings: 240000 }));
  assert.equal(r.months.length, 12);
  for (const m of r.months) { close(m.rampedRepEquivalents, 2); close(m.bookings, 20000); }
  close(r.plannedBookings, 240000);
  assert.equal(r.hiresNeeded, 0);
  assert.deepEqual(r.cohorts, []);
  assert.equal(r.compare, null);
});

test('existing rep mid-ramp: tenure comes from the start date', () => {
  // Started 2026-12 with a 3-month ramp: plan month 1 is tenure month 2 (2/3), month 2 is 3/3.
  const r = planCapacity(withIn({ existingReps: [{ count: 1, start: '2026-12' }], targetBookings: 1 }));
  close(r.months[0].rampedRepEquivalents, 2 / 3);
  close(r.months[1].rampedRepEquivalents, 1);
});

test('a new hire ramps linearly from its start month', () => {
  // One hire in plan month 2: 1/3 + 2/3 + eight full months = 9 rep-months = 90,000.
  const r = planCapacity(withIn({ targetBookings: 90000 }));
  assert.equal(r.hiresNeeded, 1);
  close(r.plannedBookings, 90000);
  close(r.months[2].rampedRepEquivalents, 1 / 3);
  close(r.months[3].rampedRepEquivalents, 2 / 3);
  close(r.months[4].rampedRepEquivalents, 1);
  assert.equal(r.months[0].rampedRepEquivalents, 0);
});

test('attrition shrinks a cohort geometrically from the first plan month', () => {
  const r = planCapacity(withIn({ existingReps: [{ count: 1000, start: '2020-01' }], monthlyAttritionPct: 10, targetBookings: 1 }));
  close(r.months[0].headcount, 1000);
  close(r.months[1].headcount, 900);
  close(r.months[11].headcount, 1000 * Math.pow(0.9, 11), 1e-6);
  const geometric = (1 - Math.pow(0.9, 12)) / 0.1; // sum of 0.9^t, t = 0..11
  close(r.plannedBookings, 1000 * geometric * 10000, 1e-3);
});

test('a hire is not exposed to attrition in its start month', () => {
  const r = planCapacity(withIn({ monthlyAttritionPct: 10, targetBookings: 90000, rampMonths: 0 }));
  const first = r.months.find((m) => m.headcount > 0);
  close(first.headcount, r.cohorts[0].count);
});

test('reverse planning: no slack means every hire starts at the earliest month', () => {
  const r = planCapacity(withIn({ targetBookings: 270000 }));
  assert.equal(r.hiresNeeded, 3);
  assert.equal(r.earliestStart, '2027-03');
  assert.deepEqual(r.cohorts, [{ startMonth: 2, startDate: '2027-03', count: 3, openRequisitionBy: '2027-01', requisitionOffsetMonths: 0 }]);
  close(r.gapVsTarget, 0);
});

test('reverse planning: slack lets one hire slip to the latest month that still hits the target', () => {
  // 3 hires needed (ceil(200000 / 90000)); the third can start in plan month 9
  // (1/3 + 2/3 + 1 = 2 rep-months = 20,000, exactly the slack).
  const r = planCapacity(withIn({ targetBookings: 200000 }));
  assert.equal(r.hiresNeeded, 3);
  assert.deepEqual(r.cohorts.map((c) => [c.startDate, c.count]), [['2027-03', 2], ['2027-10', 1]]);
  assert.equal(r.cohorts[1].openRequisitionBy, '2027-08');
  assert.ok(r.plannedBookings >= 200000 - 1e-6);
});

test('lead time moves the requisition date and the earliest start together', () => {
  const r = planCapacity(withIn({ targetBookings: 90000, hiringLeadTimeMonths: 4 }));
  // starts month 4: 1/3 + 2/3 + 6 = 7 rep-months = 70,000 per hire, so 2 hires
  assert.equal(r.earliestStart, '2027-05');
  assert.equal(r.hiresNeeded, 2);
  assert.ok(r.cohorts.every((c) => c.requisitionOffsetMonths >= 0));
});

test('infeasible when the lead time uses up the whole year', () => {
  const r = planCapacity(withIn({ hiringLeadTimeMonths: 12 }));
  assert.equal(r.feasible, false);
  assert.equal(r.hiresNeeded, null);
  assert.equal(r.compare, null);
  assert.match(r.notes[0], /cannot close the gap/);
});

test('infeasible when a cliff ramp outlasts the remaining months', () => {
  const r = planCapacity(withIn({ hiringLeadTimeMonths: 10, rampMonths: 3, rampCurve: 'cliff' }));
  assert.equal(r.feasible, false);
});

test('a scheduled future start among existing reps behaves like a hire', () => {
  const r = planCapacity(withIn({ existingReps: [{ count: 1, start: '2027-03' }], targetBookings: 1 }));
  assert.equal(r.months[0].headcount, 0);
  close(r.months[2].rampedRepEquivalents, 1 / 3);
  close(r.plannedBookings, 90000);
});

test('hire early vs hire late: early books more and costs more', () => {
  const r = planCapacity(withIn({ targetBookings: 200000 }));
  const { early, late } = r.compare;
  // three hires at months 2,2,2 vs 2,2,9, monthly cost 10,000, no attrition
  close(early.cost, 3 * 10 * 10000);
  close(late.cost, (10 + 10 + 3) * 10000);
  close(early.bookings, 270000);
  close(late.bookings, 200000);
  close(r.compare.extraBookingsFromEarly, 70000);
  close(r.compare.extraCostOfEarly, 70000);
  close(r.compare.costPerExtraBookingDollar, 1);
  assert.ok(late.shortfallAtLowerAttainment > early.shortfallAtLowerAttainment);
  close(late.bookingsAtLowerAttainment, 180000);
});

test('sensitivity grid: base cell matches the plan, lower attainment never needs fewer hires', () => {
  const r = planCapacity(withIn({ targetBookings: 200000, monthlyAttritionPct: 1 }));
  assert.equal(r.sensitivity.length, ATTAINMENT_DELTAS.length * ATTRITION_MULTIPLIERS.length);
  const cell = (d, m) => r.sensitivity.find((c) => c.attainmentDeltaPoints === d && c.attritionMultiplier === m);
  assert.equal(cell(0, 1).hiresNeeded, r.hiresNeeded);
  close(cell(0, 1).planBookings, r.plannedBookings);
  for (const m of ATTRITION_MULTIPLIERS) {
    assert.ok(cell(-10, m).hiresNeeded >= cell(0, m).hiresNeeded);
    assert.ok(cell(0, m).hiresNeeded >= cell(10, m).hiresNeeded);
  }
  for (const d of ATTAINMENT_DELTAS) assert.ok(cell(d, 2).hiresNeeded >= cell(d, 0.5).hiresNeeded);
  assert.ok(cell(-10, 1).planGap > cell(10, 1).planGap);
});

test('pipeline coverage caps what hires can book', () => {
  const r = planCapacity(withIn({ pipelineCoverage: 2, winRatePct: 25 }));
  close(r.pipeline.ceiling, 2 * 270000 * 0.25);
  close(r.pipeline.requiredCoverage, 4);
  assert.equal(r.pipeline.limited, true);
  close(r.pipeline.gap, 270000 - 135000);
  assert.equal(planCapacity(withIn({ pipelineCoverage: 5, winRatePct: 25 })).pipeline.limited, false);
});

test('steady-state headcount rule of thumb ignores ramp and attrition', () => {
  const r = planCapacity(withIn({ pctAtOrOverQuota: 50, avgAttainmentOfRest: 50 }));
  close(r.effectiveAttainmentPct, 75);
  close(r.expectedBookingsPerRampedRep, 90000);
  close(r.steadyStateRepsNeeded, 3);
});

test('zero ramp, zero attrition, zero lead time: hires book from month one', () => {
  const r = planCapacity(withIn({ rampMonths: 0, hiringLeadTimeMonths: 0, targetBookings: 120000 }));
  assert.equal(r.hiresNeeded, 1);
  close(r.months[0].bookings, 10000);
});

test('zero attainment cannot be fixed with hires', () => {
  const r = planCapacity(withIn({ pctAtOrOverQuota: 0, avgAttainmentOfRest: 0 }));
  assert.equal(r.feasible, false);
});

test('is deterministic', () => {
  assert.deepEqual(planCapacity(withIn({ targetBookings: 200000 })), planCapacity(withIn({ targetBookings: 200000 })));
});

test('bad input throws a readable message instead of clamping', () => {
  assert.throws(() => planCapacity(withIn({ targetBookings: 0 })), /target/);
  assert.throws(() => planCapacity(withIn({ quota: -5 })), /quota/);
  assert.throws(() => planCapacity(withIn({ pctAtOrOverQuota: 101 })), /at most 100/);
  assert.throws(() => planCapacity(withIn({ rampMonths: 2.5 })), /whole number/);
  assert.throws(() => planCapacity(withIn({ monthlyAttritionPct: 'abc' })), /number/);
  assert.throws(() => planCapacity(withIn({ hiringLeadTimeMonths: '' })), /required/);
  assert.throws(() => planCapacity(withIn({ planStart: '2027-1' })), /YYYY-MM/);
  assert.throws(() => planCapacity(withIn({ rampCurve: 'wavy' })), /Ramp curve/);
  assert.throws(() => planCapacity(withIn({ winRatePct: 0 })), /win rate/);
});

test('roster text parses count and start month, one cohort per line', () => {
  assert.deepEqual(parseRepRoster('3, 2025-03\n 2 @ 2026-01 \n\n1 2026-07'), [
    { count: 3, start: '2025-03' }, { count: 2, start: '2026-01' }, { count: 1, start: '2026-07' },
  ]);
  assert.throws(() => parseRepRoster('three, 2025-03'), /line 1/);
  assert.throws(() => parseRepRoster('3, 2025-13'), /YYYY-MM/);
  const r = planCapacity({ ...BASE, existingReps: '2, 2020-01', targetBookings: 240000 });
  assert.equal(r.hiresNeeded, 0);
});

test('CSV has a header, twelve month rows and the hire cohorts', () => {
  const csv = toCsv(planCapacity(withIn({ targetBookings: 200000 })));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'month,headcount,ramped_rep_equivalents,expected_bookings,cumulative_bookings,cumulative_target,cumulative_gap');
  assert.equal(lines.length, 1 + 12 + 1 + 1 + 2);
  assert.ok(lines.includes('2027-03,2,2027-01'));
  assert.ok(lines.includes('2027-10,1,2027-08'));
});

test('URL state round-trips every input including the roster', () => {
  const values = { ...BASE, existingReps: '3, 2025-03\n2, 2026-01', targetBookings: '200000' };
  const qs = encodeState(values);
  assert.ok(!qs.includes('%0A'), 'roster is compacted to one line');
  const back = decodeState('?' + qs);
  assert.equal(back.existingReps, '3, 2025-03\n2, 2026-01');
  assert.equal(back.targetBookings, '200000');
  assert.deepEqual(planCapacity({ ...BASE, ...back }).cohorts, planCapacity({ ...BASE, existingReps: back.existingReps, targetBookings: 200000 }).cohorts);
  assert.deepEqual(decodeState(''), {});
  assert.deepEqual(decodeState('?evil=1&__proto__=x'), {});
});
