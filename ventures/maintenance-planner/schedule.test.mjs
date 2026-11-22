import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDay, fmtDay, addInterval, planStatus, compliance, meterRate, forecast, workload, isoWeek } from "./schedule.mjs";

const D = parseDay;

test("dates round-trip and bad dates are refused", () => {
  assert.equal(fmtDay(D("2026-02-28")), "2026-02-28");
  assert.equal(D("2026-02-29"), null);
  assert.equal(D("2028-02-29") !== null, true);
  assert.equal(D("26-1-1"), null);
});

test("months clamp to the month's end and years handle 29 February", () => {
  assert.equal(fmtDay(addInterval(D("2026-01-31"), 1, "month")), "2026-02-28");
  assert.equal(fmtDay(addInterval(D("2028-01-31"), 1, "month")), "2028-02-29");
  assert.equal(fmtDay(addInterval(D("2026-11-30"), 3, "month")), "2027-02-28");
  assert.equal(fmtDay(addInterval(D("2028-02-29"), 1, "year")), "2029-02-28");
  assert.equal(fmtDay(addInterval(D("2026-12-29"), 2, "week")), "2027-01-12");
});

test("a fixed monthly plan from the 31st does not drift to the 28th", () => {
  const plan = { start: "2026-01-31", every: { n: 1, unit: "month" }, mode: "fixed", completions: [{ date: "2026-01-31" }, { date: "2026-02-27" }] };
  assert.equal(planStatus(plan, [], D("2026-03-01")).due, "2026-03-31");
});

test("fixed keeps the cadence after a late job; floating moves with it", () => {
  const base = { start: "2026-01-01", every: { n: 3, unit: "month" }, completions: [{ date: "2026-01-01" }, { date: "2026-04-20" }] };
  assert.equal(planStatus({ ...base, mode: "fixed" }, [], D("2026-05-01")).due, "2026-07-01");
  assert.equal(planStatus({ ...base, mode: "floating" }, [], D("2026-05-01")).due, "2026-07-20");
});

test("a never-done plan is due on its start date, with the lead window", () => {
  const plan = { start: "2026-06-10", every: { n: 1, unit: "year" }, mode: "fixed", completions: [] };
  // a yearly plan's lead window is capped at 14 days
  assert.equal(planStatus(plan, [], D("2026-05-20")).status, "ok");
  assert.equal(planStatus(plan, [], D("2026-05-27")).status, "due");
  assert.equal(planStatus(plan, [], D("2026-06-11")).status, "overdue");
  assert.equal(planStatus({ ...plan, leadDays: 30 }, [], D("2026-05-20")).status, "due");
});

test("meter rate is a least-squares line and ignores a reset meter", () => {
  const r = [{ date: "2026-01-01", value: 1000 }, { date: "2026-01-11", value: 1100 }, { date: "2026-01-21", value: 1200 }];
  assert.equal(meterRate(r, D("2026-01-21")).rate, 10);
  const reset = [...r, { date: "2026-02-01", value: 5 }, { date: "2026-02-11", value: 45 }];
  const m = meterRate(reset, D("2026-02-11"));
  assert.equal(m.rate, 4);
  assert.equal(m.last.value, 45);
});

test("meter plan: due day is projected from the usage rate", () => {
  const readings = [{ date: "2026-01-01", value: 0 }, { date: "2026-01-11", value: 160 }, { date: "2026-01-21", value: 320 }];
  const plan = { start: "2026-01-01", meter: { every: 500, startAt: 0 }, mode: "floating", completions: [] };
  const st = planStatus(plan, readings, D("2026-01-21"));
  assert.equal(st.meterDue, 500);
  assert.equal(st.meterRate, 16);
  // 180 more at 16 a day = 11.25 days after 21 Jan
  assert.equal(st.due, "2026-02-02");
  assert.equal(st.dueBy, "meter");
  // past the due reading it is overdue even though the date has not come
  const late = [...readings, { date: "2026-02-01", value: 520 }];
  assert.equal(planStatus(plan, late, D("2026-02-01")).status, "overdue");
  // after a completion at 520, the next is due at 1020
  assert.equal(planStatus({ ...plan, completions: [{ date: "2026-02-01", meter: 520 }] }, late, D("2026-02-01")).meterDue, 1020);
});

test("fixed meter plans keep the grid: done at 520 for 500, next is 1000", () => {
  const readings = [{ date: "2026-01-01", value: 0 }, { date: "2026-02-01", value: 520 }];
  const plan = { start: "2026-01-01", meter: { every: 500, startAt: 0 }, mode: "fixed", completions: [{ date: "2026-02-01", meter: 520 }] };
  assert.equal(planStatus(plan, readings, D("2026-02-01")).meterDue, 1000);
});

test("whichever comes first: the calendar wins when the machine is idle", () => {
  const readings = [{ date: "2026-01-01", value: 0 }, { date: "2026-03-01", value: 59 }];
  const plan = { start: "2026-01-01", every: { n: 6, unit: "month" }, meter: { every: 500, startAt: 0 }, mode: "floating", completions: [{ date: "2026-01-01", meter: 0 }] };
  const st = planStatus(plan, readings, D("2026-03-01"));
  assert.equal(st.dueBy, "calendar");
  assert.equal(st.due, "2026-07-01");
});

test("compliance applies the 10% rule and counts skipped occurrences as missed", () => {
  // monthly fixed from 1 Jan: tolerance 3 days (10% of 30.4)
  const plan = { start: "2026-01-01", every: { n: 1, unit: "month" }, mode: "fixed", completions: [{ date: "2026-01-02" }, { date: "2026-02-04" }, { date: "2026-03-08" }, { date: "2026-05-01" }] };
  const c = compliance(plan, [], D("2026-05-10"));
  // Jan on time (+1), Feb late (+3 = within? 3 days: on time), Mar late (+7), Apr missed, May on time
  assert.deepEqual([c.onTime, c.late, c.missed], [3, 1, 1]);
  assert.equal(c.pct, 60);
  assert.equal(c.rows.find((r) => r.result === "missed").due, "2026-04-01");
});

test("an occurrence open past its tolerance counts as missed", () => {
  const plan = { start: "2026-01-01", every: { n: 1, unit: "week" }, mode: "fixed", completions: [{ date: "2026-01-01" }] };
  const c = compliance(plan, [], D("2026-01-10"));
  assert.equal(c.missed, 1);
});

test("forecast and weekly workload", () => {
  const plans = [
    { id: "a", assetId: "x", title: "weekly", start: "2026-01-05", every: { n: 1, unit: "week" }, mode: "fixed", hours: 0.5, trade: "ops", completions: [] },
    { id: "b", assetId: "x", title: "monthly", start: "2026-01-20", every: { n: 1, unit: "month" }, mode: "fixed", hours: 2, trade: "mech", completions: [] },
  ];
  const occ = forecast(plans, {}, D("2026-01-05"), 28);
  assert.equal(occ.filter((o) => o.planId === "a").length, 4);
  assert.equal(occ.filter((o) => o.planId === "b").length, 1);
  const w = workload(occ);
  assert.equal(w.length, 4);
  assert.equal(w.find((x) => x.week === "2026-W04").total, 2.5);
});

test("ISO weeks across a year end", () => {
  assert.equal(isoWeek(D("2026-12-31")), "2026-W53");
  assert.equal(isoWeek(D("2027-01-04")), "2027-W01");
  assert.equal(isoWeek(D("2024-12-30")), "2025-W01");
});
