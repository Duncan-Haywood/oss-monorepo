import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAssignmentQuote,
  computeCancellationFee,
  DEFAULT_MINIMUM_HOURS,
  DEFAULT_CANCELLATION_TIERS,
  EVENING_WEEKEND_MULTIPLIER,
  HOLIDAY_MULTIPLIER,
  TEAM_INTERPRETING_MULTIPLIER,
  TEAM_RECOMMENDED_HOURS,
} from "./calc.mjs";

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

// --- computeAssignmentQuote --------------------------------------------

test("zero hours or zero rate produces a zero total and a missing-input finding", () => {
  const result = computeAssignmentQuote({ hoursRequested: 0, hourlyRate: 60 });
  assert.equal(result.total, 0);
  assert.ok(findingIds(result).includes("missing-input"));
});

test("a booking under the minimum is billed at the minimum, with a finding", () => {
  const result = computeAssignmentQuote({ hoursRequested: 0.75, hourlyRate: 60 });
  assert.equal(result.billableHours, DEFAULT_MINIMUM_HOURS);
  assert.equal(result.interpretingFee, DEFAULT_MINIMUM_HOURS * 60);
  assert.ok(result.minimumApplied);
  assert.ok(findingIds(result).includes("minimum-applied"));
});

test("a custom minimum overrides the two-hour default", () => {
  const result = computeAssignmentQuote({ hoursRequested: 1, hourlyRate: 60, minimumHours: 3 });
  assert.equal(result.billableHours, 3);
});

test("a booking at or above the minimum bills the requested hours exactly", () => {
  const result = computeAssignmentQuote({ hoursRequested: 4, hourlyRate: 60 });
  assert.equal(result.billableHours, 4);
  assert.equal(result.interpretingFee, 240);
  assert.ok(!result.minimumApplied);
  assert.ok(!findingIds(result).includes("minimum-applied"));
});

test("an evening/weekend differential scales the interpreting fee", () => {
  const standard = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 60, differential: "none" });
  const evening = computeAssignmentQuote({
    hoursRequested: 3,
    hourlyRate: 60,
    differential: "evening_weekend",
  });
  assert.equal(evening.interpretingFee, standard.interpretingFee * EVENING_WEEKEND_MULTIPLIER);
});

test("a holiday differential scales the interpreting fee more than evening/weekend", () => {
  const holiday = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 60, differential: "holiday" });
  assert.equal(holiday.differentialMultiplier, HOLIDAY_MULTIPLIER);
  assert.equal(holiday.interpretingFee, 3 * 60 * HOLIDAY_MULTIPLIER);
});

test("an unrecognized differential falls back to standard (no surcharge)", () => {
  const unknown = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 60, differential: "nonsense" });
  const standard = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 60, differential: "none" });
  assert.equal(unknown.total, standard.total);
});

test("team interpreting doubles the interpreting fee and is disclosed", () => {
  const solo = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 60 });
  const team = computeAssignmentQuote({ hoursRequested: 3, hourlyRate: 60, teamInterpreting: true });
  assert.equal(team.interpretingFee, solo.interpretingFee * TEAM_INTERPRETING_MULTIPLIER);
  assert.ok(findingIds(team).includes("team-interpreting-priced"));
});

test("a long legal/medical/mental-health booking with no team flags the team-interpreting recommendation", () => {
  for (const setting of ["legal", "medical", "mental_health"]) {
    const result = computeAssignmentQuote({
      hoursRequested: TEAM_RECOMMENDED_HOURS + 1,
      hourlyRate: 60,
      setting,
    });
    assert.ok(
      findingIds(result).includes("team-interpreting-recommended"),
      `expected a team recommendation for a long ${setting} booking`,
    );
  }
});

test("the team-interpreting recommendation does not fire for a general setting", () => {
  const result = computeAssignmentQuote({
    hoursRequested: TEAM_RECOMMENDED_HOURS + 1,
    hourlyRate: 60,
    setting: "general",
  });
  assert.ok(!findingIds(result).includes("team-interpreting-recommended"));
});

test("the team-interpreting recommendation does not fire once team interpreting is already checked", () => {
  const result = computeAssignmentQuote({
    hoursRequested: TEAM_RECOMMENDED_HOURS + 1,
    hourlyRate: 60,
    setting: "legal",
    teamInterpreting: true,
  });
  assert.ok(!findingIds(result).includes("team-interpreting-recommended"));
});

test("the team-interpreting recommendation does not fire for a short booking even in a high-stakes setting", () => {
  const result = computeAssignmentQuote({
    hoursRequested: TEAM_RECOMMENDED_HOURS,
    hourlyRate: 60,
    setting: "legal",
  });
  assert.ok(!findingIds(result).includes("team-interpreting-recommended"));
});

test("portal-to-portal travel time is billed round trip at the billing fraction", () => {
  const result = computeAssignmentQuote({
    hoursRequested: 2,
    hourlyRate: 60,
    travelMinutesEachWay: 30,
    travelBillingFraction: 1,
  });
  // 30 min each way = 1 hour round trip, at full rate
  assert.equal(result.travelTimeFee, 60);
});

