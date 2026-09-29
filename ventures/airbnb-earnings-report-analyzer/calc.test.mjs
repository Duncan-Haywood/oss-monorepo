import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseDate, detectDmy, detectDelimiter, decodeBuffer, normalizeRows, analyze, sampleCsv, monthKey } from "./calc.mjs";

const HEAD = "Date,Type,Confirmation code,Start date,End date,Nights,Guest,Listing,Currency,Amount,Paid out,Service fee,Fast pay fee,Cleaning fee,Gross earnings,Occupancy taxes\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("parseNumber and parseDate read Airbnb formats", () => {
  assert.equal(parseNumber("1,234.56"), 1234.56);
  assert.equal(parseNumber("-85.00"), -85);
  assert.equal(parseNumber("(5.00)"), -5);
  assert.equal(parseNumber(""), 0);
  assert.ok(Number.isNaN(parseNumber("abc")));
  assert.equal(parseNumber("1.234,56", true), 1234.56);
  assert.equal(parseDate("07/04/2026"), Date.UTC(2026, 6, 4));
  assert.equal(parseDate("13/04/2026", true), Date.UTC(2026, 3, 13));
  assert.equal(parseDate("2026-07-04"), Date.UTC(2026, 6, 4));
  assert.ok(Number.isNaN(parseDate("02/30/2026")));
  assert.ok(Number.isNaN(parseDate("soon")));
});

test("day-first files are detected only when unambiguous", () => {
  assert.equal(detectDmy(["25/12/2026", "01/02/2026"]), true);
  assert.equal(detectDmy(["12/25/2026", "01/02/2026"]), false);
  assert.equal(detectDmy(["01/02/2026"]), false);
  const n = load("13/07/2026,Reservation,A,13/07/2026,15/07/2026,2,G,Cabin,USD,100,,10,0,20,110,0\n");
  assert.equal(n.dmy, true);
  assert.equal(n.stays[0].start, Date.UTC(2026, 6, 13));
});

test("delimiter is sniffed and UTF-16 exports decode", () => {
  assert.equal(detectDelimiter("a\tb\tc"), "\t");
  assert.equal(detectDelimiter("a;b;c"), ";");
  const s = "Start date,Amount";
  const buf = new Uint8Array([0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(buf.buffer), s);
});

test("reservation, payout, adjustment and tax rows are classified", () => {
  const n = load([
    "07/05/2026,Reservation,A1,07/01/2026,07/05/2026,4,Ann,Cabin,USD,600.00,,110.00,0,80,710.00,40",
    "07/08/2026,Payout,,,,,,Cabin,USD,,600.00,,,,,",
    "07/09/2026,Resolution Adjustment,,,,,,Cabin,USD,-50.00,,,,,,",
    "07/09/2026,Pass Through Tax,,,,,,Cabin,USD,40.00,,,,,,",
  ].join("\n"));
  assert.equal(n.error, null);
  assert.equal(n.stays.length, 1);
  assert.equal(n.adjustments.length, 1);
  assert.equal(n.adjustments[0].amount, -50);
  assert.equal(n.payouts, 600);
  assert.equal(n.ignored, 1);
  assert.equal(n.currency, "USD");
});

test("gross and net are derived from each other when one column is missing", () => {
  const a = load("07/05/2026,Reservation,A,07/01/2026,07/03/2026,2,G,Cabin,USD,,,15,0,20,100,0\n");
  near(a.stays[0].net, 85);
  const b = load("07/05/2026,Reservation,A,07/01/2026,07/03/2026,2,G,Cabin,USD,85,,15,0,20,,0\n");
  near(b.stays[0].gross, 100);
});

test("nights come from the dates when the column is blank; bad rows are reported", () => {
  const n = load([
    "07/05/2026,Reservation,A,07/01/2026,07/04/2026,,G,Cabin,USD,90,,10,0,0,100,0",
    "07/05/2026,Reservation,B,not a date,07/04/2026,3,G,Cabin,USD,90,,10,0,0,100,0",
    "07/05/2026,Reservation,C,07/01/2026,,,G,Cabin,USD,90,,10,0,0,100,0",
  ].join("\n"));
  assert.equal(n.stays.length, 1);
  assert.equal(n.stays[0].nights, 3);
  assert.deepEqual(n.skipped.map((s) => [s.line, s.reason]), [[3, "unreadable start date"], [4, "no usable night count"]]);
});

test("missing columns give a specific message", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.match(load("").error, /No reservation rows/);
});

