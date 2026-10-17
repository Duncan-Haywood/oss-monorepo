import { test } from "node:test";
import assert from "node:assert/strict";
import { toDay, dayIso, dayOfWeek, parseDate, parseStays, analyze, bruteForceCounts, sampleSpec, reportCsv, validateSpec, yearBounds, RULES, icsToStays, timelineToStays, EMPLOYER_RULES, fmtNum, fmtMoney, dailyLog, dailyLogCsv, auditReportHtml, tripImpact } from "./calc.mjs";

const Y = 2025;
const spec = (lines, extra = {}) => ({ year: Y, stays: parseStays(lines.join("\n"), Y).stays, abode: {}, overrides: {}, ...extra });
const by = (r, code) => r.states.find((s) => s.code === code);

test("day numbers round-trip and reject impossible dates", () => {
  assert.equal(dayIso(toDay(2025, 2, 28)), "2025-02-28");
  assert.equal(toDay(2025, 2, 29), null);
  assert.equal(dayIso(toDay(2024, 2, 29)), "2024-02-29");
  assert.equal(dayOfWeek(toDay(2025, 10, 1)), 3); // Wednesday
  assert.deepEqual(yearBounds(2024).total, 366);
});

test("date parsing accepts ISO, US and month-name forms", () => {
  assert.equal(parseDate("2025-03-04", Y), toDay(2025, 3, 4));
  assert.equal(parseDate("3/4/2025", Y), toDay(2025, 3, 4));
  assert.equal(parseDate("3/4/25", Y), toDay(2025, 3, 4));
  assert.equal(parseDate("3/4", Y), toDay(2025, 3, 4));
  assert.equal(parseDate("Mar 4", Y), toDay(2025, 3, 4));
  assert.equal(parseDate("March 4th, 2024", Y), toDay(2024, 3, 4));
  assert.equal(parseDate("13/45/2025", Y), null);
});

test("stay lines parse states by code or name and report bad lines", () => {
  const { stays, errors } = parseStays([
    "2025-01-03 to 2025-03-30 FL",
    "1/3/2025 - 3/30/2025 New York",
    "NY, Jun 2 - Jun 9 vacation",
    "# a comment",
    "2025-02-30 to 2025-03-01 NY",
    "2025-04-05 to 2025-04-01 NY",
    "2025-05-01 to 2025-05-02",
  ].join("\n"), Y);
  assert.equal(stays.length, 3);
  assert.deepEqual(stays.map((s) => s.state), ["FL", "NY", "NY"]);
  assert.equal(stays[2].work, false);
  assert.equal(stays[0].work, true);
  assert.equal(errors.length, 3);
  assert.match(errors[0].message, /not a real calendar date/);
  assert.match(errors[1].message, /before the start/);
  assert.match(errors[2].message, /No state found/);
  assert.equal(parseStays("2025-06-01 NY", Y).stays[0].end, toDay(2025, 6, 1));
});

test("inclusive counting counts arrival and departure days", () => {
  const r = analyze(spec(["2025-01-01 to 2025-01-10 NY"]));
  assert.equal(by(r, "NY").days, 10);
  const one = analyze(spec(["2025-01-05 to 2025-01-05 NY"]));
  assert.equal(by(one, "NY").days, 1);
});

test("night counting drops the departure day but keeps a day trip", () => {
  const r = analyze(spec(["2025-01-01 to 2025-01-10 NY", "2025-02-01 to 2025-02-01 NY"], { convention: "nights" }));
  assert.equal(by(r, "NY").days, 10);
});

test("a travel day is counted in both states and is not flagged as a conflict", () => {
  const r = analyze(spec(["2025-01-01 to 2025-03-31 FL", "2025-03-31 to 2025-12-31 NY"]));
  assert.equal(by(r, "FL").days, 90);
  assert.equal(by(r, "NY").days, 276);
  assert.equal(r.daysCounted, 366); // one day counted twice
  assert.equal(r.conflicts.length, 0);
});

test("real overlaps are flagged and still counted in both states", () => {
  const r = analyze(spec(["2025-01-01 to 2025-01-20 NY", "2025-01-10 to 2025-01-31 NJ"]));
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].start, toDay(2025, 1, 10));
  assert.equal(r.conflicts[0].end, toDay(2025, 1, 20));
  assert.equal(r.conflicts[0].days, 11);
  assert.equal(by(r, "NY").days, 20);
  assert.equal(by(r, "NJ").days, 22);
  assert.match(r.notices[0], /11 day\(s\)/);
});