test("a reduced travel-billing fraction scales the travel fee down", () => {
  const result = computeAssignmentQuote({
    hoursRequested: 2,
    hourlyRate: 60,
    travelMinutesEachWay: 30,
    travelBillingFraction: 0.5,
  });
  assert.equal(result.travelTimeFee, 30);
});

test("a travel-billing fraction outside 0-1 is clamped", () => {
  const over = computeAssignmentQuote({
    hoursRequested: 2,
    hourlyRate: 60,
    travelMinutesEachWay: 30,
    travelBillingFraction: 5,
  });
  const capped = computeAssignmentQuote({
    hoursRequested: 2,
    hourlyRate: 60,
    travelMinutesEachWay: 30,
    travelBillingFraction: 1,
  });
  assert.equal(over.travelTimeFee, capped.travelTimeFee);

  const under = computeAssignmentQuote({
    hoursRequested: 2,
    hourlyRate: 60,
    travelMinutesEachWay: 30,
    travelBillingFraction: -5,
  });
  assert.equal(under.travelTimeFee, 0);
});

test("mileage is round-trip miles times the mileage rate", () => {
  const result = computeAssignmentQuote({
    hoursRequested: 2,
    hourlyRate: 60,
    travelMilesRoundTrip: 40,
    mileageRate: 0.5,
  });
  assert.equal(result.mileageFee, 20);
});

test("total is interpreting fee plus travel time fee plus mileage fee", () => {
  const result = computeAssignmentQuote({
    hoursRequested: 3,
    hourlyRate: 60,
    travelMinutesEachWay: 15,
    travelMilesRoundTrip: 20,
    mileageRate: 0.6,
  });
  assert.equal(result.total, round2(result.interpretingFee + result.travelTimeFee + result.mileageFee));
});

test("effective hourly on assignment divides the interpreting fee by billable hours", () => {
  const result = computeAssignmentQuote({ hoursRequested: 4, hourlyRate: 60, teamInterpreting: true });
  assert.equal(result.effectiveHourlyOnAssignment, round2(result.interpretingFee / result.billableHours));
});

test("negative or non-numeric input does not throw and yields a zero total", () => {
  assert.doesNotThrow(() => computeAssignmentQuote({ hoursRequested: -5, hourlyRate: 60 }));
  assert.doesNotThrow(() => computeAssignmentQuote({ hoursRequested: NaN, hourlyRate: 60 }));
  const result = computeAssignmentQuote({ hoursRequested: -5, hourlyRate: 60 });
  assert.equal(result.total, 0);
});

// --- computeCancellationFee ---------------------------------------------

test("zero scheduled fee produces a missing-input finding", () => {
  const result = computeCancellationFee({ scheduledFee: 0, hoursNotice: 10 });
  assert.equal(result.feeOwed, 0);
  assert.ok(findingIds(result).includes("missing-input"));
});

test("48+ hours notice owes no cancellation fee under the default schedule", () => {
  const result = computeCancellationFee({ scheduledFee: 200, hoursNotice: 72 });
  assert.equal(result.feePercentage, 0);
  assert.equal(result.feeOwed, 0);
  assert.ok(findingIds(result).includes("no-fee-owed"));
});

test("24-47.9 hours notice owes half the scheduled fee under the default schedule", () => {
  const result = computeCancellationFee({ scheduledFee: 200, hoursNotice: 30 });
  assert.equal(result.feePercentage, 50);
  assert.equal(result.feeOwed, 100);
  assert.ok(findingIds(result).includes("partial-fee-owed"));
});

test("under 24 hours notice owes the full scheduled fee under the default schedule", () => {
  const result = computeCancellationFee({ scheduledFee: 200, hoursNotice: 2 });
  assert.equal(result.feePercentage, 100);
  assert.equal(result.feeOwed, 200);
});

test("exactly on a tier boundary uses that tier, not the one below it", () => {
  const at48 = computeCancellationFee({ scheduledFee: 200, hoursNotice: 48 });
  assert.equal(at48.feePercentage, 0);
  const at24 = computeCancellationFee({ scheduledFee: 200, hoursNotice: 24 });
  assert.equal(at24.feePercentage, 50);
});

test("a custom tier schedule overrides the default", () => {
  const tiers = [
    { minHoursNotice: 72, feePercentage: 0, label: "3+ days" },
    { minHoursNotice: 0, feePercentage: 100, label: "under 3 days" },
  ];
  const result = computeCancellationFee({ scheduledFee: 200, hoursNotice: 50, tiers });
  assert.equal(result.feePercentage, 100);
  assert.equal(result.feeOwed, 200);
});

test("the default cancellation tier schedule is exported and has three tiers", () => {
  assert.equal(DEFAULT_CANCELLATION_TIERS.length, 3);
});

test("negative or non-numeric cancellation input does not throw and yields a zero fee", () => {
  assert.doesNotThrow(() => computeCancellationFee({ scheduledFee: -50, hoursNotice: 2 }));
  assert.doesNotThrow(() => computeCancellationFee({ scheduledFee: NaN, hoursNotice: 2 }));
  const result = computeCancellationFee({ scheduledFee: -50, hoursNotice: 2 });
  assert.equal(result.feeOwed, 0);
});

function round2(n) {
  return Math.round(n * 100) / 100;
}
