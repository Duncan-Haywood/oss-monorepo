import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeShipments, analyze, parseDate, dayIso, holidaysFor, makeCalendar, promisedDaysFor, claimLetter, reportCsv, sampleCsv, detectDelimiter, decodeBuffer, money } from "./calc.mjs";

const H = "Tracking,Service,Ship Date,Delivery Date,Charge,Invoice Date,Status\n";
const run = (csv, opts) => {
  const n = normalizeShipments(parseCsv(csv, detectDelimiter(csv)));
  assert.ok(!n.error, n.error);
  return { n, a: analyze(n.records, opts) };
};
const d = (s) => parseDate(s);

test("csv parser handles quotes, CRLF and BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n').rows, [["a", "b"], ["x, y", 'he said "hi"']]);
});
test("decodeBuffer honours UTF-16 and BOM; money formats", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xff, 0xfe, 0x61, 0x00])), "a");
  assert.equal(money(1234.5), "1,234.50");
});

test("dates: ISO, US, compact, month names; impossible dates rejected", () => {
  const want = dayIso(d("2026-03-04"));
  for (const s of ["2026-03-04", "3/4/2026", "3/4/26", "20260304", "Mar 4, 2026", "4 Mar 2026", "2026-03-04 14:22:00", "03.04.2026"]) assert.equal(dayIso(d(s)), want, s);
  assert.equal(d("2026-02-30"), null);
  assert.equal(d("13/45/2026"), null);
  assert.equal(d(""), null);
  assert.equal(d("soon"), null);
});

test("holidays are computed by rule", () => {
  const iso = (y, m) => holidaysFor(y, m).map(dayIso);
  assert.deepEqual(iso(2026, "carrier"), ["2026-01-01", "2026-05-25", "2026-07-04", "2026-09-07", "2026-11-26", "2026-12-25"]);
  assert.ok(iso(2026, "federal").includes("2026-01-19")); // MLK
  assert.deepEqual(iso(2026, "none"), []);
  // Jan 1 2023 was a Sunday: the Monday is the day off
  assert.ok(iso(2023, "carrier").includes("2023-01-02"));
});

test("business days skip weekends, holidays and extra dates", () => {
  const cal = makeCalendar("carrier");
  assert.equal(dayIso(cal.addBusinessDays(d("2026-08-07"), 1)), "2026-08-10"); // Fri -> Mon
  assert.equal(dayIso(cal.addBusinessDays(d("2026-11-25"), 1)), "2026-11-27"); // over Thanksgiving
  assert.equal(cal.businessDaysBetween(d("2026-08-03"), d("2026-08-10")), 5);
  const closed = makeCalendar("carrier", [d("2026-08-04")]);
  assert.equal(dayIso(closed.addBusinessDays(d("2026-08-03"), 1)), "2026-08-05");
});

test("service promises: express services fixed, ground and economy null", () => {
  assert.equal(promisedDaysFor("UPS Next Day Air Saver"), 1);
  assert.equal(promisedDaysFor("FedEx Priority Overnight"), 1);
  assert.equal(promisedDaysFor("UPS 2nd Day Air A.M."), 2);
  assert.equal(promisedDaysFor("FedEx 2Day"), 2);
  assert.equal(promisedDaysFor("UPS 3 Day Select"), 3);
  assert.equal(promisedDaysFor("FedEx Express Saver"), 3);
  assert.equal(promisedDaysFor("UPS Ground"), null);
  assert.equal(promisedDaysFor("FedEx SmartPost"), null);
  assert.equal(promisedDaysFor("USPS Priority Mail"), null);
  assert.equal(promisedDaysFor(""), null);
});

test("missing columns are errors that name the header", () => {
  assert.match(normalizeShipments(parseCsv("Tracking,Delivery Date\n1,2026-01-01\n")).error, /ship date/i);
  assert.match(normalizeShipments(parseCsv("Tracking,Ship Date\n1,2026-01-01\n")).error, /delivery date/i);
  assert.match(normalizeShipments(parseCsv("a,b\n")).error, /header row/);
});

test("total rows and unreadable dates are skipped with a reason", () => {
  const { n } = run(H + "T1,UPS Next Day Air,2026-08-03,2026-08-04,40,,\n,,,,,,Total\nT2,UPS Next Day Air,someday,2026-08-04,40,,\n");
  assert.equal(n.records.length, 1);
  assert.equal(n.skipped.length, 2);
  assert.match(n.skipped[1].reason, /not understood/);
});