test("gaps are reported, or assigned to a home state when one is chosen", () => {
  const s = spec(["2025-01-01 to 2025-01-31 NY"], { asOf: toDay(2025, 6, 30) });
  const r = analyze(s);
  assert.equal(r.gaps.toDate, 150); // Feb 1 .. Jun 30
  assert.equal(r.gaps.unplanned, 184);
  assert.equal(by(r, "NY").days, 31);
  const h = analyze({ ...s, homeState: "FL" });
  assert.equal(by(h, "FL").days, 334);
  assert.equal(by(h, "FL").assumedDays, 334);
  assert.equal(by(h, "NY").days, 31);
});

test("the limit is 'more than 183 days' and needs an abode", () => {
  const at183 = analyze(spec(["2025-01-01 to 2025-07-02 NY"], { abode: { NY: true } })); // 183 days
  assert.equal(by(at183, "NY").days, 183);
  assert.equal(by(at183, "NY").status, "close");
  assert.equal(by(at183, "NY").room, 0);
  const at184 = analyze(spec(["2025-01-01 to 2025-07-03 NY"], { abode: { NY: true } }));
  assert.equal(by(at184, "NY").status, "over");
  assert.equal(by(at184, "NY").room, -1);
  const noAbode = analyze(spec(["2025-01-01 to 2025-07-03 NY"]));
  assert.equal(by(noAbode, "NY").status, "no-abode");
});

test("a user override changes the limit; a state with no rule is just counted", () => {
  const r = analyze(spec(["2025-01-01 to 2025-02-10 OH", "2025-03-01 to 2025-03-10 TX"], { overrides: { OH: { limit: 30 } } }));
  assert.equal(by(r, "OH").days, 41);
  assert.equal(by(r, "OH").status, "over");
  assert.equal(by(r, "TX").status, "no-wage-tax");
  const g = analyze(spec(["2025-01-01 to 2025-02-10 OH"]));
  assert.equal(by(g, "OH").status, "none");
  assert.equal(by(g, "OH").rule, null);
});

test("trigger date is the first day the limit would be crossed if present every day from tomorrow", () => {
  const r = analyze(spec(["2025-01-01 to 2025-06-30 NY"], { abode: { NY: true }, asOf: toDay(2025, 6, 30) }));
  const ny = by(r, "NY");
  assert.equal(ny.daysToDate, 181);
  // 182 on Jul 1, 183 on Jul 2, 184 on Jul 3
  assert.equal(dayIso(ny.triggerDate), "2025-07-03");
  const none = analyze(spec(["2025-01-01 to 2025-02-01 NY"], { asOf: toDay(2025, 2, 1) }));
  assert.ok(by(none, "NY").triggerDate !== null); // staying every day would still cross it
  const late = analyze(spec(["2025-01-01 to 2025-02-01 NY"], { asOf: toDay(2025, 2, 1), overrides: { NY: { limit: 400 } } }));
  assert.equal(by(late, "NY").triggerDate, null);
});

test("workdays are Monday-Friday, split on shared days, and wages follow them", () => {
  // Mon 2025-06-02 .. Sun 2025-06-08 NY (5 workdays); Mon 06-09 .. Fri 06-13 NJ (5)
  const r = analyze(spec(["2025-06-02 to 2025-06-08 NY", "2025-06-09 to 2025-06-13 NJ"], { wages: 1000 }));
  assert.equal(by(r, "NY").workdays, 5);
  assert.equal(by(r, "NJ").workdays, 5);
  assert.equal(by(r, "NY").wages, 500);
  const off = analyze(spec(["2025-06-02 to 2025-06-08 NY off", "2025-06-09 to 2025-06-13 NJ"], { wages: 1000 }));
  assert.equal(by(off, "NY").workdays, 0);
  assert.equal(by(off, "NJ").wages, 1000);
  const split = analyze(spec(["2025-06-02 to 2025-06-04 NY", "2025-06-04 to 2025-06-06 NJ"], { wages: 400 }));
  assert.equal(by(split, "NY").workdays, 2.5);
  assert.equal(by(split, "NJ").workdays, 2.5);
});

