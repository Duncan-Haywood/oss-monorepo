import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseMinutes, parseWhen, detectDmy, detectDelimiter, decodeBuffer, normalizeRows, analyze, sampleCsv } from "./calc.mjs";

const HEAD = "Date,Platform,Earnings,Tip,Miles,Minutes\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("parseNumber, parseMinutes and parseWhen read common formats", () => {
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("(5.00)"), -5);
  assert.equal(parseNumber(""), 0);
  assert.ok(Number.isNaN(parseNumber("abc")));
  assert.equal(parseMinutes("23"), 23);
  assert.equal(parseMinutes("25 min"), 25);
  assert.equal(parseMinutes("1h 5m"), 65);
  assert.equal(parseMinutes("1:05:30"), 65.5);
  assert.equal(parseMinutes("0:40"), 40);
  assert.ok(Number.isNaN(parseMinutes("")));
  assert.deepEqual(parseWhen("2026-09-04 18:30"), { t: Date.UTC(2026, 8, 4, 18, 30), hasTime: true });
  assert.deepEqual(parseWhen("09/04/2026 6:30 PM"), { t: Date.UTC(2026, 8, 4, 18, 30), hasTime: true });
  assert.deepEqual(parseWhen("09/04/2026 12:05 AM"), { t: Date.UTC(2026, 8, 4, 0, 5), hasTime: true });
  assert.deepEqual(parseWhen("2026-09-04T18:30:00Z"), { t: Date.UTC(2026, 8, 4, 18, 30), hasTime: true });
  assert.equal(parseWhen("2026-09-04").hasTime, false);
  assert.equal(parseWhen("13/25/2026"), null);
  assert.equal(parseWhen("02/30/2026"), null);
  assert.equal(parseWhen("soon"), null);
});

test("day-first files are detected only when unambiguous", () => {
  assert.equal(detectDmy(["25/12/2026", "01/02/2026"]), true);
  assert.equal(detectDmy(["12/25/2026"]), false);
  assert.equal(detectDmy(["01/02/2026"]), false);
  assert.equal(load("13/09/2026 10:00,A,10,0,5,20\n").trips[0].t, Date.UTC(2026, 8, 13, 10));
});

test("delimiter and UTF-16 decoding", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a\tb\n1\t2"), "\t");
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Date,Earnings"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Date,Earnings");
});

test("normalizeRows reads a trip with pay, tip, miles and minutes", () => {
  const n = load("2026-09-04 18:30,Rideshare,12.50,2.00,6.5,21\n");
  assert.equal(n.trips.length, 1);
  const t = n.trips[0];
  assert.equal(t.pay, 12.5); assert.equal(t.tip, 2); assert.equal(t.miles, 6.5); assert.equal(t.minutes, 21);
  assert.equal(t.platform, "Rideshare");
  assert.equal(n.hasMinutes && n.hasMiles, true);
});

test("a Total column without a pay column is split into pay plus tip", () => {
  const n = load("2026-09-04 18:30,10,3,5,20\n", "Date,Total,Tip,Miles,Minutes\n");
  assert.equal(n.trips[0].pay, 7);
  assert.equal(n.trips[0].tip, 3);
});

test("kilometres are converted to miles", () => {
  const n = load("2026-09-04 18:30,10,0,10 ,20\n", "Date,Earnings,Tip,Distance (km),Minutes\n");
  assert.equal(n.unit, "km");
  near(n.trips[0].miles, 6.21371, 0.001);
  const m = load("2026-09-04 18:30,10,0,10,20\n", "Date,Earnings,Tip,Distance,Minutes\n", { unit: "km" });
  near(m.trips[0].miles, 6.21371, 0.001);
});

test("duration can come from start and end times, including past midnight", () => {
  const n = load("2026-09-04 23:50,10,0,5,00:10\n", "Start time,Earnings,Tip,Miles,End time\n");
  assert.equal(n.trips[0].minutes, 20);
});

test("unreadable rows and total rows are skipped with a reason, never silently", () => {
  const n = load("2026-09-04 10:00,A,10,0,5,20\nnot a date,A,10,0,5,20\n2026-09-05 10:00,A,abc,0,5,20\nTotal,,20,0,10,40\n");
  assert.equal(n.trips.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.reason).sort(), ["amount not a number", "date not readable", "total row"]);
  assert.deepEqual(n.skipped.map((s) => s.line), [3, 4, 5]);
});

test("missing header and empty file give an error", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.match(load("x,A,1,0,1,1\n").error, /No usable rows/);
});

test("blank miles and minutes are unknown, not zero", () => {
  const n = load("2026-09-04 10:00,A,10,0,,\n");
  assert.equal(n.trips[0].miles, null);
  assert.equal(n.trips[0].minutes, null);
});

