import { test } from "node:test";
import assert from "node:assert/strict";
import { money, decodeBuffer, detectDelimiter, parseCsv, parseDateTime, detectDateOrder, statusOf, normalizeBookings, analyze, reportCsv, summaryText, sampleCsv, hourLabel } from "./calc.mjs";

const HEAD = "Client,Email,Service,Start Time,Status,Price,Created,Cancelled At";
const ROWS = [
  "Ann,ann@x.com,Cut,2026-03-02 10:00,Completed,50,2026-02-20,",
  "Ann,ann@x.com,Cut,2026-03-09 10:00,No Show,50,2026-03-01,",
  "Ann,ann@x.com,Color,2026-03-16 14:00,no-show,100,2026-03-15,",
  "Bob,bob@x.com,Cut,2026-03-03 15:00,Completed,50,2026-03-01,",
  "Bob,bob@x.com,Cut,2026-03-10 15:00,Canceled,50,2026-03-01,2026-03-10 09:00",
  "Cy,cy@x.com,Color,2026-03-04 09:00,Cancelled,100,2026-02-01,2026-03-01 09:00",
  "Dee,dee@x.com,Cut,2026-03-05 16:00,Attended,,2026-03-01,",
  "Eve,eve@x.com,Beard,2026-03-06 17:00,Missed,,2026-02-10,",
  "Fay,fay@x.com,Cut,2026-03-07 11:00,Booked,50,,",
  "Gus,gus@x.com,Cut,2026-03-08 11:00,Cancelled by business,50,,",
  "Ann,ann@x.com,Cut,2026-03-09 10:00,No Show,50,2026-03-01,",
  "Hal,hal@x.com,Cut,2026-03-11 10:00,Weird status,50,,",
  "Ian,ian@x.com,Cut,not a date,Completed,50,,",
];
const CSV = [HEAD, ...ROWS].join("\n");
const load = (text, o) => { const d = detectDelimiter(text); return normalizeBookings(parseCsv(text, d), { decimalComma: d === ";", ...o }); };
const OPTS = { noticeHours: 24, defaultPrice: 30, feePct: 25, preventPct: 40, collectPct: 100 };

test("money formats with thousands separators and two places", () => {
  assert.equal(money(1234567.891), "1,234,567.89");
  assert.equal(money(0), "0.00");
  assert.equal(money(-5.5), "-5.50");
});

test("statusOf reads the aliases of each outcome", () => {
  for (const t of ["No Show", "no-show", "noshow", "NO_SHOW", "Missed", "Did not attend", "Did Not Show", "DNA", "No-Show (client)"]) assert.equal(statusOf(t), "noshow", t);
  for (const t of ["Cancelled", "Canceled", "cancelled by client", "Canceled by customer", "Late Cancel"]) assert.equal(statusOf(t), "cancelled", t);
  for (const t of ["Completed", "attended", "Checked Out", "Checked-In", "Showed", "Done", "Paid"]) assert.equal(statusOf(t), "completed", t);
  for (const t of ["Cancelled by business", "Canceled by staff", "Cancelled by provider"]) assert.equal(statusOf(t), "provider", t);
  for (const t of ["Booked", "Confirmed", "Pending", "Scheduled"]) assert.equal(statusOf(t), "open", t);
  assert.equal(statusOf("Banana"), null);
  assert.equal(statusOf(""), null);
});

test("parseCsv handles quotes, escaped quotes, embedded newlines, CRLF, BOM and blank lines", () => {
  const { rows, lines } = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3', ",");
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "two\nlines"], ["1", "2", "3"]]);
  assert.deepEqual(lines, [1, 2, 5]);
});

test("detectDelimiter picks comma, semicolon, tab or pipe, ignoring quoted commas", () => {
  assert.equal(detectDelimiter("a,b,c"), ",");
  assert.equal(detectDelimiter("a;b;c,d"), ";");
  assert.equal(detectDelimiter("a\tb\tc"), "\t");
  assert.equal(detectDelimiter('"a,b,c,d";e;f'), ";");
  assert.equal(detectDelimiter("a|b|c"), "|");
});

test("decodeBuffer strips a UTF-8 BOM and reads UTF-16", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62])), "a,b");
  assert.equal(decodeBuffer(new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x2c, 0x00])), "a,");
  assert.equal(decodeBuffer(new Uint8Array([0xfe, 0xff, 0x00, 0x61, 0x00, 0x2c])), "a,");
});