test("the day counts agree with an independent brute-force recount on random trips", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const codes = ["NY", "NJ", "FL", "CA", "OR"];
  const { start } = yearBounds(Y);
  for (let t = 0; t < 60; t++) {
    const stays = [];
    for (let i = 0; i < 1 + Math.floor(rnd() * 8); i++) {
      const a = start + Math.floor(rnd() * 360);
      stays.push({ state: codes[Math.floor(rnd() * codes.length)], start: a, end: a + Math.floor(rnd() * 40), work: true });
    }
    const clipped = stays.map((s) => ({ ...s, end: Math.min(s.end, yearBounds(Y).end) }));
    for (const convention of ["inclusive", "nights"]) {
      const sp = { year: Y, stays: clipped, convention, homeState: t % 2 ? "FL" : null, abode: {}, overrides: {} };
      const got = Object.fromEntries(analyze(sp).states.map((s) => [s.code, s.days]));
      const want = bruteForceCounts(sp);
      for (const k of Object.keys(want)) assert.equal(got[k], want[k], `${t} ${convention} ${k}`);
    }
  }
});

test("stays outside the tax year are clipped to it", () => {
  const r = analyze({ year: Y, stays: [{ state: "NY", start: toDay(2024, 12, 20), end: toDay(2025, 1, 5), work: true }], abode: {}, overrides: {} });
  assert.equal(by(r, "NY").days, 5);
});

test("the sample is a real plan: it crosses the New York limit and the counts add up", () => {
  const s = sampleSpec();
  assert.deepEqual(validateSpec(s), []);
  const r = analyze(s);
  assert.equal(r.daysCounted, 365 + 0);
  assert.equal(by(r, "NY").days, 198);
  assert.equal(by(r, "NY").status, "over");
  assert.equal(by(r, "NJ").status, "no-abode");
  assert.equal(dayIso(by(r, "NY").triggerDate), "2025-10-17");
  assert.equal(r.notices.length, 0);
});

test("validation and the CSV export", () => {
  assert.ok(validateSpec({ year: 2025, stays: [] }).length > 0);
  assert.throws(() => analyze({ year: 2025, stays: [] }));
  const csv = reportCsv(analyze(sampleSpec()));
  assert.match(csv, /^State,Days counted/);
  assert.match(csv, /NY,198,/);
  assert.match(csv, /2025-04-01\.\.2025-08-29/);
  assert.ok(RULES.NY.limit === 183 && RULES.OR.limit === 200);
});

test("Rhode Island is a more-than-183-days-plus-abode state", () => {
  assert.equal(RULES.RI.limit, 183);
  assert.equal(RULES.RI.requiresAbode, true);
});

test("icsToStays: all-day end is exclusive, locations and titles resolve, adjacent same-state merge", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20250301", "DTEND;VALUE=DATE:20250304", "SUMMARY:Ski trip", "LOCATION:Denver\\, CO", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20250304", "DTEND;VALUE=DATE:20250306", "SUMMARY:Stay in Colorado", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART:20250410T090000Z", "DTEND:20250412T170000Z", "SUMMARY:Conference", "LOCATION:Moscone Center\\, San Francisco\\,", " California", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20250501", "DTEND;VALUE=DATE:20250502", "SUMMARY:Dentist", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20240601", "DTEND;VALUE=DATE:20240602", "LOCATION:Austin\\, TX", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const r = icsToStays(ics, 2025);
  assert.deepEqual(r.lines, ["2025-03-01 to 2025-03-05 CO", "2025-04-10 to 2025-04-12 CA"]);
  assert.equal(r.imported, 3);
  assert.equal(r.skipped, 2);
  assert.equal(parseStays(r.lines.join("\n"), 2025).errors.length, 0);
});

test("Maryland (183 or more) and Maine (more than 183) thresholds follow the 'more than limit' convention", () => {
  assert.equal(RULES.MD.limit, 182);
  assert.equal(RULES.ME.limit, 183);
  assert.equal(RULES.MD.requiresAbode, true);
  assert.equal(RULES.ME.requiresAbode, true);
});

