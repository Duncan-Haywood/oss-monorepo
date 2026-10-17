import { test } from "node:test";
import assert from "node:assert/strict";
import { money, parseDuration, parseCsv, detectDelimiter, normalizeBookings, analyze, reportCsv, summaryText, sampleCsv, hourLabel } from "./calc.mjs";

const HEAD = "Stylist,Service,Start Time,Duration,Status,Price";
const ROWS = [
  "Ann,Cut,2026-03-02 10:00,30,Completed,45",
  "Ann,Cut,2026-03-02 11:00,30,Completed,45",
  "Ann,Cut,2026-03-03 10:00,30,Completed,45",
  "Bob,Cut,2026-03-03 11:00,30,Completed,45",
  "Bob,Cut,2026-03-04 10:00,30,Completed,45",
  "Ann,Color,2026-03-04 12:00,2h,Completed,120",
  "Ann,Color,2026-03-05 12:00,2h,Completed,120",
  "Bob,Color,2026-03-05 14:00,120,Completed,120",
  "Bob,Color,2026-03-06 12:00,1:30,Completed,120",
  "Bob,Color,2026-03-06 15:00,2 hours,Completed,120",
  "Ann,Cut,2026-03-07 10:00,30,No Show,45",
  "Ann,Cut,2026-03-07 11:00,30,Cancelled,45",
  "Ann,Cut,2026-03-07 12:00,30,Booked,45",
  "Ann,Cut,2026-03-08 10:00,,Completed,45",
  "Ann,Cut,2026-03-08 11:00,30,Completed,",
  "Ann,Cut,2026-03-02 10:00,30,Completed,45",
  "Ann,Cut,not a date,30,Completed,45",
  "Ann,Cut,2026-03-09 10:00,30,Weird,45",
];
const CSV = [HEAD, ...ROWS].join("\n");
const load = (text, o) => { const d = detectDelimiter(text); return normalizeBookings(parseCsv(text, d), { decimalComma: d === ";", ...o }); };

test("money formats with separators", () => {
  assert.equal(money(1234567.891), "1,234,567.89");
  assert.equal(money(-5.5), "-5.50");
});

test("parseDuration reads minutes, hours, h/m text and clock style", () => {
  assert.equal(parseDuration("45"), 45);
  assert.equal(parseDuration("45 min"), 45);
  assert.equal(parseDuration("1h 30m"), 90);
  assert.equal(parseDuration("1:30"), 90);
  assert.equal(parseDuration("2 hours"), 120);
  assert.equal(parseDuration("1.5", true), 90);
  assert.equal(parseDuration("1.5 hrs"), 90);
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("soon"), null);
});

test("normalize reads columns, skips bad rows and counts duplicates", () => {
  const n = load(CSV);
  assert.equal(n.error, null);
  assert.equal(n.duplicates, 1);
  assert.equal(n.skipped.length, 3); // duplicate, bad date, unknown status
  assert.equal(n.hasStatus, true);
  assert.equal(n.hasStaff, true);
  assert.equal(n.columns.duration, "Duration");
});

test("end time can stand in for a duration", () => {
  const n = load("Service,Start,End,Price\nCut,2026-03-02 10:00,2026-03-02 10:45,45\nCut,2026-03-02 11:00,2026-03-02 11:45,45");
  assert.equal(n.error, null);
  assert.equal(n.hasStatus, false);
  assert.deepEqual(n.records.map((r) => r.minutes), [45, 45]);
  assert.equal(n.records[0].status, "completed");
  assert.equal(n.records[0].durationSource, "end time");
});

test("a duration column named in hours is read as hours", () => {
  const n = load("Service,Start,Duration (hours),Price\nCut,2026-03-02 10:00,1.5,90");
  assert.equal(n.records[0].minutes, 90);
});

test("a file with no price or no duration gets a specific error", () => {
  assert.match(load("Service,Start,Status\nCut,2026-03-02 10:00,Completed").error, /No header row found/);
  assert.match(load("").error, /empty/);
});

test("yield is dollars over hours from the same bookings, and rows reconcile", () => {
  const a = analyze(load(CSV).records, {});
  // cuts: 5 x 30 min = 2.5 h, $225. colour: 4h + 1.5h + 2h... see rows: 2h,2h,120m,1:30,2h = 9.5 h, $600
  const cut = a.byService.find((r) => r.label === "Cut"), col = a.byService.find((r) => r.label === "Color");
  assert.equal(cut.bookings, 5);
  assert.equal(cut.hours, 2.5);
  assert.equal(cut.yield, 90);
  assert.equal(col.hours, 9.5);
  assert.equal(col.revenue, 600);
  assert.equal(col.yield, 63.16);
  assert.equal(a.summary.revenue, 825);
  assert.equal(a.summary.hours, 12);
  assert.equal(a.summary.yield, 68.75);
  assert.equal(a.byService.reduce((s, r) => s + r.revenue, 0), a.summary.revenue);
  assert.equal(a.byService.reduce((s, r) => s + r.hours, 0), a.summary.hours);
  assert.equal(a.byWeekday.reduce((s, r) => s + r.revenue, 0), a.summary.revenue);
});

