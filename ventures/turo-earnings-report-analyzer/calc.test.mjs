import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, decodeBuffer, daysBetween, normalizeRows, parseFixedList, analyze, sampleCsv } from "./calc.mjs";

const HEAD = "Reservation ID,Vehicle,Trip start,Trip end,Status,Trip price,Earnings\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("CSV parsing handles quoted fields, embedded commas, quotes and newlines", () => {
  const rows = parseCsv('a,b\n"Civic, 2021","say ""hi"""\n"line\nbreak",3\n');
  assert.deepEqual(rows[1], ["Civic, 2021", 'say "hi"']);
  assert.deepEqual(rows[2], ["line\nbreak", "3"]);
  assert.equal(parseCsv("﻿x,y\r\n1,2\r\n")[0][0], "x");
});

test("money and dates parse common formats; delimiters and UTF-16 are detected", () => {
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("(45.00)"), -45);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.ok(Number.isNaN(parseNumber("n/a")));
  assert.deepEqual(parseWhen("06/03/2026 10:30 AM"), { t: Date.UTC(2026, 5, 3, 10, 30), hasTime: true });
  assert.equal(parseWhen("2026-06-03").hasTime, false);
  assert.equal(parseWhen("02/30/2026"), null);
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Trip start"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Trip start");
});

test("rental days are whole 24-hour blocks with a small tolerance", () => {
  const t = Date.UTC(2026, 5, 1, 10);
  assert.equal(daysBetween(t, t + 26 * 3600000), 2);
  assert.equal(daysBetween(t, t + 48 * 3600000), 2);
  assert.equal(daysBetween(t, t + 50 * 3600000), 3);
  assert.equal(daysBetween(t, t + 60000), 1);
  assert.equal(daysBetween(t, t - 1000), 1);
});

test("a trip is read with vehicle, dates, days and payout; fee is price minus earnings", () => {
  const n = load('R1,"2021 Honda Civic",2026-06-01 10:00,2026-06-04 10:00,Completed,$300.00,$225.00\n');
  assert.equal(n.feeSource, "difference");
  const t = n.trips[0];
  assert.equal(t.vehicle, "2021 Honda Civic");
  assert.equal(t.days, 3);
  assert.equal(t.gross, 300); assert.equal(t.payout, 225); near(t.fee, 75);
});

test("a fee column wins, and a Days column overrides the date difference", () => {
  const n = load("R1,Civic,2026-06-01,2026-06-03,Completed,200,30,4\n", "Reservation ID,Vehicle,Trip start,Trip end,Status,Trip price,Turo fee,Trip days\n");
  assert.equal(n.feeSource, "column");
  assert.equal(n.trips[0].payout, 170);
  assert.equal(n.trips[0].days, 4);
});

test("a lone price column applies the fee percentage; a lone earnings column has no fee", () => {
  const a = load("R1,Civic,2026-06-01,2026-06-02,Completed,200\n", "Reservation ID,Vehicle,Trip start,Trip end,Status,Trip price\n", { feePct: 25 });
  assert.equal(a.feeSource, "percent");
  assert.equal(a.trips[0].payout, 150);
  const b = load("R1,Civic,2026-06-01,2026-06-02,Completed,150\n", "Reservation ID,Vehicle,Trip start,Trip end,Status,Earnings\n");
  assert.equal(b.feeSource, "none");
  assert.equal(b.trips[0].fee, 0);
  const c = load("R1,Civic,2026-06-01,2026-06-02,Completed,300,150\n", HEAD.replace("Trip price,Earnings", "Trip price,Earnings"), { feeMode: "gross", feePct: 20 });
  assert.equal(c.trips[0].payout, 240, "gross mode reads the price and applies the percentage");
});

test("vehicle name falls back to year, make and model, then plate", () => {
  const n = load("R1,2020,Toyota,Camry,2026-06-01,2026-06-02,100,75\n", "Reservation ID,Year,Make,Model,Trip start,Trip end,Trip price,Earnings\n");
  assert.equal(n.trips[0].vehicle, "2020 Toyota Camry");
});

