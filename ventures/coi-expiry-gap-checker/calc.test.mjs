import { test } from "node:test";
import assert from "node:assert/strict";
import { check, readList, parseCsv, parseDate, parseMoney, normalizeCoverage, sampleList, sampleBrokenList, SAMPLE_AS_OF, findingsCsv, chaseListCsv, expiryCalendar, isoDay } from "./calc.mjs";

const AS_OF = parseDate(SAMPLE_AS_OF);
const HEAD = "Vendor,Coverage,Each occurrence,Aggregate,Effective,Expiration,Additional insured,Waiver of subrogation\n";
const run = (rows, req) => check(HEAD + rows.join("\n"), req, AS_OF);
const titles = (r) => r.findings.map((f) => f.title);

test("dates, money and coverage names are read the way a certificate writes them", () => {
  assert.equal(isoDay(parseDate("10/5/2026")), "2026-10-05");
  assert.equal(isoDay(parseDate("10/05/26")), "2026-10-05");
  assert.ok(Number.isNaN(parseDate("2026-02-30")));
  assert.equal(parseMoney("$1,000,000"), 1000000);
  assert.equal(parseMoney("1M"), 1000000);
  assert.equal(parseMoney("500k"), 500000);
  assert.equal(normalizeCoverage("Commercial General Liability (CGL)"), "GL");
  assert.equal(normalizeCoverage("Excess Liability"), "UMB");
  assert.equal(normalizeCoverage("Workers' Compensation"), "WC");
  assert.equal(normalizeCoverage("Business Automobile"), "AUTO");
});