const S = (over) => ({ line: 1, code: "", guest: "", listing: "A", start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 0, 3), nights: 2, gross: 300, service: 45, fastPay: 0, cleaning: 60, taxes: 0, net: 255, ...over });

test("totals reconcile with the rows and per-listing figures add to the whole", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.error, null);
  const r = analyze(n.stays, n.adjustments);
  const s = r.summary;
  near(r.byListing.reduce((t, l) => t + l.net, 0), s.net, 0.01);
  near(r.byListing.reduce((t, l) => t + l.gross, 0), s.gross, 0.01);
  assert.equal(r.byListing.reduce((t, l) => t + l.stays, 0), s.stays);
  assert.equal(r.byMonth.reduce((t, m) => t + m.stays, 0), s.stays);
  assert.equal(r.byLos.reduce((t, b) => t + b.stays, 0), s.stays);
  near(s.feeShare, 0.155, 0.002);
  assert.equal(r.byListing.length, 3);
  assert.equal(s.negAdj, -85);
});

test("derived rates: ADR, net per night, length of stay, occupancy", () => {
  const stays = [S({}), S({ start: Date.UTC(2026, 0, 3), end: Date.UTC(2026, 0, 7), nights: 4, gross: 500, net: 425, service: 75 })];
  const r = analyze(stays, []);
  near(r.summary.adr, 800 / 6);
  near(r.summary.netPerNight, 680 / 6);
  near(r.summary.los, 3);
  near(r.summary.occupancy, 6 / 6);
  const o = analyze(stays, [], {});
  assert.equal(o.byListing[0].key, "A");
  const wide = analyze(stays, [], { daysAvailable: 12 });
  near(wide.byListing[0].occupancy, 0.5);
});

test("cleaning cost turns net into profit and flags a short cleaning fee", () => {
  const stays = [S({}), S({ start: Date.UTC(2026, 0, 3), end: Date.UTC(2026, 0, 5) })];
  const r = analyze(stays, [], { cleaningCost: 90 });
  near(r.summary.profit, 510 - 180);
  near(r.summary.cleaningNet, 120 - 180);
  assert.ok(r.findings.some((f) => /fall 30.00 short/.test(f.title)));
  const none = analyze(stays, []);
  assert.equal(none.summary.cleaningNet, null);
  assert.ok(!none.findings.some((f) => /Cleaning fees/.test(f.title)));
});

test("short stays are flagged as weakest once cleaning cost is included", () => {
  const stays = [];
  for (let i = 0; i < 4; i++) stays.push(S({ start: Date.UTC(2026, 0, 1 + i * 3), end: Date.UTC(2026, 0, 2 + i * 3), nights: 1, gross: 100, net: 85, service: 15, cleaning: 40 }));
  for (let i = 0; i < 4; i++) stays.push(S({ start: Date.UTC(2026, 1, 1 + i * 8), end: Date.UTC(2026, 1, 8 + i * 8), nights: 7, gross: 700, net: 595, service: 105, cleaning: 40 }));
  const r = analyze(stays, [], { cleaningCost: 60 });
  const f = r.findings.find((x) => /weakest/.test(x.title));
  assert.ok(f && /1–2 nights/.test(f.title));
});

test("date range filters stays by check-in; empty range is reported", () => {
  const stays = [S({}), S({ start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 5, 3) })];
  assert.equal(analyze(stays, [], { from: Date.UTC(2026, 4, 1) }).summary.stays, 1);
  assert.match(analyze(stays, [], { from: Date.UTC(2027, 0, 1) }).invalid, /No stays/);
});

test("months are keyed by check-in date and fee share above 17% is flagged", () => {
  assert.equal(monthKey(Date.UTC(2026, 6, 31)), "2026-07");
  const r = analyze([S({ service: 60, fastPay: 10, gross: 300, net: 230 })], []);
  assert.ok(r.findings.some((f) => /Fees took 23\.3%/.test(f.title)));
});

test("occupancy taxes are shown for reference and never enter earnings", () => {
  const r = analyze([S({ taxes: 30 })], []);
  assert.equal(r.summary.taxes, 30);
  near(r.summary.net, 255);
  assert.ok(r.findings.some((f) => /occupancy taxes/.test(f.title)));
});