test("next day air delivered two days after shipping is late by one business day", () => {
  const { a } = run(H + "T1,UPS Next Day Air,2026-08-03,2026-08-05,48.20,2026-08-10,\nT2,UPS Next Day Air,2026-08-03,2026-08-04,48.20,2026-08-10,\n", { asOf: d("2026-08-12") });
  assert.equal(a.late.length, 1);
  assert.equal(a.late[0].tracking, "T1");
  assert.equal(a.late[0].daysLate, 1);
  assert.equal(a.summary.refundable, 48.2);
  assert.equal(a.findings[0].severity, "high");
  assert.equal(a.findings[0].dollars, 48.2);
});

test("a Friday shipment delivered Monday is on time for next day", () => {
  const { a } = run(H + "T1,UPS Next Day Air,2026-08-07,2026-08-10,48,,\n");
  assert.equal(a.late.length, 0);
  assert.equal(a.findings.length, 0);
});

test("delivery before or on the ship date is never late", () => {
  const { a } = run(H + "T1,UPS Next Day Air,2026-08-07,2026-08-06,48,,\n");
  assert.equal(a.late.length, 0);
});

test("claim window: open, expired against asOf, unknown without an invoice date", () => {
  const csv = H + "A,UPS 2nd Day Air,2026-06-01,2026-06-05,30,2026-06-10,\nB,UPS 2nd Day Air,2026-08-03,2026-08-07,30,2026-08-10,\nC,UPS 2nd Day Air,2026-08-03,2026-08-07,30,,\n";
  const { a } = run(csv, { asOf: d("2026-08-20") });
  const by = Object.fromEntries(a.late.map((l) => [l.tracking, l.window]));
  assert.deepEqual(by, { A: "expired", B: "open", C: "unknown" });
  assert.equal(a.summary.refundable, 60);
  assert.equal(a.summary.pastWindow, 30);
  assert.ok(a.findings.some((f) => f.kind === "expired" && f.dollars === 0));
  const wide = run(csv, { asOf: d("2026-08-20"), claimWindowDays: 90 }).a;
  assert.equal(wide.summary.pastWindow, 0);
});

test("weather and recipient notes excuse the carrier and are not counted", () => {
  const { a } = run(H + "A,UPS Next Day Air,2026-08-03,2026-08-06,50,,Delayed: severe weather\nB,UPS Next Day Air,2026-08-03,2026-08-06,50,,Recipient not home\n");
  assert.equal(a.summary.refundable, 0);
  const f = a.findings.find((x) => x.kind === "excused");
  assert.equal(f.lines.length, 2);
  assert.equal(f.dollars, 0);
});

test("a credit line for the same tracking number suppresses the claim", () => {
  const { a } = run(H + "A,UPS Next Day Air,2026-08-03,2026-08-06,50,,\nA,UPS Next Day Air,2026-08-03,2026-08-06,-50,,\n");
  assert.equal(a.summary.refundable, 0);
  assert.equal(a.late.length, 1);
  assert.ok(a.findings.some((f) => f.kind === "credited"));
});

test("an exact duplicate is one late shipment and one duplicate finding", () => {
  const { a } = run(H + "A,UPS Next Day Air,2026-08-03,2026-08-06,50,,\nA,UPS Next Day Air,2026-08-03,2026-08-06,50,,\n");
  assert.equal(a.late.length, 1);
  assert.equal(a.summary.refundable, 50);
  const dup = a.findings.find((f) => f.kind === "duplicate");
  assert.equal(dup.dollars, 50);
  assert.deepEqual(dup.lines, [2, 3]);
});

test("ground is judged only with the ground setting or a per-row promise", () => {
  const csv = H + "G,UPS Ground,2026-08-03,2026-08-12,14,,\n";
  assert.equal(run(csv).a.late.length, 0);
  assert.equal(run(csv).a.summary.unjudged, 1);
  assert.equal(run(csv, { groundDays: 5 }).a.late.length, 1);
  const withDays = "Tracking,Service,Ship Date,Delivery Date,Charge,Transit Days\nG,UPS Ground,2026-08-03,2026-08-12,14,3\n";
  assert.equal(run(withDays).a.late[0].daysLate, 4);
});

test("a promised-date column overrides the service table", () => {
  const csv = "Tracking,Service,Ship Date,Delivery Date,Charge,Scheduled Delivery Date\nP,UPS Ground,2026-08-03,2026-08-07,20,2026-08-07\nQ,UPS Ground,2026-08-03,2026-08-08,20,2026-08-07\n";
  const { a } = run(csv);
  assert.deepEqual(a.late.map((l) => l.tracking), ["Q"]);
});

