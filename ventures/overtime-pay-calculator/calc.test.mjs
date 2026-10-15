import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSingleRateOvertime,
  computeWeightedAverageOvertime,
  formatWeightedBreakdown,
  BREAKDOWN_DISCLAIMER,
} from "./calc.mjs";

// --- Single rate -------------------------------------------------------

test("single rate: no overtime under the threshold", () => {
  const r = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 35 });
  assert.equal(r.regularHours, 35);
  assert.equal(r.overtimeHours, 0);
  assert.equal(r.regularPay, 700);
  assert.equal(r.overtimePay, 0);
  assert.equal(r.totalPay, 700);
  assert.ok(r.findings.some((f) => f.id === "no-overtime"));
});

test("single rate: standard 1.5x overtime past 40 hours", () => {
  const r = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 45 });
  assert.equal(r.regularHours, 40);
  assert.equal(r.overtimeHours, 5);
  assert.equal(r.overtimeRate, 30);
  assert.equal(r.regularPay, 800);
  assert.equal(r.overtimePay, 150);
  assert.equal(r.totalPay, 950);
  assert.ok(!r.findings.some((f) => f.id === "no-overtime"));
});

test("single rate: a non-standard multiplier is flagged", () => {
  const r = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 45, overtimeMultiplier: 2 });
  assert.equal(r.overtimeRate, 40);
  assert.equal(r.overtimePay, 200);
  assert.ok(r.findings.some((f) => f.id === "nonstandard-multiplier"));
});

test("single rate: a custom daily-style threshold changes the split", () => {
  const r = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 10, overtimeThresholdHours: 8 });
  assert.equal(r.regularHours, 8);
  assert.equal(r.overtimeHours, 2);
});

test("single rate: missing rate is flagged and produces zero pay, not NaN", () => {
  const r = computeSingleRateOvertime({ hourlyRate: NaN, hoursWorked: 45 });
  assert.equal(r.totalPay, 0);
  assert.ok(r.findings.some((f) => f.id === "missing-rate"));
});

test("single rate: negative or zero hours never produce negative pay", () => {
  const r = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: -5 });
  assert.equal(r.regularHours, 0);
  assert.equal(r.overtimeHours, 0);
  assert.equal(r.totalPay, 0);
});

// --- Weighted average / blended rate ------------------------------------

test("weighted average: the textbook two-rate FLSA example", () => {
  // 30 hours at $20/hr + 15 hours at $15/hr = 45 total hours.
  // Straight-time pay: 600 + 225 = 825. Blended rate: 825 / 45 = 18.3333...
  // Overtime hours: 5. Premium per hour: half of 18.33 = 9.1667 (rounded 9.17).
  const r = computeWeightedAverageOvertime({
    entries: [
      { label: "Warehouse", hours: 30, rate: 20 },
      { label: "Front desk", hours: 15, rate: 15 },
    ],
  });
  assert.equal(r.totalHours, 45);
  assert.equal(r.totalStraightTimePay, 825);
  assert.equal(r.weightedAverageRate, 18.33);
  assert.equal(r.overtimeHours, 5);
  assert.equal(r.overtimePremiumPerHour, 9.16);
  assert.equal(r.overtimePremiumPay, 45.8);
  assert.equal(r.totalPay, 870.8);
});

test("weighted average: a single-rate row reduces to that rate, and is flagged", () => {
  const r = computeWeightedAverageOvertime({ entries: [{ hours: 45, rate: 20 }] });
  assert.equal(r.weightedAverageRate, 20);
  assert.equal(r.overtimePremiumPerHour, 10);
  assert.ok(r.findings.some((f) => f.id === "single-rate-entered"));
});

test("weighted average: no overtime under the threshold is flagged, blended rate still shown", () => {
  const r = computeWeightedAverageOvertime({
    entries: [
      { hours: 20, rate: 25 },
      { hours: 15, rate: 18 },
    ],
  });
  assert.equal(r.totalHours, 35);
  assert.equal(r.overtimeHours, 0);
  assert.equal(r.overtimePremiumPay, 0);
  assert.ok(r.findings.some((f) => f.id === "no-overtime"));
  assert.ok(r.weightedAverageRate > 0);
});

