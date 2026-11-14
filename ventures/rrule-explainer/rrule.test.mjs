import { test } from "node:test";
import assert from "node:assert/strict";
import { dayNumber, civil, weekday, weekOf, parseRule, parseInput, expand, analyze, wallToInstant, describe, reportCsv } from "./rrule.mjs";

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
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=MONTHLY;BYSETPOS=1").includes("setpos-alone"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;COUNT=3;UNTIL=20260201T000000").includes("count-and-until"));
  assert.ok(codes("DTSTART:20260105T090000\nRRULE:FREQ=DAILY;UNTIL=20260201").includes("until-type"));
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
});

test("expand() honours limit and reports truncation", () => {
  const p = parseInput("DTSTART:20260101T090000\nRRULE:FREQ=DAILY");
  p.rules = p.rules.map((r) => parseRule(r).rule);
  const e = expand(p, { limit: 5 });
  assert.equal(e.occurrences.length, 5);
  assert.equal(e.truncated, true);
});
