import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePackages, analyze, samplePackages, reportCsv, DEFAULTS } from "./calc.mjs";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("parsePackages reads rows, skips header and bad lines, errors when empty", () => {
  const r = parsePackages("package,price,coverage hours,cost per job,jobs per month\nWedding,4000,8,300,2\nbad line\n,0,0\n");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].name, "Wedding");
  assert.equal(r.warnings.length, 1);
  assert.ok(parsePackages("").error);
});

test("hand-calculated 8h wedding: editing is most of the hours", () => {
  const { rows } = parsePackages("Wedding,4000,8,300,1");
  const r = analyze(rows, { cardFeePct: 0, travelHours: 2, clientHours: 4, editRatio: 3, gearWearPerHour: 10, overheadMonthly: 0, targetHourly: 50 });
  const l = r.lines[0];
  near(l.editHours, 24);
  near(l.slotHours, 8 + 2 + 4 + 24);
  near(l.gear, 80);
  near(l.contribution, 4000 - 300 - 80);
  near(l.profitPerHour, 3620 / 38);
  near(l.headlinePerHour, 500);
  near(l.editShare, 24 / 38);
  near(l.floorPrice, 50 * 38 + 380);
});

test("price floor round-trips: charging it earns exactly the target per hour worked", () => {
  const { rows } = parsePackages("Wedding,3000,6,200,2");
  const o = { cardFeePct: 3, overheadMonthly: 1200, targetHourly: 55 };
  const floor = analyze(rows, o).lines[0].floorPrice;
  const at = analyze([{ ...rows[0], price: floor }], o).lines[0];
  near(at.profitPerHour, 55, 1e-6);
});

test("overhead is spread over bookable hours, not hours filled", () => {
  const r = analyze(parsePackages("A,1000,2,0,1").rows, { overheadMonthly: 1000, bookableHoursPerWeek: 20, weeksPerYear: 50 });
  near(r.overheadPerHour, 12000 / 1000);
});

test("associate model counts only coverage and travel hours and no editing", () => {
  const r = analyze(parsePackages("W,4000,8,300,4").rows, { weeksPerYear: 48, travelHours: 2, associateRatePerHour: 60, associateOverheadPct: 0, gearWearPerHour: 0, overheadMonthly: 0, bookableHoursPerWeek: 40 });
  const a = r.models.find((m) => m.key === "associate");
  const perWeek = (4 * 12) / 48;
  near(a.hours, perWeek * 10);
  near(a.weekly, perWeek * 8 * 60);
  near(a.perHour, 48);
});

test("lead marketplace costs the stated share of price", () => {
  const o = { cardFeePct: 0, leadFeePct: 10, gearWearPerHour: 0, overheadMonthly: 0, weeksPerYear: 12 };
  const r = analyze(parsePackages("W,1000,2,0,1").rows, o);
  const own = r.models.find((m) => m.key === "own"), lead = r.models.find((m) => m.key === "lead");
  near(own.weekly - lead.weekly, r.week.revenue * 0.1);
});

test("raise break-even loss is extra revenue over new contribution", () => {
  const r = analyze(parsePackages("W,1000,2,200,1").rows, { cardFeePct: 0, gearWearPerHour: 0, overheadMonthly: 0, weeksPerYear: 12 });
  const x = r.raises.find((q) => q.pct === 10);
  near(x.breakEvenLoss, 100 / (800 + 100));
});

test("utilization warning when the mix does not fit", () => {
  const r = analyze(parsePackages("W,4000,8,300,8").rows, { bookableHoursPerWeek: 10 });
  assert.ok(r.warnings.some((w) => /does not fit/.test(w)));
});

test("input validation", () => {
  const rows = parsePackages("W,1000,2,0,1").rows;
  assert.ok(analyze(rows, { cardFeePct: 100 }).error);
  assert.ok(analyze(rows, { editRatio: -1 }).error);
  assert.ok(analyze(rows, { bookableHoursPerWeek: 0 }).error);
  assert.ok(analyze(rows, { associateOverheadPct: 150 }).error);
  assert.ok(analyze(rows, { targetHourly: "abc" }).error);
});

test("sample runs, verdict names the weakest package, CSV has a row per package", () => {
  const { rows } = parsePackages(samplePackages());
  const r = analyze(rows, { overheadMonthly: 900 });
  assert.equal(r.lines.length, rows.length);
  assert.match(r.verdict, /\$\d/);
  assert.equal(reportCsv(r).trim().split("\n").length, 1 + rows.length + 1 + 1 + 3);
  assert.ok(Object.keys(DEFAULTS).length >= 12);
});