test("Utah: 183 or more days with a place of abode, so the limit is 182", () => {
  assert.equal(RULES.UT.limit, 182);
  assert.equal(RULES.UT.requiresAbode, true);
  assert.equal(RULES.UT.kind, "statutory");
  const sp = spec(["UT 2025-01-01 to 2025-07-02"], { abode: { UT: true }, homeState: "FL" }); // 183 days
  assert.equal(by(analyze(sp), "UT").days, 183);
  assert.equal(by(analyze(sp), "UT").status, "over");
});

test("Michigan: more than 183 days with a permanent place of abode", () => {
  assert.equal(RULES.MI.limit, 183);
  assert.equal(RULES.MI.requiresAbode, true);
  assert.equal(RULES.MI.kind, "statutory");
  const sp = spec(["MI 2025-01-01 to 2025-07-03"], { abode: { MI: true }, homeState: "FL" }); // 184 days
  assert.equal(by(analyze(sp), "MI").days, 184);
  assert.equal(by(analyze(sp), "MI").status, "over");
});

test("convenience-of-the-employer view pulls remote workdays back to the employer's state", () => {
  // 5 workdays in NY, 5 in NJ, 5 in FL (no wage tax); employer in NY.
  const lines = ["2025-06-02 to 2025-06-06 NY", "2025-06-09 to 2025-06-13 NJ", "2025-06-16 to 2025-06-20 FL"];
  const r = analyze(spec(lines, { wages: 1500, employerState: "NY" }));
  assert.equal(r.employer.code, "NY");
  assert.equal(r.employer.kind, "strict");
  assert.equal(r.employer.physicalDays, 5);
  assert.equal(r.employer.remoteDays, 10);
  assert.equal(r.employer.claimableDays, 15);
  assert.equal(r.employer.claimableWages, 1500);
  assert.equal(r.employer.doubleTaxDays, 5); // NJ taxes wages, FL does not
  assert.equal(r.employer.doubleTaxWages, 500);
  assert.ok(r.notices.some((n) => n.includes("New York may claim")));
  assert.deepEqual(r.employer.byState.map((b) => [b.code, b.noWageTax]).sort(), [["FL", true], ["NJ", false]]);
});

test("no employer view without an employer state or for a state with no such rule", () => {
  const lines = ["2025-06-02 to 2025-06-06 NY"];
  assert.equal(analyze(spec(lines, { wages: 1000 })).employer, null);
  assert.equal(analyze(spec(lines, { wages: 1000, employerState: "TX" })).employer, null);
  assert.ok(EMPLOYER_RULES.PA.kind === "retaliatory");
  const pa = analyze(spec(["2025-06-02 to 2025-06-06 PA", "2025-06-09 to 2025-06-13 OH"], { employerState: "PA" }));
  assert.ok(pa.notices.some((n) => n.includes("same rule")));
  assert.equal(pa.employer.claimableWages, null); // no wages typed
});

test("fmtNum rounds to whole numbers by default and fmtMoney leaves cents off", () => {
  assert.equal(fmtNum(1234.5), "1,235");
  assert.equal(fmtNum(12), "12");
  assert.equal(fmtNum(2.25, 1), "2.3");
  assert.equal(fmtMoney(140000.4), "$140,000");
  assert.equal(fmtMoney(null), "");
});

test("timelineToStays: Takeout placeVisits resolve addresses, skip travel and no-address visits, merge neighbours", () => {
  const visit = (address, start, end, name) => ({ placeVisit: { location: { address, name }, duration: { startTimestamp: start, endTimestamp: end } } });
  const doc = { timelineObjects: [
    visit("10 Main St, Albany, NY 12207, USA", "2025-03-01T09:00:00Z", "2025-03-01T17:00:00Z"),
    visit("22 Elm St, Albany, NY 12207, USA", "2025-03-02T08:00:00Z", "2025-03-04T10:00:00Z"),
    visit("1 Beach Rd, Miami, FL 33101, USA", "2025-05-10T10:00:00Z", "2025-05-10T20:00:00Z"),
    { activitySegment: { activityType: "IN_VEHICLE" } },
    visit(undefined, "2025-06-01T10:00:00Z", "2025-06-01T11:00:00Z"),
    visit("1 Old St, Austin, TX 78701, USA", "2024-12-31T10:00:00Z", "2024-12-31T11:00:00Z"),
  ] };
  const r = timelineToStays(JSON.stringify(doc), 2025);
  assert.deepEqual(r.lines, ["2025-03-01 to 2025-03-04 NY", "2025-05-10 FL"]);
  assert.equal(r.imported, 3);
  assert.equal(r.skipped, 3);
  assert.equal(parseStays(r.lines.join("\n"), 2025).errors.length, 0);
  assert.equal(timelineToStays("not json", 2025).error, "Not a JSON file.");
  assert.equal(timelineToStays(JSON.stringify([doc, doc]), 2025).lines.length, 2);
});