test("parseDateTime reads ISO, US, 12-hour, month-name and offset forms as wall-clock time", () => {
  const at = (s, o) => { const r = parseDateTime(s, o); return r && new Date(r.ms).toISOString().slice(0, 16) + (r.hasTime ? "" : "!date-only"); };
  assert.equal(at("2026-03-04"), "2026-03-04T00:00!date-only");
  assert.equal(at("2026-03-04 14:30"), "2026-03-04T14:30");
  assert.equal(at("2026-03-04T14:30:00Z"), "2026-03-04T14:30");
  assert.equal(at("2026-03-04T14:30:00-05:00"), "2026-03-04T14:30");
  assert.equal(at("3/4/2026"), "2026-03-04T00:00!date-only");
  assert.equal(at("3/4/2026 2:30 PM"), "2026-03-04T14:30");
  assert.equal(at("3/4/26 2:30pm"), "2026-03-04T14:30");
  assert.equal(at("03/04/2026 12:00 AM"), "2026-03-04T00:00");
  assert.equal(at("03/04/2026 12:15 PM"), "2026-03-04T12:15");
  assert.equal(at("3/4/2026 9 AM"), "2026-03-04T09:00");
  assert.equal(at("3/4/2026 5 p.m."), "2026-03-04T17:00");
  assert.equal(at("Tue, Mar 4, 2026 9:15 AM"), "2026-03-04T09:15");
  assert.equal(at("4 March 2026 6:00 pm"), "2026-03-04T18:00");
  assert.equal(at("13/04/2026 09:05", "dmy"), "2026-04-13T09:05");
  assert.equal(at("4/3/2026", "dmy"), "2026-03-04T00:00!date-only");
});

test("parseDateTime rejects nonsense and impossible dates", () => {
  for (const bad of ["", "soon", "2026-02-30", "13/13/2026", "2026-03-04 25:00", "3/4/2026 13:00 PM", "Foo 4, 2026"]) assert.equal(parseDateTime(bad), null, bad);
  assert.equal(parseDateTime(null), null);
});

test("detectDateOrder infers day-first, month-first, and flags ambiguity", () => {
  assert.deepEqual(detectDateOrder(["13/04/2026", "01/05/2026"]), { order: "dmy", ambiguous: false });
  assert.deepEqual(detectDateOrder(["04/13/2026", "01/05/2026"]), { order: "mdy", ambiguous: false });
  assert.deepEqual(detectDateOrder(["04/05/2026", "01/02/2026"]), { order: "mdy", ambiguous: true });
  assert.deepEqual(detectDateOrder(["2026-04-05"]), { order: "mdy", ambiguous: false });
});

test("normalizeBookings reads the export, skips bad rows with reasons and drops duplicates", () => {
  const n = load(CSV);
  assert.equal(n.error, undefined);
  assert.equal(n.records.length, 10);
  assert.equal(n.duplicates, 1);
  assert.equal(n.skipped.length, 3);
  assert.deepEqual(n.skipped.map((s) => s.line), [12, 13, 14]);
  assert.match(n.skipped[0].reason, /duplicate/);
  assert.match(n.skipped[1].reason, /Weird status.*not recognised/);
  assert.match(n.skipped[2].reason, /not a date.*not readable/);
  assert.equal(n.hasTime, true);
  assert.equal(n.hasPrice, true);
  assert.equal(n.hasCreated, true);
  assert.equal(n.hasCancelledAt, true);
  assert.equal(n.columns.status, "Status");
});

test("analyze: headline rates, revenue lost and the base of the rates", () => {
  const a = analyze(load(CSV).records, OPTS);
  const s = a.summary;
  assert.equal(s.bookings, 8);
  assert.equal(s.completed, 3);
  assert.equal(s.noShows, 3);
  assert.equal(s.cancelled, 2);
  assert.equal(s.lateCancels, 1);
  assert.equal(s.earlyCancels, 1);
  assert.equal(s.providerCancelled, 1);
  assert.equal(s.open, 1);
  assert.equal(s.noShowRate, 37.5);
  assert.equal(s.lateCancelRate, 12.5);
  assert.equal(s.lostRevenue, 180);
  assert.equal(s.lateCancelRevenue, 50);
  assert.equal(s.unfilledRate, 50);
  assert.deepEqual(s.priceSources, { file: 6, "service average": 1, placeholder: 1 });
  assert.equal(s.spanDays, 15);
  assert.equal(s.firstDay, "2026-03-02");
  assert.equal(s.lastDay, "2026-03-16");
});

