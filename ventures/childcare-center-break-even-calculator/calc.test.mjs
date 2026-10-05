import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateCenter, teachersNeeded, summaryText } from "./calc.mjs";

const base = {
  hourlyWage: 16, burdenPct: 12, hoursOpenPerDay: 8, teacherShiftHours: 8, absencePct: 0, collectionPct: 100,
  fixedMonthly: 6000, directorMonthly: 0, variablePerChildMonth: 0,
  groups: [{ name: "Toddlers", ratio: 6, capacity: 12, enrolled: 6, weeklyTuition: 300 }],
};

test("teachersNeeded is a step function of enrollment", () => {
  assert.equal(teachersNeeded(0, 6), 0);
  assert.equal(teachersNeeded(1, 6), 1);
  assert.equal(teachersNeeded(6, 6), 1);
  assert.equal(teachersNeeded(7, 6), 2);
});

test("monthly P&L for one full room", () => {
  const r = calculateCenter(base);
  const rev = 6 * 300 * (52 / 12);
  const teacher = 16 * 8 * 5 * (52 / 12) * 1.12;
  assert.ok(Math.abs(r.revenue - rev) < 0.01);
  assert.ok(Math.abs(r.staff - teacher) < 0.01);
  assert.ok(Math.abs(r.profit - (rev - teacher - 6000)) < 0.01);
});

test("child #7 adds a teacher and a ratio-cliff finding appears", () => {
  const r = calculateCenter(base);
  const f = r.findings.find((x) => /child #7 costs you a teacher/.test(x.title));
  assert.ok(f, JSON.stringify(r.findings));
  assert.equal(f.severity, "medium");
});

test("free seats before the next hire are reported when a room has slack", () => {
  const r = calculateCenter({ ...base, groups: [{ name: "Pre-K", ratio: 10, capacity: 20, enrolled: 4, weeklyTuition: 250 }] });
  assert.ok(r.findings.some((x) => /free seats before the next hire/.test(x.title)));
});

test("break-even occupancy is the first fill level with profit >= 0", () => {
  const r = calculateCenter(base);
  assert.ok(r.breakEvenPct > 0 && r.breakEvenPct <= 100);
  const worse = calculateCenter({ ...base, fixedMonthly: 400000 });
  assert.equal(worse.breakEvenPct, null);
  assert.equal(worse.breakEvenChildren, null);
});

test("a loss produces a high finding and a tuition rise that closes it", () => {
  const r = calculateCenter({ ...base, fixedMonthly: 9000 });
  assert.ok(r.profit < 0);
  assert.equal(r.findings[0].severity, "high");
  const raised = calculateCenter({ ...base, fixedMonthly: 9000, groups: [{ ...base.groups[0], weeklyTuition: 300 * (1 + r.tuitionRisePct / 100) }] });
  assert.ok(Math.abs(raised.profit) < 5);
});

test("coverage factor: a 10 hour day on 8 hour shifts costs 25% more staff", () => {
  const a = calculateCenter(base).staff;
  const b = calculateCenter({ ...base, hoursOpenPerDay: 10 }).staff;
  assert.ok(Math.abs(b / a - 1.25) < 1e-9);
});

test("collection rate scales revenue only", () => {
  const a = calculateCenter(base), b = calculateCenter({ ...base, collectionPct: 90 });
  assert.ok(Math.abs(b.revenue / a.revenue - 0.9) < 1e-9);
  assert.equal(b.staff, a.staff);
});

test("bad input is rejected with a message, not NaN", () => {
  assert.match(calculateCenter({ ...base, groups: [] }).error, /at least one/);
  assert.match(calculateCenter({ ...base, groups: [{ name: "X", ratio: 0, capacity: 5, enrolled: 1, weeklyTuition: 1 }] }).error, /ratio/);
  assert.match(calculateCenter({ ...base, groups: [{ name: "X", ratio: 4, capacity: 5, enrolled: 9, weeklyTuition: 1 }] }).error, /above licensed capacity/);
  assert.match(calculateCenter({ ...base, hourlyWage: "" }).error, /hourly wage/);
});

test("ladder rises with occupancy overall and summary text states break-even", () => {
  const r = calculateCenter(base);
  assert.ok(r.ladder[5].profit > r.ladder[0].profit);
  assert.match(summaryText(r), /Break-even/);
});
