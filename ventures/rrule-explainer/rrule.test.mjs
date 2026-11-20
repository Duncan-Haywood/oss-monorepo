import { test } from "node:test";
import assert from "node:assert/strict";
import { csvSafe, dayNumber, civil, weekday, weekOf, parseRule, parseInput, expand, analyze, wallToInstant, describe, reportCsv } from "./rrule.mjs";

const dates = (text, opts = {}) => {
  const r = analyze({ text, limit: 40, ...opts });
  return r.occurrences.map((o) => o.date);
};
const codes = (text, opts = {}) => analyze({ text, ...opts }).findings.map((f) => f.code);

test("calendar arithmetic agrees with the JavaScript Date over 1600-2600", () => {
  for (let n = dayNumber(1600, 1, 1); n <= dayNumber(2600, 12, 31); n += 13) {
    const d = new Date(n * 86400000);
    const c = civil(n);
    assert.deepEqual([c.y, c.m, c.d], [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]);
    assert.equal(dayNumber(c.y, c.m, c.d), n);
    assert.equal(weekday(n), (d.getUTCDay() + 6) % 7);
  }
});

test("weekOf with WKST=MO is the ISO 8601 week", () => {
  // ISO week: the week holding the Thursday decides the year.
  for (let n = dayNumber(1990, 1, 1); n <= dayNumber(2040, 12, 31); n += 3) {
    const thu = n - weekday(n) + 3;
    const y = civil(thu).y;
    const want = Math.floor((thu - dayNumber(y, 1, 1)) / 7) + 1;
    const w = weekOf(n, 0);
    assert.equal(w.weekYear, y);
    assert.equal(w.week, want);
  }
  assert.equal(weekOf(dayNumber(2027, 1, 1), 0).week, 53); // 2026 starts on a Thursday, so it has 53 ISO weeks
  assert.equal(weekOf(dayNumber(2027, 1, 1), 0).weeks, 53);
});