test("csv parser handles quotes, embedded commas and newlines, and a BOM", () => {
  const rows = parseCsv('﻿a,b\n"x, y","say ""hi"""\n"two\nlines",z\n');
  assert.deepEqual(rows.map((r) => r.cells), [["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
  assert.equal(rows[2].line, 3);
});

test("a vendor with everything in force and endorsed is clear", () => {
  const r = run([
    "Ok Co,General liability,1000000,2000000,2026-01-01,2027-01-01,Yes,Yes",
    "Ok Co,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "Ok Co,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ]);
  assert.equal(r.vendors[0].status, "ok");
  assert.equal(r.findings.length, 0);
});

test("expired, not-yet-effective and missing coverages are errors", () => {
  const r = run([
    "A,General liability,1000000,2000000,2025-01-01,2026-01-01,Yes,Yes",
    "A,Auto,1000000,,2027-01-01,2028-01-01,Yes,Yes",
  ]);
  const t = titles(r).join("|");
  assert.match(t, /general liability: expired 2026-01-01/);
  assert.match(t, /Business auto liability: not in force until 2027-01-01/);
  assert.match(t, /Workers' compensation.*nothing on file/);
  assert.equal(r.vendors[0].status, "fail");
});

test("expiry exactly on the check date is still in force; the lead time boundary is inclusive", () => {
  const today = isoDay(AS_OF), edge = isoDay(AS_OF + 30), beyond = isoDay(AS_OF + 31);
  const r = run([
    `T,General liability,1000000,2000000,2025-01-01,${today},Yes,Yes`,
    `T,Auto,1000000,,2025-01-01,${edge},Yes,Yes`,
    `T,Workers comp,500000,,2025-01-01,${beyond},,Yes`,
  ]);
  const t = titles(r).join("|");
  assert.match(t, /general liability: expires .* \(0 days\)/);
  assert.match(t, /Business auto liability: expires .* \(30 days\)/);
  assert.doesNotMatch(t, /Workers.*expires/);
  assert.equal(r.findings.find((f) => /\(0 days\)/.test(f.title)).severity, "error");
  assert.equal(r.findings.find((f) => /\(30 days\)/.test(f.title)).severity, "warning");
});

test("a limit below the requirement is an error, an umbrella can make it up, and not when disallowed", () => {
  const rows = [
    "U,General liability,500000,1000000,2026-01-01,2027-01-01,Yes,Yes",
    "U,Umbrella,2000000,,2026-01-01,2027-01-01,Yes,Yes",
    "U,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "U,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ];
  const withU = run(rows);
  assert.equal(withU.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(withU.findings.filter((f) => f.severity === "info").length, 2);
  const without = run(rows, { umbrellaCounts: false });
  assert.match(titles(without).join("|"), /each occurrence \$500,000 is below the \$1,000,000 required/);
  assert.match(titles(without).join("|"), /aggregate \$1,000,000 is below the \$2,000,000 required/);
  // an expired umbrella makes up nothing
  const expired = run([rows[0], "U,Umbrella,2000000,,2024-01-01,2025-01-01,Yes,Yes", rows[2], rows[3]]);
  assert.match(titles(expired).join("|"), /each occurrence \$500,000 is below/);
});

test("a blank endorsement is a warning, an explicit no is an error, and workers comp is never asked for additional insured", () => {
  const r = run([
    "E,General liability,1000000,2000000,2026-01-01,2027-01-01,,No",
    "E,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "E,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ]);
  const ai = r.findings.find((f) => /additional insured/.test(f.title));
  const wv = r.findings.find((f) => /waiver/.test(f.title));
  assert.equal(ai.severity, "warning");
  assert.equal(wv.severity, "error");
  assert.equal(r.findings.filter((f) => /additional insured/.test(f.title) && f.coverage === "WC").length, 0);
});

test("a renewal gap is measured in whole days between the two policies", () => {
  const r = run([
    "G,General liability,1000000,2000000,2025-06-01,2026-06-01,Yes,Yes",
    "G,General liability,1000000,2000000,2026-06-20,2027-06-20,Yes,Yes",
    "G,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "G,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
  ]);
  assert.match(titles(r).join("|"), /18-day gap/);
  const contiguous = run([
    "G,General liability,1000000,2000000,2025-06-01,2026-06-01,Yes,Yes",
    "G,General liability,1000000,2000000,2026-06-02,2027-06-20,Yes,Yes",
  ]);
  assert.doesNotMatch(titles(contiguous).join("|"), /gap/);
});

test("a swapped date pair and an unreadable date are errors on the list itself, with line numbers", () => {
  const { findings } = readList(HEAD + "S,General liability,1000000,2000000,2026-10-01,2025-10-01,Yes,Yes\nS,Auto,1M,,01-02-03,2027-01-01,Yes,Yes\n");
  assert.match(findings[0].title, /Expires before it takes effect/);
  assert.equal(findings[0].line, 2);
  assert.match(findings[1].title, /Cannot read the effective date/);
  assert.equal(findings[1].line, 3);
});

test("missing columns and an empty paste say what is needed", () => {
  assert.match(readList("").findings[0].title, /Nothing to read/);
  const f = readList("Vendor,Notes\nA,B\n").findings;
  assert.ok(f.some((x) => /coverage/.test(x.title)));
  assert.ok(f.some((x) => /expiration/.test(x.title)));
});

test("vendors are grouped case-insensitively and listed worst first", () => {
  const r = run([
    "acme,General liability,1000000,2000000,2026-01-01,2027-01-01,Yes,Yes",
    "ACME,Auto,1000000,,2026-01-01,2027-01-01,Yes,Yes",
    "ACME,Workers comp,500000,,2026-01-01,2027-01-01,,Yes",
    "Zed,General liability,1000000,2000000,2026-01-01,2027-01-01,Yes,Yes",
  ]);
  assert.equal(r.summary.vendors, 2);
  assert.equal(r.vendors[0].vendor, "Zed");
  assert.equal(r.vendors[0].status, "fail");
  assert.equal(r.vendors[1].status, "ok");
});

test("exports neutralise spreadsheet formulas and quote commas", () => {
  const r = run(["=cmd|' /C calc'!A0,General liability,1000000,2000000,2025-01-01,2026-01-01,Yes,Yes"]);
  const out = findingsCsv(r);
  assert.ok(!/(^|,)=cmd/.test(out));
  assert.match(out, /'=cmd/);
  assert.match(chaseListCsv(r), /blocking/);
});

test("the calendar has one stable all-day event per policy still to expire, on the first day of the lead time", () => {
  const r = check(sampleList(), {}, AS_OF);
  const ics = expiryCalendar(r, "2026-10-05T00:00:00Z");
  const events = ics.match(/BEGIN:VEVENT/g).length;
  assert.equal(events, r.policies.length);
  assert.match(ics, /DTSTART;VALUE=DATE:20261005/); // Blue Line: 2026-10-20 minus 30 days is before today, so today
  assert.match(ics, /DTSTART;VALUE=DATE:20270130/); // Apex: expires 2027-03-01
  assert.equal(ics, expiryCalendar(r, "2026-10-05T00:00:00Z"));
  assert.match(ics, /\r\n/);
  const none = expiryCalendar(check(HEAD + "X,General liability,1,1,2020-01-01,2020-02-01,Yes,Yes", {}, AS_OF));
  assert.doesNotMatch(none, /VEVENT/);
});

test("both samples behave as the page says", () => {
  const ok = check(sampleList(), {}, AS_OF);
  assert.deepEqual(ok.summary, { vendors: 3, policies: 10, fail: 1, watch: 1, ok: 1 });
  const bad = check(sampleBrokenList(), {}, AS_OF);
  assert.equal(bad.summary.fail, 2);
  assert.match(titles(bad).join("|"), /18-day gap/);
  assert.match(titles(bad).join("|"), /Expires before it takes effect/);
});