test("cancelled trips are flagged and unreadable rows are skipped with a reason", () => {
  const n = load("R1,Civic,2026-06-01,2026-06-02,Completed,100,75\nR2,Civic,2026-06-05,2026-06-06,Cancelled by guest,0,0\nbad,Civic,not a date,,Completed,1,1\nR4,Civic,2026-06-07,2026-06-08,Completed,abc,1\nR5,Civic,2026-06-09,2026-06-10,Completed,,\nTotal,,,,,100,75\n");
  assert.equal(n.trips.length, 2);
  assert.equal(n.cancelledCount, 1);
  assert.deepEqual(n.skipped.map((s) => s.reason).sort(), ["amount not a number", "date not readable", "no amount", "total row"]);
});

test("a missing header, an empty file and an all-bad file give errors, not crashes", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2\n")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.match(load("x,y,nope,,,1,1\n").error, /No usable rows/);
});

test("fixed cost lines parse, with optional months and readable errors", () => {
  const r = parseFixedList("Civic, 650\n2019 Tesla Model 3; $820.50; 2\n\nnonsense\nBad, abc\n");
  assert.equal(r.list.length, 2);
  assert.equal(r.list[1].monthly, 820.5);
  assert.equal(r.list[1].months, 2);
  assert.equal(r.bad.length, 2);
});

const two = "R1,Civic,2026-06-01 10:00,2026-06-03 10:00,Completed,200,150\nR2,Civic,2026-06-10 10:00,2026-06-11 10:00,Completed,100,75\nR3,Truck,2026-06-05 10:00,2026-06-06 10:00,Completed,60,45\n";

test("per-vehicle profit: payout, per-trip costs, fixed cost and reconciliation", () => {
  const n = load(two);
  const r = analyze(n.trips, { cleaning: 10, fuel: 5, delivery: 0, loan: 100, insurance: 50, depreciation: 0, from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 30) });
  assert.equal(r.summary.periodDays, 30);
  const civic = r.byCar.find((c) => c.label === "Civic");
  assert.equal(civic.trips, 2); assert.equal(civic.days, 3);
  assert.equal(civic.payout, 225);
  assert.equal(civic.variable, 30);
  assert.equal(civic.contribution, 195);
  near(civic.fixedCost, 150 * (30 / 30.4375), 0.01);
  near(civic.net, 195 - civic.fixedCost, 0.01);
  near(civic.utilization, 3 / 30, 1e-9);
  near(civic.revenuePerDay, 75, 1e-9);
  const truck = r.byCar.find((c) => c.label === "Truck");
  assert.ok(truck.net < 0, "45 - 15 - ~148 fixed is a loss");
  assert.equal(r.summary.losingCars, 1);
  near(r.byCar.reduce((s, c) => s + c.net, 0), r.summary.net, 1e-6);
  assert.equal(r.byCar.reduce((s, c) => s + c.trips, 0), r.summary.trips);
  assert.equal(r.summary.trips, 3);
  assert.ok(r.findings.some((f) => /lost money after fixed costs/.test(f.title)));
});

test("per-car fixed lines override defaults and can set months owned; unmatched lines are reported", () => {
  const n = load(two);
  const r = analyze(n.trips, { loan: 100, fixedList: "Civic, 400, 1\nGhost Car, 10", from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 30) });
  assert.equal(r.byCar.find((c) => c.label === "Civic").fixedCost, 400);
  assert.equal(r.byCar.find((c) => c.label === "Civic").fixedFromList, true);
  assert.equal(r.unmatchedFixed.length, 1);
  assert.ok(r.findings.some((f) => /matched no vehicle/.test(f.title)));
});

