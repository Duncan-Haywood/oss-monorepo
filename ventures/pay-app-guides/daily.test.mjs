import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, parseCrew, reportText, reportEmail, logCsv, parseDates, parseHolidays, missingWeekdays, gapsText, weekday, dayLabel, SAMPLE, SAMPLE_DATES, SAMPLE_HOLIDAYS, SAMPLE_THROUGH, NOTE, MAX_CREW_LINES } from "./daily.mjs";
import { parseDate } from "./colog.mjs";

const d = (s) => parseDate(s);

test("weekday: 2026-11-24 is a Tuesday, 1970-01-01 a Thursday", () => {
  assert.equal(weekday(d("2026-11-24")), 2);
  assert.equal(weekday(0), 4);
  assert.equal(dayLabel(d("2026-11-28")), "Saturday 2026-11-28");
});

test("the example: crew totals by hand (4×8 + 2×8 + 2×6 = 60 man-hours, 8 workers)", () => {
  const { errors, report } = buildReport(SAMPLE);
  assert.deepEqual(errors, []);
  assert.deepEqual(report.totals, { workers: 8, manHours: 60 });
  assert.equal(report.crew[2].company, "Example LV Co");
  assert.equal(report.lost, 2);
  const t = reportText(report);
  assert.match(t, /^DAILY REPORT: Elm St Clinic\nDate: Tuesday 2026-11-24/);
  assert.match(t, /Weather: Rain until 10 am, then cloudy, 52°\/41°F/);
  assert.match(t, /Total: 8 workers, 60 man-hours/);
  assert.ok(t.endsWith(NOTE));
  assert.doesNotMatch(t, /^Notes$/m, "an empty section is left out of a filled report");
});

test("PayApps' rules: temperatures, low above high, quarter hours, worker counts, the date", () => {
  const bad = (f, re) => assert.ok(buildReport({ ...SAMPLE, ...f }).errors.some((e) => re.test(e)), JSON.stringify(f));
  bad({ high: "141" }, /High temperature: enter whole degrees F between -80 and 140/);
  bad({ low: "40.5" }, /Low temperature/);
  bad({ high: "40", low: "50" }, /low temperature is above the high/);
  bad({ lost: "1.3" }, /quarter hours/);
  bad({ lost: "25" }, /quarter hours/);
  bad({ crew: "Electrician, 0, 8" }, /Crew line 1: enter the number of workers/);
  bad({ crew: "Electrician, 2, 8.1" }, /Crew line 1: enter the hours each/);
  bad({ crew: ", 2, 8" }, /Crew line 1: enter the trade/);
  bad({ date: "2026-02-30" }, /Enter the report's date/);
  assert.ok(buildReport(SAMPLE, { latest: d("2026-11-23") }).errors.some((e) => /after today/.test(e)));
  assert.deepEqual(buildReport({ ...SAMPLE, high: "-80", low: "-80", lost: "0.25", crew: "Laborer, 999, 24" }).errors, []);
});

test("crew: a header row is skipped, tabs read like commas, 40 lines at most", () => {
  const c = parseCrew("Trade\tWorkers\tHours\nCarpenter\t3\t7.5");
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.lines, [{ trade: "Carpenter", workers: 3, hoursEach: 7.5, company: "", manHours: 22.5 }]);
  const many = Array.from({ length: MAX_CREW_LINES + 1 }, () => "Laborer, 1, 8").join("\n");
  assert.ok(parseCrew(many).errors.some((e) => /up to 40 crew lines/.test(e)));
});

test("a blank report prints as the empty form; an email needs a date", () => {
  const { report } = buildReport({});
  const t = reportText(report);
  assert.match(t, /Date: _{10,}/);
  assert.equal((t.match(/Trade \/ company/g) || []).length, 4);
  assert.match(t, /Visitors and inspections\n  _{10,}/);
  assert.equal(reportEmail(report), "");
});

test("the email reports what happened and claims nothing", () => {
  const { report } = buildReport(SAMPLE);
  const e = reportEmail(report, { pm: "Maria Hill" });
  assert.match(e, /^Subject: Elm St Clinic: daily report for Tuesday 2026-11-24 \(Spark Electric\)/);
  assert.match(e, /Hi Maria,/);
  assert.match(e, /We lost 2 hours to weather or a delay/);
  assert.doesNotMatch(e, /hereby|notice of (delay|claim) is given|entitled|time extension is due/i);
  assert.match(e, /R\. Diaz$/);
});

test("log CSV: one row per report, crew in one cell, formula-looking text neutralised", () => {
  const { report } = buildReport({ ...SAMPLE, notes: "=HYPERLINK(\"x\")" });
  const csv = logCsv([report]);
  const [head, row] = csv.split("\n");
  assert.match(head, /^Date,Project,Contractor,Weather,High F,Low F,Hours lost,Workers,Man-hours,Crew,/);
  assert.match(row, /^2026-11-24,Elm St Clinic,Spark Electric,/);
  assert.match(csv, /"Electrician: 4 workers × 8 h = 32 man-hours; Apprentice/);
  assert.doesNotMatch(csv, /,=HYPERLINK/);
});

test("missing weekdays, by hand: Nov 10 and Nov 20 missing; Saturday Nov 14 counts; Thanksgiving and the day after left out", () => {
  const dates = parseDates(SAMPLE_DATES);
  const hol = parseHolidays(SAMPLE_HOLIDAYS);
  assert.deepEqual([dates.errors, hol.errors], [[], []]);
  const g = missingWeekdays(dates.days, d(SAMPLE_THROUGH), hol.map);
  assert.deepEqual(g.days.map((x) => dayLabel(x)), ["Friday 2026-11-20", "Tuesday 2026-11-10"]);
  assert.equal(g.total, 2);
  assert.deepEqual(g.holidays.map((h) => h.name), ["Day after Thanksgiving", "Thanksgiving"]);
  assert.equal(gapsText(g), "17 reports since 2026-11-02. 2 weekdays have no report.");
  // Without the holiday list, both days show as missing.
  assert.equal(missingWeekdays(dates.days, d(SAMPLE_THROUGH)).total, 4);
  assert.equal(gapsText(missingWeekdays([], d(SAMPLE_THROUGH))), "Paste the dates of the reports you have.");
});

test("dates: pasted log column with a header and text beside each date; bad dates named", () => {
  const p = parseDates("Date,Work\n11/02/2026, rough-in\n2026-11-03 trim\n2026-13-01\nnothing here");
  assert.deepEqual(p.days, [d("2026-11-02"), d("2026-11-03")]);
  assert.equal(p.errors.length, 2);
  assert.match(p.errors[0], /Line 4: "2026-13-01" is not a real date/);
  assert.ok(parseHolidays("Thanksgiving").errors.length === 1);
});