test("weighted average: rows with zero or missing hours/rate are dropped, not treated as zero pay entries", () => {
  const r = computeWeightedAverageOvertime({
    entries: [
      { label: "Kept", hours: 40, rate: 20 },
      { label: "Empty hours", hours: 0, rate: 20 },
      { label: "Empty rate", hours: 10, rate: 0 },
      { label: "Garbage", hours: NaN, rate: NaN },
    ],
  });
  assert.equal(r.lineItems.length, 1);
  assert.equal(r.lineItems[0].label, "Kept");
  assert.equal(r.totalHours, 40);
});

test("weighted average: no entries at all is flagged and returns zeros, not an error", () => {
  const r = computeWeightedAverageOvertime({ entries: [] });
  assert.equal(r.totalHours, 0);
  assert.equal(r.totalPay, 0);
  assert.ok(r.findings.some((f) => f.id === "no-entries"));
});

test("weighted average: a custom threshold is honoured", () => {
  const r = computeWeightedAverageOvertime({
    entries: [{ hours: 10, rate: 20 }],
    overtimeThresholdHours: 8,
  });
  assert.equal(r.overtimeHours, 2);
});

test("every result carries the state-rules caveat", () => {
  const single = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 45 });
  const weighted = computeWeightedAverageOvertime({ entries: [{ hours: 45, rate: 20 }] });
  assert.ok(single.findings.some((f) => f.id === "state-rules-note"));
  assert.ok(weighted.findings.some((f) => f.id === "state-rules-note"));
});

// --- Breakdown text -------------------------------------------------------

test("formatWeightedBreakdown renders every line item, the totals, and the disclaimer", () => {
  const r = computeWeightedAverageOvertime({
    entries: [
      { label: "Warehouse", hours: 30, rate: 20 },
      { label: "Front desk", hours: 15, rate: 15 },
    ],
  });
  const text = formatWeightedBreakdown(r);
  assert.match(text, /Warehouse - 30 hr @ \$20\.00\/hr = \$600\.00/);
  assert.match(text, /Front desk - 15 hr @ \$15\.00\/hr = \$225\.00/);
  assert.match(text, /Total hours: 45/);
  assert.match(text, /Total pay: \$870\.80/);
  assert.ok(text.endsWith(BREAKDOWN_DISCLAIMER));
});

test("formatWeightedBreakdown never throws on an empty result", () => {
  const r = computeWeightedAverageOvertime({ entries: [] });
  assert.doesNotThrow(() => formatWeightedBreakdown(r));
});

// --- Red-team guards (2026-10-15) ----------------------------------------
// Each test below fails against a seeded mutant that the suite above let
// through (prompts/redteam.py; see the run record for that date).

test("single rate: negative hours are treated as zero, not as negative pay", () => {
  const r = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: -5 });
  assert.equal(r.totalPay, 0);
  assert.equal(r.regularHours, 0);
});

test("single rate: a zero overtime threshold falls back to 40 hours", () => {
  const r = computeSingleRateOvertime({ hourlyRate: 20, hoursWorked: 45, overtimeThresholdHours: 0 });
  assert.equal(r.regularHours, 40);
  assert.equal(r.overtimeHours, 5);
});

test("weighted average: no 'no-overtime' finding when there is overtime", () => {
  const r = computeWeightedAverageOvertime({
    entries: [{ hours: 30, rate: 20 }, { hours: 15, rate: 30 }],
  });
  assert.ok(r.overtimeHours > 0);
  assert.ok(!r.findings.some((f) => f.id === "no-overtime"));
});

test("single rate: a negative hourly rate is treated as zero", () => {
  const r = computeSingleRateOvertime({ hourlyRate: -20, hoursWorked: 45 });
  assert.equal(r.totalPay, 0);
  assert.equal(r.overtimeRate, 0);
});