test("monthly on the 31st skips short months, and the suggested fix fires every month", () => {
  const got = dates("DTSTART:20260131T090000\nRRULE:FREQ=MONTHLY;COUNT=7");
  assert.deepEqual(got.map((d) => d.slice(5, 7)), ["01", "03", "05", "07", "08", "10", "12"]);
  const r = analyze({ text: "DTSTART:20260131T090000\nRRULE:FREQ=MONTHLY;COUNT=12" });
  const f = r.findings.find((x) => x.code === "skips-short-months");
  assert.ok(f && f.fix, "finding with a fix");
  assert.equal(f.fix, "FREQ=MONTHLY;COUNT=12;BYMONTHDAY=-1");
  const fixed = dates(`DTSTART:20260131T090000\nRRULE:${f.fix}`);
  assert.deepEqual(fixed.map((d) => d.slice(0, 10)), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31"]);
});

test("the 30th, or the last day of a shorter month; and US Thanksgiving (the page's examples)", () => {
  assert.deepEqual(dates("DTSTART:20260130T090000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1;COUNT=3"), ["2026-01-30 09:00", "2026-02-28 09:00", "2026-03-30 09:00"]);
  assert.deepEqual(dates("DTSTART:20261126T120000\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=3"), ["2026-11-26 12:00", "2027-11-25 12:00", "2028-11-23 12:00"]);
  const f = analyze({ text: "DTSTART:20260130T090000\nRRULE:FREQ=MONTHLY" }).findings.find((x) => x.code === "skips-short-months");
  assert.equal(f.fix, "FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1");
});

test("last weekday of the month with BYSETPOS=-1", () => {
  const got = dates("DTSTART:20260130T170000\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=4");
  assert.deepEqual(got, ["2026-01-30 17:00", "2026-02-27 17:00", "2026-03-31 17:00", "2026-04-30 17:00"]);
});

test("ordinal weekdays: 2nd Tuesday, last Friday, 20th Monday of the year", () => {
  assert.deepEqual(dates("DTSTART:20260113T100000\nRRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3"), ["2026-01-13 10:00", "2026-02-10 10:00", "2026-03-10 10:00"]);
  assert.deepEqual(dates("DTSTART:20260130T100000\nRRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=3"), ["2026-01-30 10:00", "2026-02-27 10:00", "2026-03-27 10:00"]);
  // 2026-01-05 is the first Monday; the 20th is 19 weeks later.
  assert.deepEqual(dates("DTSTART:20260101T080000\nRRULE:FREQ=YEARLY;BYDAY=20MO;COUNT=2", { dtstartMode: "rule" }), ["2026-05-18 08:00", "2027-05-17 08:00"]);
});

test("DTSTART outside the rule: RFC counts it as the first of COUNT, the dateutil flavour leaves it out", () => {
  const text = "DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3"; // 2026-01-05 is a Monday
  assert.deepEqual(dates(text), ["2026-01-05 09:00", "2026-01-06 09:00", "2026-01-13 09:00"]);
  assert.deepEqual(dates(text, { dtstartMode: "rule" }), ["2026-01-06 09:00", "2026-01-13 09:00", "2026-01-20 09:00"]);
  assert.ok(codes(text).includes("dtstart-not-in-rule"));
  assert.ok(!codes("DTSTART:20260106T090000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3").includes("dtstart-not-in-rule"));
});

test("WKST changes an every-other-week rule (the RFC 5545 WKST example)", () => {
  const mo = dates("DTSTART:19970805T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO");
  const su = dates("DTSTART:19970805T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU");
  assert.deepEqual(mo.map((d) => d.slice(8, 10)), ["05", "10", "19", "24"]);
  assert.deepEqual(su.map((d) => d.slice(8, 10)), ["05", "17", "19", "31"]);
  assert.ok(codes("DTSTART:19970805T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU").includes("wkst-matters"));
});

test("time zones: a skipped 02:30 uses the offset before the gap; a repeated 01:30 is the first", () => {
  // US clocks: 2026-03-08 02:00 EST jumps to 03:00 EDT; 2026-11-01 02:00 EDT falls back to 01:00 EST.
  const gap = wallToInstant(dayNumber(2026, 3, 8), 2.5 * 3600, "America/New_York");
  assert.equal(gap.kind, "gap");
  assert.equal(new Date(gap.t * 1000).toISOString(), "2026-03-08T07:30:00.000Z"); // 02:30 at -05:00 = 03:30 EDT
  const ov = wallToInstant(dayNumber(2026, 11, 1), 1.5 * 3600, "America/New_York");
  assert.equal(ov.kind, "overlap");
  assert.equal(new Date(ov.t * 1000).toISOString(), "2026-11-01T05:30:00.000Z"); // the EDT one
  const r = analyze({ text: "DTSTART;TZID=America/New_York:20260306T023000\nRRULE:FREQ=DAILY;COUNT=4" });
  const g = r.occurrences.find((o) => o.zone === "gap");
  assert.equal(g.date, "2026-03-08 02:30");
  assert.equal(g.actualLocal, "2026-03-08 03:30");
  assert.ok(r.findings.some((f) => f.code === "dst-gap"));
  const e = analyze({ text: "DTSTART;TZID=Europe/Berlin:20260327T090000\nRRULE:FREQ=DAILY;COUNT=3" });
  assert.deepEqual(e.occurrences.map((o) => o.utc), ["2026-03-27T08:00:00Z", "2026-03-28T08:00:00Z", "2026-03-29T07:00:00Z"]);
});

test("UNTIL in UTC with a zoned start is inclusive, compared as instants", () => {
  // 09:00 New York in January is 14:00Z.
  assert.equal(dates("DTSTART;TZID=America/New_York:20260105T090000\nRRULE:FREQ=DAILY;UNTIL=20260107T140000Z").length, 3);
  assert.equal(dates("DTSTART;TZID=America/New_York:20260105T090000\nRRULE:FREQ=DAILY;UNTIL=20260107T135959Z").length, 2);
});

test("EXDATE removes, RDATE adds, and a set has no duplicates", () => {
  const got = dates("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;COUNT=4\nEXDATE:20260106T090000\nRDATE:20260105T090000,20260110T090000");
  assert.deepEqual(got, ["2026-01-05 09:00", "2026-01-07 09:00", "2026-01-08 09:00", "2026-01-10 09:00"]);
  const allDay = dates("DTSTART;VALUE=DATE:20260105\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;VALUE=DATE:20260106");
  assert.deepEqual(allDay, ["2026-01-05", "2026-01-07"]);
});

test("rules that never fire are reported, not looped on", () => {
  const t0 = Date.now();
  const r = analyze({ text: "DTSTART:20260101T090000\nRRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30" });
  assert.ok(Date.now() - t0 < 3000);
  assert.ok(r.findings.some((f) => f.code === "never"));
  assert.deepEqual(r.occurrences.map((o) => o.source), ["dtstart"]);
  // Feb 29 on a Monday is rare, not impossible.
  assert.deepEqual(dates("DTSTART:20260101T090000\nRRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;BYDAY=MO;COUNT=3", { dtstartMode: "rule" }), ["2044-02-29 09:00", "2072-02-29 09:00", "2112-02-29 09:00"]);
});

test("sub-daily rules step from DTSTART and skip filtered days quickly", () => {
  assert.deepEqual(dates("DTSTART:20260101T090000\nRRULE:FREQ=HOURLY;INTERVAL=5;BYHOUR=9,10;COUNT=4"), ["2026-01-01 09:00", "2026-01-02 10:00", "2026-01-06 09:00", "2026-01-07 10:00"]);
  assert.deepEqual(dates("DTSTART:20260105T090000\nRRULE:FREQ=MINUTELY;INTERVAL=20;BYHOUR=9;BYDAY=MO;COUNT=4"), ["2026-01-05 09:00", "2026-01-05 09:20", "2026-01-05 09:40", "2026-01-12 09:00"]);
});

test("parse errors and RFC restrictions become findings", () => {
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:BYDAY=MO").includes("no-freq"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=MONDAY").includes("bad-value"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYMONTHDAY=5").includes("forbidden-part"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=2MO").includes("forbidden-part"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=MONTHLY;BYWEEKNO=3").includes("forbidden-part"));
  // YEARLY may take BYWEEKNO, but not with an ordinal BYDAY (RFC 5545 3.3.10);
  // a plain BYDAY there is fine.
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=YEARLY;BYWEEKNO=20;BYDAY=1MO").includes("forbidden-part"));
  assert.ok(!codes("DTSTART:20260105T090000\nRRULE:FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO").includes("forbidden-part"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=MONTHLY;BYSETPOS=1").includes("setpos-alone"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;COUNT=3;UNTIL=20260201T000000").includes("count-and-until"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;UNTIL=20260201").includes("until-type"));
  // The hint names the exact replacement value a user can paste.
  assert.match(analyze({ text: "DTSTART:20260105T090000\nRRULE:FREQ=DAILY;UNTIL=20260201" }).findings.find((f) => f.code === "until-type").detail, /write UNTIL=20260201T235959 instead\.$/);
  assert.ok(codes("DTSTART;TZID=Europe/Paris:20260105T090000\nRRULE:FREQ=DAILY;UNTIL=20260201T090000").includes("until-not-utc"));
  assert.ok(codes("DTSTART;TZID=Mars/Olympus:20260105T090000\nRRULE:FREQ=DAILY;COUNT=2").includes("bad-tzid"));
  assert.ok(codes("DTSTART;VALUE=DATE:20260105\nRRULE:FREQ=HOURLY;COUNT=2").includes("subdaily-on-date"));
  assert.ok(codes("FREQ=DAILY").includes("no-dtstart"));
  assert.ok(codes("DTSTART:20260105T090000\nEXRULE:FREQ=DAILY\nRRULE:FREQ=DAILY;COUNT=2").includes("exrule"));
  assert.equal(parseRule("FREQ=DAILY;COUNT=0").rule.count, null);
});

test("a bare rule takes its start from the dtstart field", () => {
  const r = analyze({ text: "FREQ=WEEKLY;BYDAY=MO;COUNT=2", dtstart: "2026-01-05 09:00" });
  assert.deepEqual(r.occurrences.map((o) => o.date), ["2026-01-05 09:00", "2026-01-12 09:00"]);
  const z = analyze({ text: "FREQ=DAILY;COUNT=1", dtstart: "2026-07-01 09:00", tzid: "Europe/Paris" });
  assert.equal(z.occurrences[0].utc, "2026-07-01T07:00:00Z");
});

test("'show from' lists later dates without changing COUNT", () => {
  const r = analyze({ text: "DTSTART:20260101T090000\nRRULE:FREQ=MONTHLY;COUNT=12", after: "2026-10-01" });
  assert.deepEqual(r.occurrences.map((o) => o.date.slice(0, 7)), ["2026-10", "2026-11", "2026-12"]);
  assert.equal(r.skippedBefore, 9);
});

test("English description reads the rule", () => {
  const p = parseInput("DTSTART:20260105T090000");
  assert.equal(describe(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10").rule, p.dtstart), "Every 2 weeks on Monday and Wednesday at 09:00 (floating local time), starting 2026-01-05 09:00, 10 times in all.");
  assert.match(describe(parseRule("FREQ=MONTHLY;BYDAY=-1FR").rule, p.dtstart), /^Every month on the last Friday at 09:00/);
  assert.match(describe(parseRule("FREQ=YEARLY;BYMONTH=11;BYDAY=4TH").rule, p.dtstart), /^Every year on the 4th Thursday of the month in November/);
  assert.match(describe(parseRule("FREQ=YEARLY").rule, p.dtstart), /^Every year on the 5th in January/);
});

test("CSV quotes every field and notes clock changes", () => {
  const csv = reportCsv(analyze({ text: "DTSTART;TZID=America/New_York:20260307T023000\nRRULE:FREQ=DAILY;COUNT=2" }));
  assert.match(csv, /^date,weekday,utc,offset,source,note\n/);
  assert.match(csv, /clock skips this time; happens at 2026-03-08 03:30/);
  assert.match(csv, /"'-05:00"/); // a leading minus is guarded like a formula
});

test("csvSafe guards formula starts and leaves dates alone", () => {
  assert.equal(csvSafe("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvSafe("2026-01-05 09:00"), "2026-01-05 09:00");
});

test("expand() honours limit and reports truncation", () => {
  const p = parseInput("DTSTART:20260101T090000\nRRULE:FREQ=DAILY");
  p.rules = p.rules.map((r) => parseRule(r).rule);
  const e = expand(p, { limit: 5 });
  assert.equal(e.occurrences.length, 5);
  assert.equal(e.truncated, true);
});

test("'show from' takes a time in the forms the start field and the date list use", () => {
  // Hourly from 09:00: from 12:00 skips 09, 10 and 11. The listed dates read "2026-01-01 12:00",
  // so pasting one back into "Show from" has to work (it used to say "is not a date").
  const text = "DTSTART:20260101T090000\nRRULE:FREQ=HOURLY;COUNT=48";
  for (const after of ["2026-01-01 12:00", "2026-01-01T12:00", "2026-01-01 12:00:00", "20260101T120000"]) {
    const r = analyze({ text, after, limit: 3 });
    assert.ok(!r.findings.some((f) => f.code === "bad-after"), after);
    assert.deepEqual(r.occurrences.map((o) => o.date), ["2026-01-01 12:00", "2026-01-01 13:00", "2026-01-01 14:00"], after);
    assert.equal(r.skippedBefore, 3, after);
  }
  assert.ok(codes(text, { after: "2026-01-01 25:00" }).includes("bad-after"));
  assert.ok(codes(text, { after: "2026-02-31" }).includes("bad-after"));
});

test("DTSTART outside the rule: the finding names the rule's own first date", () => {
  const f = analyze({ text: "DTSTART:20260101T090000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3" }).findings.find((x) => x.code === "dtstart-not-in-rule");
  assert.match(f.detail ?? f.message ?? JSON.stringify(f), /start at 2026-01-06 09:00\./);
});

test("mixed BYDAY: the finding states the 50-year window the intersect search used", () => {
  // MO with 1TU: no Monday is also the month's first Tuesday, so dateutil's reading gives nothing.
  const f = analyze({ text: "DTSTART:20260105T090000\nRRULE:FREQ=MONTHLY;BYDAY=MO,1TU;COUNT=5" }).findings.find((x) => x.code === "mixed-byday");
  assert.ok(f);
  assert.match(JSON.stringify(f), /no dates in the next 50 years/);
});

test("a zoned rule with no clock-change occurrences gets no DST finding", () => {
  const r = analyze({ text: "DTSTART;TZID=America/New_York:20260105T090000\nRRULE:FREQ=WEEKLY;COUNT=3" });
  assert.equal(r.tz, "America/New_York");
  assert.ok(!r.findings.some((f) => f.code === "dst-gap" || f.code === "dst-overlap"));
  const g = analyze({ text: "DTSTART;TZID=America/New_York:20260306T023000\nRRULE:FREQ=DAILY;COUNT=4" }).findings.find((f) => f.code === "dst-gap");
  assert.match(JSON.stringify(g), /1 listed occurrence falls/);
});

// Red-team gaps, 2026-11-17: each of these assertions fails on a mutant that
// the suite let through (rrule.mjs lines 171, 264 and 693).
test("a bad COUNT and a bad INTERVAL each get their own advice", () => {
  const detail = (text, code) => parseRule(text).findings.find((f) => f.code === code)?.detail;
  assert.match(detail("FREQ=DAILY;COUNT=0", "bad-count"), /^COUNT is how many occurrences/);
  assert.match(detail("FREQ=DAILY;INTERVAL=x", "bad-interval"), /^INTERVAL defaults to 1/);
});

test("only a date-only DTSTART without VALUE=DATE gets the VALUE=DATE warning", () => {
  const warns = (text) => parseInput(text).findings.filter((f) => f.code === "dtstart-value").map((f) => f.level);
  assert.deepEqual(warns("DTSTART:20260105\nRRULE:FREQ=DAILY;COUNT=2"), ["warning"]);
  assert.deepEqual(warns("DTSTART;VALUE=DATE:20260105\nRRULE:FREQ=DAILY;COUNT=2"), []);
  assert.deepEqual(warns("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;COUNT=2"), []);
  assert.deepEqual(warns("DTSTART;TZID=Europe/Paris:20260105T090000\nRRULE:FREQ=DAILY;COUNT=2"), []);
});

test("BYYEARDAY is flagged with DAILY, WEEKLY and MONTHLY, and only those", () => {
  const forbidden = (freq) =>
    analyze({ text: `DTSTART:20260105T090000\nRRULE:FREQ=${freq};BYYEARDAY=100;COUNT=2` }).findings
      .some((f) => f.code === "forbidden-part" && /BYYEARDAY/.test(f.title));
  for (const freq of ["DAILY", "WEEKLY", "MONTHLY"]) assert.equal(forbidden(freq), true, freq);
  for (const freq of ["YEARLY", "HOURLY", "MINUTELY", "SECONDLY"]) assert.equal(forbidden(freq), false, freq);
});

// Red-team defect, 2026-11-17: a huge INTERVAL with a TZID or a UTC DTSTART
// threw RangeError (Intl and toISOString stop near year 275760), so the page's
// Run button did nothing. iCalendar years have four digits (RFC 5545 3.3.4).
test("dates stop at the end of year 9999 instead of throwing or printing five-digit years", () => {
  for (const text of [
    "DTSTART;TZID=America/New_York:20260105T090000\nRRULE:FREQ=DAILY;INTERVAL=99999999",
    "DTSTART:20260105T090000Z\nRRULE:FREQ=YEARLY;INTERVAL=300000",
    "DTSTART:20260105T090000\nRRULE:FREQ=YEARLY;INTERVAL=5000",
    "DTSTART;TZID=Europe/Paris:99981231T090000\nRRULE:FREQ=DAILY;COUNT=800",
  ]) {
    const r = analyze({ text, limit: 1000 });
    assert.ok(r.occurrences.length >= 1, text);
    for (const o of r.occurrences) assert.match(o.date, /^\d{4}-/, text);
    assert.ok(r.findings.some((f) => f.code === "past-year-9999"), text);
    assert.equal(r.truncated, false, text);
  }
  const r = analyze({ text: "DTSTART;TZID=Europe/Paris:99981231T090000\nRRULE:FREQ=DAILY;COUNT=800", limit: 1000 });
  assert.equal(r.occurrences.at(-1).date, "9999-12-31 09:00");
  assert.equal(r.occurrences.length, 366);
  assert.ok(!analyze({ text: "DTSTART:20260105T090000\nRRULE:FREQ=DAILY;COUNT=3" }).findings.some((f) => f.code === "past-year-9999"));
});

// Class guard for the defect above: the page calls analyze() with no
// try/catch, so any throw leaves the Run button dead. Seeded fuzz over hostile
// rule parts and every DTSTART kind; it must answer, never throw.
test("analyze answers, never throws, on 50 seeded hostile rules", () => {
  let seed = 20261117;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), Math.floor((seed / 2147483648) * n));
  const pick = (xs) => xs[rnd(xs.length)];
  const ints = ["0", "1", "-1", "2", "7", "53", "-53", "366", "-366", "999", "99999999", "99999999999", "1e9", "", "x", "+5", "-0"];
  const parts = {
    FREQ: ["SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "FORTNIGHTLY"],
    INTERVAL: ints, COUNT: ints, UNTIL: ["20261231", "20261231T235959Z", "99991231T235959Z", "00010101", "2026", "20250101T000000"],
    BYDAY: ["MO", "-1FR", "5SU", "53MO", "0MO", "MO,WE,2TU", "XX"], BYMONTHDAY: ints, BYYEARDAY: ints, BYWEEKNO: ints,
    BYMONTH: ["1", "2", "12", "13", "0"], BYHOUR: ["0", "23", "24"], BYMINUTE: ["0", "59", "60"], BYSECOND: ["0", "60", "61"],
    BYSETPOS: ints, WKST: ["MO", "SU", "XX"],
  };
  const starts = ["DTSTART:20260105T090000", "DTSTART:20260105T090000Z", "DTSTART;TZID=America/New_York:20260308T023000", "DTSTART;VALUE=DATE:20260131", "DTSTART;TZID=Australia/Lord_Howe:99991231T013000", "DTSTART:00010101T000000"];
  for (let i = 0; i < 50; i++) {
    const names = Object.keys(parts).filter(() => rnd(3) === 0);
    // A far "Show from" makes a sub-daily rule run its full 3,000,000-step search (~0.5 s): keep those few.
    const rule = ["FREQ", ...names].map((n) => `${n}=${pick(parts[n])}`).join(";");
    const text = `${pick(starts)}\nRRULE:${rule}`;
    let r;
    assert.doesNotThrow(() => (r = analyze({ text, limit: pick([1, 25, 400]), after: rnd(25) ? pick(["", "2026-03-08 02:30"]) : "9999-12-31" })), text);
    for (const o of r.occurrences) assert.match(o.date, /^\d{4}-\d\d-\d\d/, text);
    assert.doesNotThrow(() => reportCsv(r), text);
  }
});

// Red-team defect, 2026-11-17: a sub-daily rule's search stops after
// 3,000,000 steps; the stop was dropped, so a never-ending rule read as
// "No dates." Now it is a finding and searchStopped is set.
test("a sub-daily search that hits its step cap says so instead of listing no dates", () => {
  for (const [text, after] of [["DTSTART:20260105T090000\nRRULE:FREQ=SECONDLY", "2026-03-01"], ["DTSTART:20260105T090000\nRRULE:FREQ=HOURLY", "2400-01-01"]]) {
    const r = analyze({ text, after });
    assert.equal(r.searchStopped, true, text);
    assert.ok(r.findings.some((f) => f.code === "search-stopped" && f.level === "warning"), text);
  }
  const ok = analyze({ text: "DTSTART:20260105T090000\nRRULE:FREQ=MINUTELY;INTERVAL=15", after: "2026-02-01" });
  assert.equal(ok.searchStopped, false);
  assert.equal(ok.occurrences[0].date, "2026-02-01 00:00");
});

test("a UTC UNTIL ends a zoned sub-daily rule on the right second, far from and near the bound", () => {
  const utcs = (text) => analyze({ text, limit: 5000 }).occurrences.map((o) => o.utc);
  const s = utcs("DTSTART;TZID=America/New_York:20260105T090000\nRRULE:FREQ=SECONDLY;UNTIL=20260105T140003Z");
  assert.deepEqual(s, ["2026-01-05T14:00:00Z", "2026-01-05T14:00:01Z", "2026-01-05T14:00:02Z", "2026-01-05T14:00:03Z"]);
  const h = utcs("DTSTART;TZID=Pacific/Kiritimati:20260105T090000\nRRULE:FREQ=HOURLY;UNTIL=20260107T190000Z");
  assert.equal(h.at(-1), "2026-01-07T19:00:00Z");
  assert.equal(h.length, 73); // 09:00 at +14:00 is 19:00Z the day before
  // A SECONDLY rule with a far UNTIL and a far "Show from" took 53 s (a zone
  // lookup per step); the page must answer in well under that.
  const t0 = Date.now();
  analyze({ text: "DTSTART;TZID=America/New_York:20260308T023000\nRRULE:FREQ=SECONDLY;UNTIL=99991231T235959Z", after: "9999-12-31" });
  assert.ok(Date.now() - t0 < 10000, `${Date.now() - t0} ms`);
});

// Red-team gaps, 2026-11-17 (second run): each assertion fails on a mutant
// the suite let through (rrule.mjs RANGES.BYMINUTE signed, describe's six-time cap).
test("BYMINUTE takes no sign: -5 is an error, not minute 55", () => {
  assert.ok(parseRule("FREQ=DAILY;BYMINUTE=-5").findings.some((f) => f.code === "bad-value"));
  assert.ok(!parseRule("FREQ=DAILY;BYMINUTE=5").findings.some((f) => f.code === "bad-value"));
});

test("describe lists up to six clock times, and falls back to hours past that", () => {
  const p = parseInput("DTSTART:20260105T090000");
  assert.match(describe(parseRule("FREQ=DAILY;BYHOUR=1,2,3,4,5,6").rule, p.dtstart), /^Every day at 01:00, 02:00, 03:00, 04:00, 05:00 and 06:00 /);
  assert.match(describe(parseRule("FREQ=DAILY;BYHOUR=1,2,3,4,5,6,7").rule, p.dtstart), /^Every day in hours 1, 2, 3, 4, 5, 6 and 7 /);
});

// Red-team defect, 2026-11-17: a gap longer than the old 3-hour look-back
// (Samoa skipped all of 30 Dec 2011) took the offset after the gap, so a
// daily 12:00 rule put 30 Dec on the same instant as 29 Dec. RFC 5545 3.3.5:
// a skipped wall time takes the offset in force before the gap.
test("a whole skipped day takes the offset before the gap (Pacific/Apia, 30 Dec 2011)", () => {
  for (const sec of [0, 9 * 3600, 12 * 3600, 23.5 * 3600]) {
    const g = wallToInstant(dayNumber(2011, 12, 30), sec, "Pacific/Apia");
    assert.equal(g.kind, "gap", String(sec));
    assert.equal(g.offset, -10 * 3600, String(sec));
  }
  const r = analyze({ text: "DTSTART;TZID=Pacific/Apia:20111228T120000\nRRULE:FREQ=DAILY;COUNT=5" });
  const utc = r.occurrences.map((o) => o.utc);
  assert.equal(utc[2], "2011-12-30T22:00:00Z");
  for (let i = 1; i < utc.length; i++) assert.ok(utc[i] >= utc[i - 1], `UTC goes backwards at ${r.occurrences[i].date}`);
  // Short gaps are unchanged: New York's skipped 02:30 and Lord Howe's half-hour.
  assert.equal(wallToInstant(dayNumber(2026, 3, 8), 2.5 * 3600, "America/New_York").offset, -5 * 3600);
  assert.equal(wallToInstant(dayNumber(2026, 10, 4), 2.25 * 3600, "Australia/Lord_Howe").offset, 10.5 * 3600);
});

// Red-team gap, 2026-11-17: the look-back before a wall time must reach past
// the zone's own offset. With a 12-hour look-back a zone at +14:00 read the
// later offset only, so Apia's repeated 03:30 lost its earlier (first) reading.
test("a repeated hour in a zone more than 12 h ahead of UTC is still an overlap (Pacific/Apia, 4 Apr 2021)", () => {
  const ov = wallToInstant(dayNumber(2021, 4, 4), 3.5 * 3600, "Pacific/Apia");
  assert.equal(ov.kind, "overlap");
  assert.equal(ov.offset, 14 * 3600);
});

// red team 2026-11-17: the short-month warning is about MONTHLY/YEARLY periods only; a DAILY or WEEKLY
// rule that filters to the 31st is asking for exactly those days, and "years where January has no 31st"
// would be wrong for it.
test("DAILY and WEEKLY rules on the 31st get no skips-short-months warning", () => {
  for (const f of ["DAILY", "WEEKLY"]) {
    const r = analyze({ text: `DTSTART:20260131T090000\nRRULE:FREQ=${f};BYMONTHDAY=31;COUNT=5` });
    assert.equal(r.findings.find((x) => x.code === "skips-short-months"), undefined, f);
  }
});

test("negative BYYEARDAY and BYWEEKNO read as counted from the end of the year", () => {
  const p = parseInput("DTSTART:20260105T090000");
  const d = (r) => describe(parseRule(r).rule, p.dtstart);
  assert.match(d("FREQ=YEARLY;BYYEARDAY=-1"), /^Every year on the last day of the year at/);
  assert.match(d("FREQ=YEARLY;BYYEARDAY=-366"), /^Every year on the 366th from last day of the year at/);
  assert.match(d("FREQ=YEARLY;BYYEARDAY=1,-1"), /^Every year on day 1 and the last day of the year at/);
  assert.match(d("FREQ=YEARLY;BYYEARDAY=100,200"), /^Every year on days 100 and 200 of the year at/);
  assert.match(d("FREQ=YEARLY;BYWEEKNO=-1;BYDAY=MO"), /^Every year in the last week of the year on Monday/);
  assert.match(d("FREQ=YEARLY;BYWEEKNO=-2;BYDAY=MO"), /^Every year in the 2nd from last week of the year on Monday/);
  assert.match(d("FREQ=YEARLY;BYWEEKNO=1,20;BYDAY=MO"), /^Every year in weeks 1 and 20 of the year on Monday/);
});

test("English ordinals: 11th, 12th and 13th, but 21st, 22nd, 23rd and 111th", () => {
  const p = parseInput("DTSTART:20260105T090000");
  const md = (n) => describe(parseRule(`FREQ=MONTHLY;BYMONTHDAY=${n}`).rule, p.dtstart);
  assert.match(md(11), /^Every month on the 11th at/);
  assert.match(md(12), /^Every month on the 12th at/);
  assert.match(md(13), /^Every month on the 13th at/);
  assert.match(md(21), /^Every month on the 21st at/);
  assert.match(md(22), /^Every month on the 22nd at/);
  assert.match(md(23), /^Every month on the 23rd at/);
  assert.match(describe(parseRule("FREQ=YEARLY;BYYEARDAY=111").rule, p.dtstart), /day 111 /);
  assert.match(describe(parseRule("FREQ=YEARLY;BYYEARDAY=-111").rule, p.dtstart), /the 111th from last day/);
});

test("a rule part with no name says so, instead of 'Unknown rule part ' with a blank", () => {
  const f = parseRule("FREQ=DAILY;=WEEKLY").findings;
  assert.equal(f.length, 1);
  assert.equal(f[0].code, "bad-part");
  assert.match(f[0].title, /"=WEEKLY" has no part name/);
  // "FREQ=" (a name with no value) is still the no-value error.
  assert.match(parseRule("FREQ=DAILY;COUNT=").findings[0].title, /"COUNT=" has no value/);
});

test("an RDATE on a date the rule also makes is listed once, as the rule's", () => {
  const r = analyze({ text: "DTSTART:20260105T090000\nRRULE:FREQ=DAILY;COUNT=3\nRDATE:20260106T090000,20260110T090000", limit: 10 });
  assert.deepEqual(r.occurrences.map((o) => [o.date, o.source]), [
    ["2026-01-05 09:00", "rule"], ["2026-01-06 09:00", "rule"], ["2026-01-07 09:00", "rule"], ["2026-01-10 09:00", "rdate"],
  ]);
});

test("'no end' is reported only when the rule has neither COUNT nor UNTIL", () => {
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=DAILY").includes("no-end"));
  assert.ok(!codes("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;COUNT=3").includes("no-end"));
  assert.ok(!codes("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;UNTIL=20260110T090000").includes("no-end"));
});
