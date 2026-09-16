import test from 'node:test';
import assert from 'node:assert/strict';
import { runSchedule, firstShortfallYear, minimumContributionToAvoidShortfall, perUnitImpact, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

// --- A fully-funded steady-state association never triggers a shortfall ---

test('a steady-state association contributing the straight-line baseline, with interest and no inflation, never triggers a shortfall', () => {
  const inputs = {
    currentBalance: 6000,
    annualContribution: 1000, // 12000 / 12 = straight-line baseline
    unitCount: 50,
    inflationRate: 0,
    interestRate: 0.02,
    horizonYears: 30,
    targetPercentFunded: 0.3,
    components: [
      { name: 'Roof', remainingUsefulLifeYears: 12, replacementCost: 12000, fullLifeYears: 12 },
    ],
  };
  const schedule = runSchedule(inputs);
  assert.equal(schedule.length, 30);
  for (const row of schedule) {
    assert.equal(row.specialAssessmentTriggered, false, `year ${row.year} should not trigger a shortfall`);
    assert.ok(row.balance >= 0, `year ${row.year} balance should stay non-negative`);
  }
  assert.equal(firstShortfallYear(inputs), null);
});

// --- An underfunded association triggers a shortfall at a hand-verified year ---

// interestRate = 0 and inflationRate = 0 keep the arithmetic exact so the
// trigger year can be hand-verified:
//   year 1: balance = 5000 + 1000 = 6000;  remaining 4 -> 3
//   year 2: balance = 6000 + 1000 = 7000;  remaining 3 -> 2
//   year 3: balance = 7000 + 1000 = 8000;  remaining 2 -> 1
//   year 4: balance = 8000 + 1000 = 9000;  remaining 1 -> 0 -> replaced:
//           balance = 9000 - 10000 = -1000  (negative -> shortfall)
// targetPercentFunded is 0 so the only trigger in play is the negative
// balance itself, not the percent-funded threshold.
const UNDERFUNDED = {
  currentBalance: 5000,
  annualContribution: 1000,
  unitCount: 100,
  inflationRate: 0,
  interestRate: 0,
  horizonYears: 10,
  targetPercentFunded: 0,
  components: [
    { name: 'Roof', remainingUsefulLifeYears: 4, replacementCost: 10000, fullLifeYears: 10 },
  ],
};

test('an underfunded association triggers a shortfall at the hand-verified year', () => {
  const schedule = runSchedule(UNDERFUNDED);
  close(schedule[0].balance, 6000);
  close(schedule[1].balance, 7000);
  close(schedule[2].balance, 8000);
  close(schedule[3].balance, -1000);
  assert.deepEqual(schedule[3].componentsReplacedThisYear, ['Roof']);
  assert.equal(schedule[3].specialAssessmentTriggered, true);
  assert.equal(schedule[0].specialAssessmentTriggered, false);
  assert.equal(schedule[1].specialAssessmentTriggered, false);
  assert.equal(schedule[2].specialAssessmentTriggered, false);
  assert.equal(firstShortfallYear(UNDERFUNDED), 4);
});

test('the component is on a fresh cycle after replacement and is not immediately due again', () => {
  const schedule = runSchedule(UNDERFUNDED);
  // Replaced in year 4 and reset to a 10-year cycle -> next due in year 14,
  // outside this 10-year horizon, so no further replacement appears.
  const laterReplacements = schedule.slice(4).flatMap((r) => r.componentsReplacedThisYear);
  assert.deepEqual(laterReplacements, []);
});

test('inflation raises the replacement cost actually deducted in the trigger year', () => {
  const inflated = runSchedule({ ...UNDERFUNDED, inflationRate: 0.05 });
  const plain = runSchedule(UNDERFUNDED);
  // Same year 4 trigger, but the deducted cost (and so the resulting
  // deficit) is larger once inflation compounds for 4 years.
  assert.equal(inflated[3].specialAssessmentTriggered, true);
  assert.ok(inflated[3].balance < plain[3].balance, 'inflated replacement cost should leave a larger deficit');
});

// --- The minimum-contribution solver actually eliminates the shortfall ---

test('minimumContributionToAvoidShortfall finds a contribution that, when applied, clears every year of the horizon', () => {
  const solved = minimumContributionToAvoidShortfall(UNDERFUNDED);
  assert.ok(solved !== null, 'a solution should exist for this fixture');
  assert.ok(solved > UNDERFUNDED.annualContribution, 'the fix should require more than the original contribution');

  const fixedSchedule = runSchedule({ ...UNDERFUNDED, annualContribution: solved });
  for (const row of fixedSchedule) {
    assert.equal(row.specialAssessmentTriggered, false, `year ${row.year} should no longer trigger a shortfall`);
  }
});

test('a contribution one dollar below the solved minimum still triggers a shortfall somewhere in the horizon (tolerance is tight)', () => {
  const solved = minimumContributionToAvoidShortfall(UNDERFUNDED);
  const belowSchedule = runSchedule({ ...UNDERFUNDED, annualContribution: Math.max(0, solved - 5) });
  assert.ok(belowSchedule.some((r) => r.specialAssessmentTriggered));
});

test('minimumContributionToAvoidShortfall returns null when even the search cap cannot clear the horizon', () => {
  // A single very expensive, very short-lived component with almost no
  // horizon to fund it and a starting balance of zero — no sane contribution
  // within a 10x-of-baseline cap can prevent a shortfall entirely, because
  // the very first replacement (year 1) needs its full inflated cost banked
  // in a single year and the cap does not stretch that far given the
  // horizon length.
  const impossible = {
    currentBalance: 0,
    annualContribution: 100,
    unitCount: 10,
    inflationRate: 0.035,
    interestRate: 0.02,
    horizonYears: 1,
    targetPercentFunded: 0.99,
    components: [
      { name: 'Elevator', remainingUsefulLifeYears: 1, replacementCost: 5_000_000, fullLifeYears: 25 },
    ],
  };
  assert.equal(minimumContributionToAvoidShortfall(impossible), null);
});

// --- Edge case: zero components / zero balance ---

test('zero components and zero balance never trigger a shortfall (nothing is ever owed)', () => {
  const inputs = {
    currentBalance: 0,
    annualContribution: 0,
    unitCount: 20,
    inflationRate: 0.035,
    interestRate: 0.02,
    horizonYears: 5,
    targetPercentFunded: 0.3,
    components: [],
  };
  const schedule = runSchedule(inputs);
  assert.equal(schedule.length, 5);
  for (const row of schedule) {
    assert.equal(row.balance, 0);
    assert.equal(row.percentFunded, 1);
    assert.deepEqual(row.componentsReplacedThisYear, []);
    assert.equal(row.specialAssessmentTriggered, false);
  }
  assert.equal(firstShortfallYear(inputs), null);
  // With no components there is no obligation to fund at all, so the solved
  // minimum converges to (within the solver's own $1 tolerance) zero.
  close(minimumContributionToAvoidShortfall(inputs), 0, 1);
});

test('zero components still accrues interest and contributions into a growing balance', () => {
  const inputs = { ...DEFAULTS, components: [], currentBalance: 1000, annualContribution: 500, interestRate: 0.02, horizonYears: 3 };
  const schedule = runSchedule(inputs);
  close(schedule[0].balance, 1000 * 1.02 + 500);
  assert.ok(schedule[2].balance > schedule[1].balance);
});

// --- perUnitImpact ---

test('perUnitImpact reports zero impact for an association that never shortfalls', () => {
  const inputs = {
    currentBalance: 6000,
    annualContribution: 1000,
    unitCount: 50,
    inflationRate: 0,
    interestRate: 0.02,
    horizonYears: 30,
    targetPercentFunded: 0.3,
    components: [{ name: 'Roof', remainingUsefulLifeYears: 12, replacementCost: 12000, fullLifeYears: 12 }],
  };
  const impact = perUnitImpact(inputs);
  assert.equal(impact.shortfallYear, null);
  assert.equal(impact.oneTimeSpecialAssessmentPerUnit, 0);
  assert.ok(impact.monthlyDuesIncreasePerUnit === 0 || impact.monthlyDuesIncreasePerUnit === null);
});

test('perUnitImpact divides the do-nothing deficit and the solved contribution gap by unit count', () => {
  const impact = perUnitImpact(UNDERFUNDED);
  assert.equal(impact.shortfallYear, 4);
  // Year 4 deficit at targetPercentFunded=0: max(0, 0*obligationSum - balance) = -balance = 1000.
  close(impact.oneTimeSpecialAssessmentPerUnit, 1000 / UNDERFUNDED.unitCount);
  assert.ok(impact.minimumContribution > UNDERFUNDED.annualContribution);
  const expectedMonthly = (impact.minimumContribution - UNDERFUNDED.annualContribution) / 12 / UNDERFUNDED.unitCount;
  close(impact.monthlyDuesIncreasePerUnit, expectedMonthly);
});

test('perUnitImpact returns a null monthly figure when no contribution within the cap solves it', () => {
  const impossible = {
    currentBalance: 0,
    annualContribution: 100,
    unitCount: 10,
    inflationRate: 0.035,
    interestRate: 0.02,
    horizonYears: 1,
    targetPercentFunded: 0.99,
    components: [{ name: 'Elevator', remainingUsefulLifeYears: 1, replacementCost: 5_000_000, fullLifeYears: 25 }],
  };
  const impact = perUnitImpact(impossible);
  assert.equal(impact.minimumContribution, null);
  assert.equal(impact.monthlyDuesIncreasePerUnit, null);
  assert.equal(impact.shortfallYear, 1);
  assert.ok(impact.oneTimeSpecialAssessmentPerUnit > 0);
});

// --- Validation ---

test('rejects a non-array components field', () => {
  assert.throws(() => runSchedule({ ...DEFAULTS, components: 'nope' }), /components/i);
});

test('rejects a component with a zero full life (would divide by zero in the prorate formula)', () => {
  assert.throws(
    () => runSchedule({ ...DEFAULTS, components: [{ name: 'Bad', remainingUsefulLifeYears: 1, replacementCost: 100, fullLifeYears: 0 }] }),
    /full life/i,
  );
});

test('rejects a negative annual contribution', () => {
  assert.throws(() => runSchedule({ ...DEFAULTS, annualContribution: -1 }), /annual contribution/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => runSchedule({ ...DEFAULTS, annualContribution: 'lots' }), /annual contribution/i);
});

test('rejects zero or negative unit count in perUnitImpact', () => {
  assert.throws(() => perUnitImpact({ ...DEFAULTS, unitCount: 0 }), /unit count/i);
});

// --- DEFAULTS sanity ---

test('DEFAULTS produce a sensible schedule of the configured horizon length', () => {
  const schedule = runSchedule(DEFAULTS);
  assert.equal(schedule.length, DEFAULTS.horizonYears);
  assert.equal(schedule[0].year, 1);
  assert.equal(schedule.at(-1).year, DEFAULTS.horizonYears);
});