const BODY =
  "2026-09-04 18:00,A,10.00,2.00,10,30\n" + // gross 12, cost 7 @0.70 -> net 5
  "2026-09-04 19:00,A,4.00,0.00,10,30\n" + //  gross 4, net -3
  "2026-09-05 12:00,B,20.00,0.00,10,30\n"; //  gross 20, net 13

test("analyze: totals, vehicle cost and per-hour figures", () => {
  const r = analyze(load(BODY).trips, { costPerMile: 0.7 });
  const s = r.summary;
  near(s.gross, 36); near(s.tips, 2); near(s.cost, 21); near(s.net, 15);
  assert.equal(s.trips, 3);
  near(s.netPerHourHeadline, 15 / 1.5); near(s.grossPerHourHeadline, 24);
  near(s.grossPerMile, 36 / 30); near(s.netPerMile, 0.5);
  near(s.vehicleShare, 21 / 36);
  assert.equal(s.losing, 1); near(s.losingAmount, -3);
});

test("analyze: groups reconcile to the totals", () => {
  const r = analyze(load(BODY).trips, { costPerMile: 0.7 });
  for (const g of [r.byPlatform, r.byWeekday, r.byMonth]) {
    near(g.reduce((a, b) => a + b.net, 0), r.summary.net);
    assert.equal(g.reduce((a, b) => a + b.trips, 0), 3);
  }
  assert.equal(r.byPlatform[0].label, "B");
  assert.equal(r.byWeekday.map((d) => d.label).join(), "Friday,Saturday");
});

test("analyze: extra unpaid miles raise the vehicle cost", () => {
  const r = analyze(load(BODY).trips, { costPerMile: 0.7, extraMilesPct: 50 });
  near(r.summary.cost, 31.5);
  near(r.summary.net, 4.5);
});

test("analyze: entered online hours replace trip minutes in the headline only", () => {
  const r = analyze(load(BODY).trips, { costPerMile: 0.7, onlineHours: 5 });
  near(r.summary.netPerHourHeadline, 3);
  near(r.summary.netPerHour, 10);
  assert.equal(r.summary.hourBasisIsOnline, true);
});

test("analyze: a file without miles reports income only and says so", () => {
  const n = load("2026-09-04 18:00,A,10,0\n", "Date,Platform,Earnings,Tip\n");
  const r = analyze(n.trips, { costPerMile: 0.7 });
  near(r.summary.net, 10);
  assert.equal(r.summary.netPerHourHeadline, null);
  assert.ok(r.findings.some((f) => /no miles column/.test(f.title)));
  assert.ok(r.findings.some((f) => /No minutes or hours/.test(f.title)));
});

test("analyze: partial miles never drag per-mile rates toward zero", () => {
  const n = load("2026-09-04 18:00,A,10,0,10,30\n2026-09-04 19:00,A,10,0,,30\n");
  const r = analyze(n.trips, { costPerMile: 0.5 });
  near(r.summary.grossPerMile, 1);
  assert.ok(r.findings.some((f) => /Only 50% of trips report miles/.test(f.title)));
});

test("analyze: date range filter and empty range", () => {
  const n = load(BODY);
  const r = analyze(n.trips, { costPerMile: 0.7, from: Date.UTC(2026, 8, 5), to: Date.UTC(2026, 8, 5) });
  assert.equal(r.summary.trips, 1);
  assert.match(analyze(n.trips, { from: Date.UTC(2027, 0, 1) }).invalid, /No trips/);
  assert.match(analyze(n.trips, { costPerMile: -1 }).invalid, /zero or more/);
});

test("analyze: floor counts trips below the hourly line", () => {
  const r = analyze(load(BODY).trips, { costPerMile: 0.7, floorPerHour: 15 });
  assert.equal(r.belowFloor.count, 2);
  assert.equal(r.belowFloor.timed, 3);
});

test("analyze: dayparts need timestamps and are left out of date-only files", () => {
  const n = load("2026-09-04,A,10,0,5,20\n");
  const r = analyze(n.trips, { costPerMile: 0.5 });
  assert.equal(r.byDaypart.length, 0);
  assert.equal(r.byWeekday.length, 1);
});

test("analyze: worst trips are sorted and capped", () => {
  const r = analyze(load(BODY).trips, { costPerMile: 0.7 });
  assert.equal(r.worst[0].net < r.worst[1].net, true);
  assert.ok(r.worst.length <= 10);
});

test("the sample file parses, reconciles and produces findings", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.skipped.length, 0);
  assert.ok(n.trips.length > 100);
  const r = analyze(n.trips, { costPerMile: 0.7, floorPerHour: 15 });
  near(r.byDaypart.reduce((a, b) => a + b.net, 0), r.summary.net, 0.01);
  near(r.byPlatform.reduce((a, b) => a + b.net, 0), r.summary.net, 0.01);
  assert.ok(r.findings.length >= 3);
  assert.equal(sampleCsv(), sampleCsv());
});
