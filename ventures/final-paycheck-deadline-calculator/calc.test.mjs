import { test } from "node:test";
import assert from "node:assert/strict";
import {
  finalPaycheckDeadline,
  formatDate,
  money,
  STATE_RULES,
  GENERAL_DEFAULT,
} from "./calc.mjs";

test("California: fired employee is due the same day", () => {
  const r = finalPaycheckDeadline({ state: "CA", separationType: "involuntary", separationDate: "2026-10-01" });
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 1))));
});

test("California: voluntary quit WITH 72 hours' notice is due the last day worked (same day)", () => {
  const r = finalPaycheckDeadline({
    state: "CA", separationType: "voluntary", noticeGiven: true, separationDate: "2026-10-01",
  });
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 1))));
  assert.match(r.findings.map((f) => f.title).join(" | "), /72\+ hours' notice/);
});

test("California: voluntary quit WITHOUT notice is due within 3 calendar days", () => {
  const r = finalPaycheckDeadline({
    state: "CA", separationType: "voluntary", noticeGiven: false, separationDate: "2026-10-01",
  });
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 4))));
});

test("Colorado: fired is immediate, voluntary quit uses the next payday", () => {
  const fired = finalPaycheckDeadline({ state: "CO", separationType: "involuntary", separationDate: "2026-10-01" });
  assert.equal(formatDate(fired.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 1))));

  const quit = finalPaycheckDeadline({
    state: "CO", separationType: "voluntary", separationDate: "2026-10-01", nextPaydayDate: "2026-10-15",
  });
  assert.equal(formatDate(quit.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 15))));
});

test("Texas: fired employee is due within 6 calendar days", () => {
  const r = finalPaycheckDeadline({ state: "TX", separationType: "involuntary", separationDate: "2026-10-01" });
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 7))));
});

test("Arizona: fired employee gets the earlier of 7 business days or the next payday", () => {
  // 2026-10-01 is a Thursday. +7 business days = 2026-10-12 (Mon).
  const noPayday = finalPaycheckDeadline({ state: "AZ", separationType: "involuntary", separationDate: "2026-10-01" });
  assert.equal(formatDate(noPayday.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 12))));

  const earlyPayday = finalPaycheckDeadline({
    state: "AZ", separationType: "involuntary", separationDate: "2026-10-01", nextPaydayDate: "2026-10-05",
  });
  assert.equal(formatDate(earlyPayday.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 5))));
});

test("Montana: fired employee defaults to immediate, capped by the earlier-of rule", () => {
  const r = finalPaycheckDeadline({ state: "MT", separationType: "involuntary", separationDate: "2026-10-01" });
  // With no payday entered, the earlier-of resolves to the same day (immediate) vs. 15 days -- same day wins.
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 1))));
});

test("Montana: voluntary quit is the earlier of the next payday or 15 days", () => {
  const r = finalPaycheckDeadline({
    state: "MT", separationType: "voluntary", separationDate: "2026-10-01", nextPaydayDate: "2026-10-30",
  });
  // 15 calendar days = 2026-10-16, earlier than the 2026-10-30 payday.
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 16))));
});

test("Nevada: voluntary quit is the earlier of the next payday or 7 days", () => {
  const r = finalPaycheckDeadline({
    state: "NV", separationType: "voluntary", separationDate: "2026-10-01", nextPaydayDate: "2026-10-30",
  });
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 8))));
});

test("Minnesota: fired with a written demand uses the 24-hour clock from the demand date", () => {
  const r = finalPaycheckDeadline({
    state: "MN", separationType: "involuntary", demandMade: true,
    separationDate: "2026-10-01", demandDate: "2026-10-03",
  });
  assert.equal(r.deadlineDate.getTime(), new Date(Date.UTC(2026, 9, 4)).getTime());
});

test("Minnesota: fired with no demand falls back to the next scheduled payday", () => {
  const r = finalPaycheckDeadline({
    state: "MN", separationType: "involuntary", demandMade: false,
    separationDate: "2026-10-01", nextPaydayDate: "2026-10-15",
  });
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 15))));
});

test("Illinois and New York both use the next-payday rule for either separation type", () => {
  for (const state of ["IL", "NY"]) {
    for (const separationType of ["involuntary", "voluntary"]) {
      const r = finalPaycheckDeadline({ state, separationType, separationDate: "2026-10-01", nextPaydayDate: "2026-10-15" });
      assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 15))), `${state}/${separationType}`);
    }
  }
});