test("missing price or duration is left out and counted, never guessed", () => {
  const a = analyze(load(CSV).records, {});
  assert.equal(a.summary.missingPrice, 1);
  assert.equal(a.summary.missingDuration, 1);
  assert.equal(a.summary.usedInYield, 10);
  assert.ok(a.findings.some((f) => /left out of the yield/.test(f.title)));
});

test("no-shows count as empty chair hours; cancelled and open rows are left out", () => {
  const a = analyze(load(CSV).records, {});
  assert.equal(a.summary.noShows, 1);
  assert.equal(a.summary.noShowHours, 0.5);
  assert.equal(a.summary.noShowLostRevenue, 45);
  assert.equal(a.summary.leftOut, 2);
});

test("staff rows and sorting", () => {
  const a = analyze(load(CSV).records, {});
  assert.deepEqual(a.byStaff.map((r) => r.label).sort(), ["Ann", "Bob"]);
  for (let i = 1; i < a.byService.length; i++) assert.ok(a.byService[i - 1].yield >= a.byService[i].yield);
});

test("small groups are marked and never named worst", () => {
  const a = analyze(load(["Service,Start,Duration,Price", "A,2026-03-02 10:00,60,100", "B,2026-03-02 12:00,60,10"].join("\n")).records, {});
  assert.ok(a.byService.every((r) => r.lowSample));
  assert.ok(!a.findings.some((f) => /earns the least/.test(f.title)));
});

test("the price what-if flags a low-yield service and does the arithmetic on the flagged revenue", () => {
  const rows = ["Service,Start,Duration,Price"];
  for (let i = 0; i < 6; i++) rows.push(`Fast,2026-03-0${i + 1} 10:00,30,100`); // $200/h
  for (let i = 0; i < 6; i++) rows.push(`Slow,2026-03-0${i + 1} 12:00,120,100`); // $50/h
  const a = analyze(load(rows.join("\n")).records, { lowYieldPct: 75, priceUpPct: 10, volumeLossPct: 5 });
  assert.deepEqual(a.whatIf.flagged, ["Slow"]);
  assert.equal(a.whatIf.flaggedRevenue, 600);
  assert.equal(a.whatIf.gain, 27); // 600 * 1.10 * 0.95 - 600
  assert.equal(a.whatIf.freedHours, 0.6);
  assert.ok(a.findings.some((f) => /Slow earns the least/.test(f.title) && f.severity === "high"));
});

test("capacity compares booked hours a week with typed open hours", () => {
  const a = analyze(load(CSV).records, { openHoursPerWeek: 20 });
  assert.ok(a.capacity.heldPerWeek > 0);
  assert.equal(a.capacity.openHours, 20);
  assert.equal(analyze(load(CSV).records, {}).capacity, null);
  assert.equal(analyze(load(CSV).records, { openHoursPerWeek: 1 }).capacity.overCapacity, true);
});

test("invalid assumptions are refused with a message", () => {
  assert.match(analyze(load(CSV).records, { priceUpPct: -1 }).invalid, /Price increase/);
  assert.match(analyze(load(CSV).records, { volumeLossPct: 101 }).invalid, /Volume lost/);
  assert.match(analyze(load(CSV).records, { openHoursPerWeek: 200 }).invalid, /Open hours/);
});

test("semicolon files with decimal commas are read", () => {
  const n = load("Service;Start;Duration;Price\nCut;2026-03-02 10:00;30;45,50");
  assert.equal(n.records[0].price, 45.5);
});

test("report CSV neutralises spreadsheet formulas and summary text is plain", () => {
  const n = load(["Service,Start,Duration,Price", "=HYPERLINK(\"x\"),2026-03-02 10:00,60,100"].join("\n"));
  const csv = reportCsv(analyze(n.records, {}));
  assert.match(csv, /'=HYPERLINK/);
  assert.match(summaryText(analyze(load(CSV).records, {})), /not advice/);
});

test("the sample data loads and produces a flagged service and every table", () => {
  const n = load(sampleCsv());
  assert.equal(n.error, null);
  const a = analyze(n.records, { openHoursPerWeek: 40 });
  assert.ok(a.byService.length >= 4 && a.byStaff.length === 3 && a.byHour.length > 0);
  assert.ok(a.whatIf.flagged.length >= 1);
  assert.equal(hourLabel(0), "12 AM");
  assert.equal(hourLabel(13), "1 PM");
});