test("file cost columns override the typed per-trip defaults when the cell is filled", () => {
  const n = load("R1,Civic,2026-06-01,2026-06-02,Completed,100,75,40\nR2,Civic,2026-06-03,2026-06-04,Completed,100,75,\n", "Reservation ID,Vehicle,Trip start,Trip end,Status,Trip price,Earnings,Cleaning cost\n");
  const r = analyze(n.trips, { cleaning: 10 });
  assert.equal(r.summary.variable, 50);
});

test("cancelled trips: no payout is dropped and counted, a payout stays as revenue with no days or costs", () => {
  const n = load("R1,Civic,2026-06-01,2026-06-02,Completed,100,75\nR2,Civic,2026-06-03,2026-06-05,Cancelled,0,0\nR3,Civic,2026-06-06,2026-06-08,Cancelled by host,50,40\n");
  const r = analyze(n.trips, { cleaning: 10 });
  assert.equal(r.summary.cancelledDropped, 1);
  assert.equal(r.summary.cancelledKept, 1);
  assert.equal(r.summary.days, 1);
  assert.equal(r.summary.payout, 115);
  assert.equal(r.summary.variable, 10, "a cancelled trip incurs no cleaning");
  assert.ok(r.findings.some((f) => /cancelled trip/.test(f.title)));
});

test("without fixed costs or per-trip costs the findings say the net is overstated", () => {
  const r = analyze(load(two).trips, {});
  assert.ok(r.findings.some((f) => /No fixed monthly costs/.test(f.title)));
  assert.ok(r.findings.some((f) => /No cleaning, fuel or delivery/.test(f.title)));
  assert.equal(r.summary.fixedCost, 0);
});

test("break-even utilization is fixed cost over contribution per day times the period", () => {
  const r = analyze(load(two).trips, { loan: 200, from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 30) });
  const civic = r.byCar.find((c) => c.label === "Civic");
  near(civic.breakEvenUtilization, civic.fixedCost / (75 * 30), 1e-9);
});

test("weekday and booking-length groups rank only with five or more trips", () => {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(`S${i},Civic,2026-06-0${1 + i} 10:00,2026-06-0${2 + i} 10:00,Completed,100,75`);
  for (let i = 0; i < 6; i++) rows.push(`L${i},Civic,2026-07-${10 + i * 3} 10:00,2026-07-${14 + i * 3} 10:00,Completed,360,270`);
  const r = analyze(load(rows.join("\n") + "\n").trips, { cleaning: 20 });
  assert.ok(r.byLength.length >= 2);
  assert.ok(r.findings.some((f) => /bookings earned most per day/.test(f.title)));
  const few = analyze(load(two).trips, {});
  assert.ok(!few.findings.some((f) => /bookings earned most per day|paid most per day/.test(f.title)));
});

test("a date range filters trips and rejects an empty range", () => {
  const n = load(two);
  const r = analyze(n.trips, { from: Date.UTC(2026, 5, 10), to: Date.UTC(2026, 5, 10) });
  assert.equal(r.summary.trips, 1);
  assert.match(analyze(n.trips, { from: Date.UTC(2027, 0, 1) }).invalid, /No trips/);
  assert.match(analyze(n.trips, { cleaning: -1 }).invalid, /cleaning/);
});

test("more than 100% utilization is flagged rather than shown silently", () => {
  const n = load("R1,Civic,2026-06-01,2026-06-11,Completed,100,75\n");
  const r = analyze(n.trips, { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 3) });
  assert.ok(r.byCar[0].utilization > 1);
  assert.ok(r.findings.some((f) => /more than 100% utilization/.test(f.title)));
});

test("the synthetic example reads cleanly and produces a losing car", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.ok(!n.error);
  assert.equal(n.skipped.length, 0);
  assert.ok(n.trips.length > 30);
  const r = analyze(n.trips, { cleaning: 25, fuel: 12, loan: 350, insurance: 150, depreciation: 150 });
  assert.equal(r.byCar.length, 3);
  assert.ok(r.summary.losingCars >= 1);
  near(r.byCar.reduce((s, c) => s + c.net, 0), r.summary.net, 1e-6);
});