test("daily log totals match analyze and brute force, for both conventions", () => {
  for (const convention of ["inclusive", "nights"]) {
    const sp = { ...spec(["NY 2025-01-01 to 2025-03-10", "FL 2025-03-10 to 2025-06-30", "NJ 2025-08-01 to 2025-09-15"], { homeState: "NY" }), convention };
    const log = dailyLog(sp);
    assert.equal(log.length, 365);
    const r = analyze(sp);
    for (const s of r.states) assert.equal(log.filter((x) => x.states.includes(s.code)).length, s.days, `${convention} ${s.code}`);
  }
});

test("daily log marks assumed and unrecorded days and writes one CSV row per day", () => {
  const sp = spec(["NY 2025-01-01 to 2025-01-31"]);
  const log = dailyLog(sp);
  assert.equal(log[0].basis, "stay");
  assert.equal(log[40].basis, "not recorded");
  assert.equal(dailyLog({ ...sp, homeState: "FL" })[40].basis, "assumed (no stay listed)");
  assert.equal(dailyLogCsv(sp).trim().split("\n").length, 366);
  const travel = dailyLog(spec(["NY 2025-01-01 to 2025-01-10", "FL 2025-01-10 to 2025-01-20"]));
  assert.deepEqual(travel[9].states, ["FL", "NY"]);
});

test("audit packet carries every state total and one log row per day, and escapes names", () => {
  const sp = spec(["NY 2025-01-01 to 2025-03-10", "FL 2025-03-10 to 2025-06-30"], { homeState: "FL" });
  const html = auditReportHtml(sp, { name: "<b>A & B</b>" });
  const r = analyze(sp);
  for (const s of r.states) assert.ok(html.includes(`<td class="n">${s.days}</td>`), s.code);
  assert.equal((html.match(/<td class="ev">/g) || []).length, 365);
  assert.ok(!html.includes("<b>A & B</b>"));
  assert.ok(html.includes("&lt;b&gt;A &amp; B&lt;/b&gt;"));
  assert.ok(html.includes("not tax or legal advice"));
  assert.ok(!/https?:\/\//.test(html));
});

test("Idaho: more than 270 days with a year-round abode", () => {
  assert.equal(RULES.ID.limit, 270);
  assert.equal(RULES.ID.requiresAbode, true);
  assert.equal(RULES.ID.kind, "statutory");
});

test("tripImpact adds the trip's days, flags a newly crossed limit and finds the longest safe trip", () => {
  const sp = spec(["NY 2025-01-01 to 2025-06-30"], { abode: { NY: true }, homeState: "FL" });
  const base = by(analyze(sp), "NY").days; // 181
  const r = tripImpact(sp, { state: "NY", start: toDay(Y, 7, 1), days: 2 });
  const ny = r.changes.find((c) => c.code === "NY");
  assert.equal(ny.before, base);
  assert.equal(ny.after, base + 2);
  assert.equal(ny.delta, 2);
  assert.deepEqual(r.newlyOver, []);
  // limit is 183 (over means more than 183): 2 more days are safe, 3 cross it
  assert.equal(r.maxSafeDays, 183 - base);
  const over = tripImpact(sp, { state: "NY", start: toDay(Y, 7, 1), days: 184 - base });
  assert.deepEqual(over.newlyOver, ["NY"]);
  // a trip to a state replaces assumed home days
  assert.deepEqual(tripImpact(sp, { state: "FL", start: toDay(Y, 7, 1), days: 5 }).changes, []);
  assert.equal(tripImpact(sp, { state: "TX", start: toDay(Y, 7, 1), days: 5 }).maxSafeDays, null);
  assert.throws(() => tripImpact(sp, { state: "N", start: 1, days: 3 }));
  assert.throws(() => tripImpact(sp, { state: "NY", start: toDay(Y, 7, 1), days: 0 }));
});