test("late across a federal-only holiday is medium and set apart, and an extra date changes the answer", () => {
  // 2026-10-09 Fri ship, 2 day: Mon 10/12 is Columbus Day (a delivery day on the carrier calendar).
  const csv = H + "H,UPS 2nd Day Air,2026-10-09,2026-10-14,30,,\n";
  const { a } = run(csv);
  const f = a.findings[0];
  assert.equal(f.severity, "medium");
  assert.equal(f.kind, "late-holiday");
  assert.equal(a.summary.refundable, 0);
  assert.equal(a.summary.maybe, 30);
  const fed = run(csv, { holidays: "federal" }).a;
  assert.equal(fed.late.length, 0);
});

test("July 4 is not a delivery day, so a parcel over it is not late", () => {
  const { a } = run(H + "J,UPS Next Day Air,2025-07-03,2025-07-07,50,,\n");
  assert.equal(a.late.length, 0);
});

test("rate drift needs six lines of a service and a real dollar gap", () => {
  const rows = Array.from({ length: 6 }, (_, i) => `D${i},UPS Ground,2026-08-03,2026-08-05,${i === 5 ? 40 : 12},,`).join("\n");
  const { a } = run(H + rows + "\n", { groundDays: 9 });
  const f = a.findings.find((x) => x.kind === "drift");
  assert.equal(f.lines.length, 1);
  assert.equal(f.dollars, 28);
  const few = run(H + rows.split("\n").slice(0, 5).join("\n") + "\n").a;
  assert.ok(!few.findings.some((x) => x.kind === "drift"));
});

test("missing delivery date is counted, not judged", () => {
  const { a } = run(H + "N,UPS Next Day Air,2026-08-03,,50,,\n");
  assert.equal(a.summary.noDelivery, 1);
  assert.equal(a.late.length, 0);
});

test("late rate by service", () => {
  const { a } = run(H + "A,UPS Next Day Air,2026-08-03,2026-08-05,50,,\nB,UPS Next Day Air,2026-08-03,2026-08-04,50,,\n");
  assert.equal(a.byService[0].shipments, 2);
  assert.equal(a.byService[0].late, 1);
  assert.equal(a.byService[0].lateRate, 0.5);
});

test("claim letter lists only claimable shipments and never alleges fault", () => {
  const { a } = run(sampleCsv(), { asOf: d("2026-08-20") });
  const txt = claimLetter(a, { name: "Sam", company: "Acme", account: "A1", carrier: "UPS", date: "2026-08-20" });
  assert.match(txt, /1Z999AA10000000001/);
  assert.doesNotMatch(txt, /1Z999AA10000000009/); // past window
  assert.doesNotMatch(txt, /1Z999AA10000000007/); // weather
  assert.doesNotMatch(txt, /1Z999AA10000000011/); // credited
  assert.match(txt, /appear to have been delivered after/);
  assert.doesNotMatch(txt, /fraud|overcharg|stole/i);
  const none = analyze([], {});
  assert.match(claimLetter(none, {}), /nothing to request/);
});

test("report csv has a header, one row per late shipment and quotes commas", () => {
  const { a } = run(H + '"T,1","UPS Next Day Air",2026-08-03,2026-08-05,48.20,,\n');
  const lines = reportCsv(a).trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"T,1"/);
});

test("the sample yields refundable money and every finding kind it promises", () => {
  const { a } = run(sampleCsv(), { asOf: d("2026-08-20") });
  assert.ok(a.summary.refundable > 100);
  for (const k of ["late", "expired", "excused", "credited", "duplicate", "no-delivery", "unjudged"]) assert.ok(a.findings.some((f) => f.kind === k), k);
});

test("sampleCsv(today) shifts every date, keeps Mondays, and stays claimable", () => {
  const today = d("2026-09-29");
  const csv = sampleCsv(today);
  const { n, a } = run(csv, { asOf: today });
  assert.equal(dayIso(n.records[0].ship).length, 10);
  assert.equal(new Date(n.records[0].ship * 86400000).getUTCDay(), 1);
  assert.ok(a.summary.refundable > 0);
  assert.equal(sampleCsv(), sampleCsv(null));
  assert.ok(a.findings.some((f) => f.kind === "expired"));
});
