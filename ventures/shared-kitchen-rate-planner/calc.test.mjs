import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, monthlyCost, stationHours, project, rateForProfit, utilizationForProfit, sensitivity, analyze, num } from "./calc.mjs";

const base = { ...DEFAULTS, rent: 3000, utilities: 500, insurance: 300, cleaning: 400, equipment: 0, staff: 0, other: 0, stations: 2, hoursPerDay: 10, daysPerWeek: 6, hourlyRate: 30, utilization: 0.5, members: 0, memberFee: 0, memberHours: 0, feePct: 0, targetProfit: 1000 };

test("num parses money and percent strings", () => { assert.equal(num("$1,250"), 1250); assert.ok(Number.isNaN(num("x"))); });

test("cost and capacity", () => {
  assert.equal(monthlyCost(base), 4200);
  assert.ok(Math.abs(stationHours(base) - 2 * 10 * 6 * 52 / 12) < 1e-9);
  assert.ok(Math.abs(stationHours(base) - 520) < 1e-9);
});

test("project without members", () => {
  const p = project(base);
  assert.ok(Math.abs(p.used - 260) < 1e-6);
  assert.ok(Math.abs(p.gross - 260 * 30) < 1e-6);
  assert.ok(Math.abs(p.profit - (7800 - 4200)) < 1e-6);
});

test("fees come off all revenue", () => {
  const p = project({ ...base, feePct: 0.1 });
  assert.ok(Math.abs(p.profit - (7800 * 0.9 - 4200)) < 1e-6);
});

test("member hours are capped by use and billed flat", () => {
  const p = project({ ...base, members: 4, memberFee: 300, memberHours: 100 });
  assert.equal(p.memberHoursUsed, 260);
  assert.equal(p.hourlyHours, 0);
  assert.equal(p.memberRevenue, 1200);
  const q = project({ ...base, members: 2, memberFee: 300, memberHours: 20 });
  assert.equal(q.hourlyHours, 220);
  assert.equal(q.gross, 600 + 220 * 30);
});

test("break-even rate and utilization are consistent with project", () => {
  const r = rateForProfit(base, 0);
  assert.ok(Math.abs(project(base, { hourlyRate: r }).profit) < 1e-6);
  const u = utilizationForProfit(base, 0);
  assert.ok(Math.abs(project(base, { utilization: u }).profit) < 1e-3);
  assert.ok(Math.abs(project(base, { hourlyRate: rateForProfit(base, 1000) }).profit - 1000) < 1e-6);
});

test("unreachable targets return null", () => {
  assert.equal(utilizationForProfit({ ...base, hourlyRate: 1 }, 0), null);
  assert.equal(rateForProfit({ ...base, utilization: 0 }, 100), null);
  assert.equal(rateForProfit({ ...base, members: 10, memberFee: 1000, memberHours: 1 }, 0), 0);
});

test("sensitivity grid shape and monotonicity", () => {
  const s = sensitivity(base);
  assert.equal(s.rates.length, 5);
  assert.equal(s.rows.length, 7);
  for (const row of s.rows) for (let i = 1; i < row.cells.length; i++) assert.ok(row.cells[i] >= row.cells[i - 1]);
  for (let i = 1; i < s.rows.length; i++) assert.ok(s.rows[i].cells[2] >= s.rows[i - 1].cells[2]);
});

test("analyze flags a loss and cheap memberships", () => {
  const a = analyze({ ...base, hourlyRate: 12 });
  assert.equal(a.findings[0].level, "high");
  const b = analyze({ ...base, hourlyRate: 40, members: 5, memberFee: 150, memberHours: 40 });
  assert.ok(b.findings.some((f) => /Member hours are priced below/.test(f.title) || /Memberships sell hours/.test(f.title)));
  const c = analyze({ ...base, utilization: 0.9, hourlyRate: 50 });
  assert.equal(c.findings[0].level, "info");
});

test("a negative input is treated as zero, as the page does", async () => {
  const { project, DEFAULTS } = await import("./calc.mjs");
  assert.equal(project({ ...DEFAULTS, memberFee: -450 }).profit, project({ ...DEFAULTS, memberFee: 0 }).profit);
});