test("analyze: the notice window decides what counts as a late cancel", () => {
  const recs = load(CSV).records;
  assert.equal(analyze(recs, { ...OPTS, noticeHours: 4 }).summary.lateCancels, 0);
  assert.equal(analyze(recs, { ...OPTS, noticeHours: 6 }).summary.lateCancels, 0);
  assert.equal(analyze(recs, { ...OPTS, noticeHours: 7 }).summary.lateCancels, 1);
  const wide = analyze(recs, { ...OPTS, noticeHours: 100 }).summary;
  assert.equal(wide.lateCancels, 2);
  assert.equal(wide.lateCancelRevenue, 150);
});

test("analyze: by weekday, Monday first, only weekdays that occur", () => {
  const a = analyze(load(CSV).records, OPTS);
  assert.deepEqual(a.byWeekday.map((r) => r.label), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const mon = a.byWeekday[0];
  assert.equal(mon.bookings, 3);
  assert.equal(mon.noShows, 2);
  assert.equal(mon.lostRevenue, 150);
  assert.ok(Math.abs(mon.noShowRate - 66.6667) < 0.001);
  assert.equal(a.byWeekday[1].lateCancels, 1);
  assert.equal(a.byWeekday[4].lostRevenue, 30);
});

test("analyze: by hour of day", () => {
  const a = analyze(load(CSV).records, OPTS);
  assert.deepEqual(a.byHour.map((r) => r.label), ["9 AM", "10 AM", "2 PM", "3 PM", "4 PM", "5 PM"]);
  assert.equal(a.byHour[1].bookings, 2);
  assert.equal(a.byHour[1].noShows, 1);
  assert.equal(a.byHour[3].lateCancels, 1);
  assert.equal(hourLabel(0), "12 AM");
  assert.equal(hourLabel(12), "12 PM");
});

test("analyze: by service sorted by revenue lost, with service-average and placeholder prices", () => {
  const a = analyze(load(CSV).records, OPTS);
  assert.deepEqual(a.byService.map((r) => [r.label, r.bookings, r.noShows, r.lostRevenue]), [["Color", 2, 1, 100], ["Cut", 5, 1, 50], ["Beard", 1, 1, 30]]);
  const priced = analyze(load(CSV).records, { ...OPTS, defaultPrice: 45 });
  assert.equal(priced.byService.find((r) => r.label === "Beard").lostRevenue, 45);
});

test("analyze: by lead time from the booked-on column", () => {
  const a = analyze(load(CSV).records, OPTS);
  assert.deepEqual(a.byLead.map((r) => [r.label, r.bookings, r.noShows]), [["Under 2 days", 1, 1], ["2 to 14 days", 5, 1], ["Over 14 days", 2, 1]]);
});

test("analyze: repeat offenders need the minimum no-shows and carry lost dollars", () => {
  const a = analyze(load(CSV).records, OPTS);
  assert.equal(a.offenders.length, 1);
  assert.deepEqual([a.offenders[0].client, a.offenders[0].noShows, a.offenders[0].bookings, a.offenders[0].lostRevenue], ["Ann", 2, 3, 150]);
  assert.equal(a.offenderNoShows, 2);
  assert.equal(a.offenderLost, 150);
  assert.equal(analyze(load(CSV).records, { ...OPTS, minNoShows: 1 }).offenders.length, 2);
  assert.equal(analyze(load(CSV).records, { ...OPTS, minNoShows: 3 }).offenders.length, 0);
});

test("analyze: deposit what-if is the prevented visits plus fees on the rest, from typed assumptions", () => {
  const a = analyze(load(CSV).records, OPTS);
  const w = a.whatIf;
  // (180 + 50) lost at risk: 40% prevented -> 92 of visits kept; 60% remain and 25% of their price is charged -> 34.50.
  assert.equal(w.recoveredVisits, 92);
  assert.equal(w.feesCollected, 34.5);
  assert.equal(w.total, 126.5);
  assert.equal(w.perYear, null);
  assert.equal(w.noShowsPrevented, 1.2);
  assert.ok(Math.abs(w.shareOfLost - 55) < 1e-9);
  assert.equal(analyze(load(CSV).records, { ...OPTS, collectPct: 50 }).whatIf.feesCollected, 17.25);
  assert.equal(analyze(load(CSV).records, { ...OPTS, preventPct: 0, feePct: 0 }).whatIf.total, 0);
  assert.equal(analyze(load(CSV).records, { ...OPTS, preventPct: 100 }).whatIf.total, 230);
});

test("analyze: a period of four weeks or more is annualised", () => {
  const long = CSV + "\nZed,zed@x.com,Cut,2026-05-04 10:00,Completed,50,2026-05-01,";
  const a = analyze(load(long).records, OPTS);
  assert.equal(a.summary.spanDays, 64);
  assert.equal(a.whatIf.perYear, Math.round(((126.5 * 365) / 64) * 100) / 100);
});

test("analyze: findings name the worst weekday and hour, ignore tiny samples, and flag placeholders", () => {
  const a = analyze(load(CSV).records, OPTS);
  // no weekday or hour has 5 bookings, so no "worst" claim is made from one or two rows
  assert.equal(a.findings.some((f) => /highest no-show rate/.test(f.title)), false);
  assert.ok(a.findings.some((f) => /1 client\(s\) with 2\+ no-shows account for 2 of 3/.test(f.title)));
  assert.ok(a.findings.some((f) => /1 booking\(s\) use the \$30\.00 placeholder price/.test(f.title)));
  assert.ok(a.byWeekday[0].lowSample);
});

test("analyze: a large sample names the worst weekday", () => {
  const lines = [HEAD];
  for (let i = 0; i < 12; i++) lines.push(`C${i},c${i}@x.com,Cut,2026-03-${String(2 + 7 * (i % 3)).padStart(2, "0")} 10:00,${i < 6 ? "No Show" : "Completed"},50,2026-02-20,`);
  for (let i = 0; i < 12; i++) lines.push(`D${i},d${i}@x.com,Cut,2026-03-${String(3 + 7 * (i % 3)).padStart(2, "0")} 10:00,${i < 1 ? "No Show" : "Completed"},50,2026-02-20,`);
  const a = analyze(load(lines.join("\n")).records, OPTS);
  const f = a.findings.find((x) => /Mondays have the highest/.test(x.title));
  assert.ok(f, JSON.stringify(a.findings.map((x) => x.title)));
  assert.match(f.detail, /50\.0% of 12/);
});

test("no price column: every booking uses the typed placeholder and is flagged", () => {
  const text = "Customer,Start,Status\nAnn,2026-03-02 10:00,No Show\nBob,2026-03-03 10:00,Completed";
  const n = load(text);
  assert.equal(n.hasPrice, false);
  const a = analyze(n.records, { ...OPTS, defaultPrice: 70 });
  assert.equal(a.summary.lostRevenue, 70);
  assert.deepEqual(a.summary.priceSources, { file: 0, "service average": 0, placeholder: 2 });
  assert.ok(a.findings.some((f) => /2 booking\(s\) use the \$70\.00 placeholder/.test(f.title)));
  assert.match(summaryText(a), /placeholder price of \$70\.00/);
});

test("no created column means no lead-time table; no cancelled-at means cancels of unknown notice", () => {
  const text = "Client,Start Time,Status,Price\nAnn,2026-03-02 10:00,Cancelled,50\nBob,2026-03-03 10:00,Completed,50";
  const a = analyze(load(text).records, OPTS);
  assert.deepEqual(a.byLead, []);
  assert.equal(a.summary.cancelled, 1);
  assert.equal(a.summary.cancelledUnknown, 1);
  assert.equal(a.summary.lateCancels, 0);
  assert.ok(a.findings.some((f) => /Late cancellations cannot be told apart/.test(f.title)));
  assert.ok(a.findings.some((f) => /booked-on column/i.test(f.title)));
});

test("separate Date and Time columns, first and last name columns, 12-hour times", () => {
  const text = "First Name,Last Name,Date,Time,Appointment Type,Status\nAva,Lee,3/2/2026,2:30 PM,Massage,Completed\nAva,Lee,3/9/2026,2:30 PM,Massage,No Show";
  const n = load(text);
  assert.equal(n.error, undefined);
  assert.equal(n.columns.time, "Time");
  assert.equal(n.records[0].client, "Ava Lee");
  assert.equal(n.records[0].hour, 14);
  assert.equal(n.records[1].service, "Massage");
  assert.equal(n.hasTime, true);
});

test("a Start Time column that holds only clock times pairs with the date column", () => {
  const text = "Date,Start Time,Client,Status\n2026-03-02,10:00 AM,Ann,Completed\n2026-03-03,3:15 PM,Bob,No Show";
  const n = load(text);
  assert.equal(n.columns.start, "Date");
  assert.deepEqual(n.records.map((r) => r.hour), [10, 15]);
});

test("date-only exports (and 00:00 timestamps) give no hour-of-day table", () => {
  for (const d of ["3/2/2026", "2026-03-02 00:00:00"]) {
    const a = analyze(load(`Client,Date,Status\nAnn,${d},No Show\nBob,${d},Completed`).records, OPTS);
    assert.deepEqual(a.byHour, []);
    assert.equal(a.summary.hasTime, false);
    assert.ok(a.findings.some((f) => /No appointment times/.test(f.title)));
  }
});

test("day-first dates are detected from the data and can be forced", () => {
  const text = "Client,Date,Status\nAnn,13/03/2026,Completed\nBob,05/03/2026,No Show";
  const n = load(text);
  assert.equal(n.dateOrder, "dmy");
  assert.equal(new Date(n.records[1].start).toISOString().slice(0, 10), "2026-03-05");
  const amb = load("Client,Date,Status\nAnn,01/02/2026,Completed");
  assert.equal(amb.ambiguousDates, true);
  assert.equal(new Date(amb.records[0].start).toISOString().slice(0, 10), "2026-01-02");
  assert.equal(new Date(load("Client,Date,Status\nAnn,01/02/2026,Completed", { dateOrder: "dmy" }).records[0].start).toISOString().slice(0, 10), "2026-02-01");
});

test("quoted fields, BOM, semicolons with decimal commas and currency symbols", () => {
  const text = '﻿Client;Service;Start;Status;Price\n"Lee; Ann";"Cut, wash";2026-03-02 10:00;No Show;"$1.250,50"\nBob;Cut;2026-03-03 10:00;Completed;45,00';
  const n = load(text);
  assert.equal(n.error, undefined);
  assert.equal(n.records[0].client, "Lee; Ann");
  assert.equal(n.records[0].service, "Cut, wash");
  assert.equal(n.records[0].price, 1250.5);
  assert.equal(n.records[1].price, 45);
  const us = load("Client,Service,Start,Status,Price\nAnn,Cut,2026-03-02 10:00,No Show,\"$1,250.50\"\nBob,Cut,2026-03-03 10:00,Completed,(5)\nCy,Cut,2026-03-04 10:00,Completed,Free");
  assert.equal(us.records[0].price, 1250.5);
  assert.equal(us.records[1].price, null);
  assert.equal(us.records[2].price, 0);
});

test("duplicates are matched by booking id when present, else by the whole row", () => {
  const withId = load("ID,Client,Start,Status\n1,Ann,2026-03-02 10:00,No Show\n1,Ann,2026-03-02 10:00,No Show\n2,Ann,2026-03-02 10:00,No Show");
  assert.equal(withId.records.length, 2);
  assert.equal(withId.duplicates, 1);
  const noId = load("Client,Start,Status\nAnn,2026-03-02 10:00,No Show\nAnn,2026-03-02 10:00,No Show\nAnn,2026-03-02 11:00,No Show");
  assert.equal(noId.records.length, 2);
  assert.equal(noId.duplicates, 1);
});

test("clients are matched by email first, then by name ignoring case and spacing", () => {
  const text = "Client,Email,Start,Status,Price\nAnn Lee,a@x.com,2026-03-02 10:00,No Show,10\nA. Lee,A@X.com,2026-03-03 10:00,No Show,10\nBo  Ray,,2026-03-04 10:00,No Show,10\nbo ray,,2026-03-05 10:00,No Show,10\n,,2026-03-06 10:00,No Show,10\n,,2026-03-07 10:00,No Show,10";
  const a = analyze(load(text).records, OPTS);
  assert.deepEqual(a.offenders.map((o) => [o.client, o.noShows]), [["Ann Lee", 2], ["Bo Ray", 2]]);
  assert.equal(a.summary.noShows, 6);
});

test("errors: empty file, missing status or date columns, nothing usable", () => {
  assert.match(load("").error, /empty/);
  assert.match(load("Client,Price\nAnn,5").error, /No header row/);
  assert.match(load("Client,Status\nAnn,No Show").error, /No header row/);
  assert.match(load("Client,Start,Status\nAnn,someday,No Show").error, /No usable booking rows/);
});

test("the header need not be the first row", () => {
  const n = load("Bookings report,,\nGenerated 3/20/2026,,\nClient,Start,Status\nAnn,2026-03-02 10:00,No Show");
  assert.equal(n.records.length, 1);
  assert.equal(n.skipped.length, 0);
});

test("invalid option values are rejected rather than computed", () => {
  const recs = load(CSV).records;
  assert.match(analyze(recs, { ...OPTS, feePct: 101 }).invalid, /fee percentage/);
  assert.match(analyze(recs, { ...OPTS, preventPct: -1 }).invalid, /prevented no-shows/);
  assert.match(analyze(recs, { ...OPTS, collectPct: NaN }).invalid, /collected/);
  assert.match(analyze(recs, { ...OPTS, defaultPrice: -3 }).invalid, /default price/);
  assert.match(analyze(recs, { ...OPTS, noticeHours: -1 }).invalid, /notice window/);
  assert.match(analyze(recs, { ...OPTS, minNoShows: 0 }).invalid, /at least 1/);
  assert.match(analyze([], OPTS).invalid, /no bookings/);
});

test("a file with no no-shows says so instead of reporting a zero as a finding of fact", () => {
  const a = analyze(load("Client,Start,Status\nAnn,2026-03-02 10:00,Completed").records, OPTS);
  assert.equal(a.summary.noShows, 0);
  assert.equal(a.summary.noShowRate, 0);
  assert.ok(a.findings.some((f) => /No no-shows in this file/.test(f.title)));
});

test("reportCsv has every group, CRLF line ends, and neutralises spreadsheet formulas in names", () => {
  const text = "Client,Start,Status,Price\n=HYPERLINK(\"http://x\"),2026-03-02 10:00,No Show,10\n=HYPERLINK(\"http://x\"),2026-03-03 10:00,No Show,10";
  const csv = reportCsv(analyze(load(text).records, OPTS));
  assert.ok(csv.endsWith("\r\n"));
  assert.match(csv.split("\r\n")[0], /^Group,Bucket,Bookings/);
  assert.match(csv, /Overall,All bookings,2,2,100\.0/);
  assert.match(csv, /Weekday,Monday/);
  assert.match(csv, /Hour,10 AM/);
  assert.match(csv, /Repeat offender,"'=HYPERLINK/);
  const full = reportCsv(analyze(load(CSV).records, OPTS));
  for (const g of ["Service,Color", "Lead time,Under 2 days", "Repeat offender,Ann"]) assert.ok(full.includes(g), g);
});

test("summaryText states the counts, the assumptions and that the what-if is not a forecast", () => {
  const t = summaryText(analyze(load(CSV).records, OPTS));
  assert.match(t, /8 bookings counted: 3 attended, 3 no-shows \(37\.5%\)/);
  assert.match(t, /1 late \(12\.5%, under 24 h notice\)/);
  assert.match(t, /Revenue lost to no-shows: \$180\.00/);
  assert.match(t, /Repeat offenders \(2\+ no-shows\): 1, \$150\.00 lost/);
  assert.match(t, /your assumptions, not a forecast.*\$126\.50/);
});

test("the sample data loads, has repeat offenders and every table, and is stable", () => {
  const n = load(sampleCsv());
  assert.equal(n.error, undefined);
  assert.equal(n.skipped.length, 0);
  const a = analyze(n.records, { ...OPTS, defaultPrice: 60 });
  assert.ok(a.summary.noShows > 10);
  assert.ok(a.offenders.length >= 1);
  assert.ok(a.summary.lateCancels >= 1 && a.summary.earlyCancels >= 1);
  assert.ok(a.byHour.length >= 4 && a.byLead.length === 3 && a.byService.length === 4);
  assert.ok(a.whatIf.perYear > 0);
  assert.equal(sampleCsv(), sampleCsv());
});

test("results do not depend on the machine time zone", () => {
  const r = parseDateTime("2026-03-08 02:30");
  assert.equal(r.ms, Date.UTC(2026, 2, 8, 2, 30));
});

test("reconciles: weekday and service rows add up to the counted bookings and the lost revenue", () => {
  for (const text of [CSV, sampleCsv()]) {
    const a = analyze(load(text).records, { ...OPTS, defaultPrice: 60 });
    for (const rows of [a.byWeekday, a.byService, a.byHour]) {
      assert.equal(rows.reduce((t, r) => t + r.bookings, 0), a.summary.bookings);
      assert.equal(rows.reduce((t, r) => t + r.noShows, 0), a.summary.noShows);
      assert.equal(Math.round(rows.reduce((t, r) => t + r.lostRevenue, 0) * 100) / 100, a.summary.lostRevenue);
    }
  }
});