test("an unrecognized or missing state falls back to the general next-payday default", () => {
  const r = finalPaycheckDeadline({ state: "ZZ", separationType: "involuntary", separationDate: "2026-10-01", nextPaydayDate: "2026-10-15" });
  assert.equal(r.isOther, true);
  assert.equal(r.stateName, GENERAL_DEFAULT.name);
  assert.equal(formatDate(r.deadlineDate), formatDate(new Date(Date.UTC(2026, 9, 15))));
});

test("PTO payout: required states (CA, CO, MA, MT, IL) flag it as high severity and compute an amount", () => {
  for (const state of ["CA", "CO", "MA", "MT", "IL"]) {
    const r = finalPaycheckDeadline({
      state, separationType: "involuntary", separationDate: "2026-10-01",
      accruedPtoHours: 40, hourlyRate: 25,
    });
    assert.equal(r.ptoPayoutRequired, true, state);
    assert.equal(r.ptoPayoutAmount, 1000, state);
    assert.ok(r.findings.some((f) => f.severity === "high" && /requires accrued unused vacation/.test(f.title)), state);
  }
});

test("PTO payout: policy states (TX, NY, WA, NV, AZ, MN) never compute a mandatory amount", () => {
  for (const state of ["TX", "NY", "WA", "NV", "AZ", "MN"]) {
    const r = finalPaycheckDeadline({
      state, separationType: "involuntary", separationDate: "2026-10-01",
      accruedPtoHours: 40, hourlyRate: 25,
    });
    assert.equal(r.ptoPayoutRequired, false, state);
    assert.equal(r.ptoPayoutAmount, 0, state);
  }
});

test("every finding set always includes the 'not a full determination' caveat", () => {
  for (const state of [...Object.keys(STATE_RULES), "OTHER"]) {
    const r = finalPaycheckDeadline({ state, separationType: "involuntary", separationDate: "2026-10-01" });
    const titles = r.findings.map((f) => f.title).join(" | ");
    assert.match(titles, /not a full wage-and-hour determination/i, `missing caveat for ${state}`);
  }
});

test("a missing separation date is flagged and produces no crash", () => {
  const r = finalPaycheckDeadline({ state: "CA", separationType: "involuntary", separationDate: "" });
  assert.equal(r.deadlineDate, null);
  assert.match(r.findings.map((f) => f.title).join(" | "), /Enter a separation date/);
});

test("a missing next payday on a next-payday-based rule is flagged rather than guessed", () => {
  const r = finalPaycheckDeadline({ state: "NY", separationType: "involuntary", separationDate: "2026-10-01" });
  assert.equal(r.deadlineDate, null);
  assert.match(r.findings.map((f) => f.title).join(" | "), /Enter the next scheduled payday/);
});

test("negative accrued hours or rate are treated as zero, never negative", () => {
  const r = finalPaycheckDeadline({
    state: "CA", separationType: "involuntary", separationDate: "2026-10-01",
    accruedPtoHours: -10, hourlyRate: -5,
  });
  assert.equal(r.accruedHours, 0);
  assert.equal(r.hourlyRate, 0);
  assert.equal(r.ptoPayoutAmount, 0);
});

test("money() formats to the cent with a leading minus and no double sign", () => {
  assert.equal(money(1234), "$1,234.00");
  assert.equal(money(1000), "$1,000.00");
  assert.equal(money(-84), "-$84.00");
  assert.equal(money(0), "$0.00");
});

test("STATE_RULES has all eleven modeled states with a name and citation", () => {
  for (const key of Object.keys(STATE_RULES)) {
    const s = STATE_RULES[key];
    assert.equal(typeof s.name, "string");
    assert.equal(typeof s.citation, "string");
    assert.ok(["required", "policy"].includes(s.ptoPayout), key);
  }
  assert.equal(Object.keys(STATE_RULES).length, 11);
});

test("formatDate returns null for a null date and a stable string otherwise", () => {
  assert.equal(formatDate(null), null);
  assert.equal(formatDate(new Date(Date.UTC(2026, 0, 1))), "Thu, Jan 1, 2026");
});
