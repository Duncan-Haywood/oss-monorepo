import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exemptionOutcome,
  money,
  weeklyToAnnual,
  annualToWeekly,
  FEDERAL_WEEKLY_THRESHOLD,
  STATE_THRESHOLDS,
} from "./calc.mjs";

test("federal-only: below the threshold is flagged, at or above is not", () => {
  const below = exemptionOutcome({ jurisdiction: "federal-only", weeklySalary: 600 });
  assert.equal(below.applicableThreshold, 684);
  assert.equal(below.meetsThreshold, false);
  assert.equal(below.shortfall, 84);
  assert.equal(below.usesFederalOnly, true);

  const above = exemptionOutcome({ jurisdiction: "federal-only", weeklySalary: 700 });
  assert.equal(above.meetsThreshold, true);
  assert.equal(above.shortfall, 0);
});

test("California applies its higher threshold to both executive/administrative and professional", () => {
  const exec = exemptionOutcome({ jurisdiction: "CA", category: "executive_administrative", weeklySalary: 1_300 });
  assert.equal(exec.applicableThreshold, 1_352);
  assert.equal(exec.meetsThreshold, false);
  assert.equal(exec.usesFederalOnly, false);

  const prof = exemptionOutcome({ jurisdiction: "CA", category: "professional", weeklySalary: 1_300 });
  assert.equal(prof.applicableThreshold, 1_352);
  assert.equal(prof.usesFederalOnly, false);
});

test("New York's higher threshold applies only to executive/administrative, not professional", () => {
  const exec = exemptionOutcome({ jurisdiction: "NY_DOWNSTATE", category: "executive_administrative", weeklySalary: 1_000 });
  assert.equal(exec.applicableThreshold, 1_275);
  assert.equal(exec.usesFederalOnly, false);
  assert.equal(exec.meetsThreshold, false);

  const prof = exemptionOutcome({ jurisdiction: "NY_DOWNSTATE", category: "professional", weeklySalary: 1_000 });
  assert.equal(prof.applicableThreshold, FEDERAL_WEEKLY_THRESHOLD);
  assert.equal(prof.usesFederalOnly, true);
  assert.equal(prof.meetsThreshold, true);
  assert.match(prof.findings.map((f) => f.title).join(" | "), /sets no separate threshold for the professional exemption/);
});

test("New York upstate uses the lower of the two regional figures", () => {
  const r = exemptionOutcome({ jurisdiction: "NY_UPSTATE", category: "executive_administrative", weeklySalary: 1_200 });
  assert.equal(r.applicableThreshold, 1_199.10);
  assert.equal(r.meetsThreshold, true);
});

test("Alaska's threshold and effective date are distinct from the other four states", () => {
  const r = STATE_THRESHOLDS.AK;
  assert.equal(r.weekly, 1_120);
  assert.equal(r.effective, "2026-07-01");
});

test("the applicable threshold is always at least the federal figure, even for a hypothetical low state entry", () => {
  const r = exemptionOutcome({ jurisdiction: "federal-only", weeklySalary: 1_000_000 });
  assert.equal(r.applicableThreshold, FEDERAL_WEEKLY_THRESHOLD);
});

test("negative or missing inputs are treated as zero, never negative", () => {
  const r = exemptionOutcome({ jurisdiction: "federal-only", weeklySalary: -500 });
  assert.equal(r.salary, 0);
  assert.equal(r.meetsThreshold, false);
});

test("an unrecognized jurisdiction falls back to federal-only", () => {
  const r = exemptionOutcome({ jurisdiction: "nonsense", weeklySalary: 1_000 });
  assert.equal(r.usesFederalOnly, true);
  assert.equal(r.applicableThreshold, FEDERAL_WEEKLY_THRESHOLD);
});

test("every finding set always includes the necessary-not-sufficient caveat", () => {
  for (const jurisdiction of ["federal-only", "CA", "WA", "ME", "AK", "NY_DOWNSTATE", "NY_UPSTATE"]) {
    const r = exemptionOutcome({ jurisdiction, weeklySalary: 2_000 });
    const titles = r.findings.map((f) => f.title).join(" | ");
    assert.match(titles, /necessary, not sufficient/i, `missing caveat for ${jurisdiction}`);
  }
});

test("weeklyToAnnual and annualToWeekly are exact inverses at 52 weeks", () => {
  assert.equal(weeklyToAnnual(684), 35_568);
  assert.equal(Math.round(annualToWeekly(35_568) * 100) / 100, 684);
  assert.equal(weeklyToAnnual(1_352), 70_304);
});

test("money() formats to the cent with a leading minus and no double sign", () => {
  assert.equal(money(1234), "$1,234.00");
  assert.equal(money(1199.1), "$1,199.10");
  assert.equal(money(-84), "-$84.00");
  assert.equal(money(0), "$0.00");
});

test("STATE_THRESHOLDS has all five modeled states with a name, weekly figure, and effective date", () => {
  for (const key of ["CA", "WA", "ME", "AK", "NY_DOWNSTATE", "NY_UPSTATE"]) {
    const s = STATE_THRESHOLDS[key];
    assert.equal(typeof s.name, "string");
    assert.equal(typeof s.weekly, "number");
    assert.match(s.effective, /^\d{4}-\d{2}-\d{2}$/);
  }
});
