import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { calendarReview, calendarText, calendarCsv, calendarTableHtml } from "./calreview.mjs";

const D8 = "((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)()))";
const D9 = "((0||0(s|07:00|f|12:00)())(0||1(s|13:00|f|17:00)()))";
const serial = (iso) => Date.parse(iso + "T00:00:00Z") / 86400000 - Date.UTC(1899, 11, 30) / 86400000;
const cal = (days, holidays = [], day = D8) => `(0||CalendarData()((0||DaysOfWeek()(${[1, 2, 3, 4, 5, 6, 7].map((d) => `(0||${d}()${days.includes(d) ? day : "()"})`).join("")}))(0||Exceptions()(${holidays.map((h, i) => `(0||${i}(d|${serial(h)})())`).join("")}))))`;
function xerText(tables) {
  const lines = ["ERMHDR\t20.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return lines.join("\r\n");
}
const WEEKDAYS = [2, 3, 4, 5, 6];
const HOL = ["2025-12-25", "2026-01-01", "2026-05-25", "2026-07-03", "2026-12-25"];
// A: 2,800 h on C1 from 1 December 2025 runs into mid-2027; C1's holidays stop at 2026
function net({ calendars = null, hours = 2800, taskCal = "C1" } = {}) {
  return parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
    CALENDAR: calendars || [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Site", clndr_type: "CA_Base", day_hr_cnt: 8, week_hr_cnt: 40, clndr_data: cal(WEEKDAYS, HOL) }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    TASK: [
      { task_id: "1", proj_id: "1", wbs_id: "10", clndr_id: taskCal, task_type: "TT_Task", status_code: "TK_NotStart", task_code: "A", task_name: "Build", remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours },
      { task_id: "2", proj_id: "1", wbs_id: "10", clndr_id: taskCal, task_type: "TT_FinMile", status_code: "TK_NotStart", task_code: "END", task_name: "Finish", remain_drtn_hr_cnt: 0, target_drtn_hr_cnt: 0 },
    ],
    TASKPRED: [{ task_pred_id: "1", task_id: "2", pred_task_id: "1", proj_id: "1", pred_proj_id: "1", pred_type: "PR_FS", lag_hr_cnt: 0 }],
  }));
}
const kinds = (r) => r.findings.map((f) => f.kind).sort();

test("holidays that stop before the work: the missing year is named and the what-if moves the finish", () => {
  const r = calendarReview(net());
  const f = r.findings.find((x) => x.kind === "holidays-run-out");
  assert.ok(f, calendarText(r));
  assert.deepEqual(f.years, [2027]);
  assert.equal(f.severity, "fault");
  assert.deepEqual(f.activities.map((a) => a.code), ["A"]);
  assert.equal(r.summary.missingHolidayYears, 1);
  // 2026's holidays copied to 2027 by date: 1 January and 25 May 2027 are
  // weekdays (3 July and 25 December 2027 are Saturdays); only 1 January
  // falls before A's finish in April, so the finish moves one working day
  const p = r.whatIf.projects[0];
  assert.equal(r.whatIf.holidaysAdded, 2, JSON.stringify(r.whatIf));
  assert.equal(p.workingDays, 1);
  assert.equal(p.finish, "2027-04-09 17:00");
  assert.equal(p.finishWithHolidays, "2027-04-12 17:00");
  assert.ok(r.whatIf.activitiesLater >= 1);
});

test("no fault when the holidays run as far as the work, or the work ends early in the year", () => {
  const full = [...HOL, "2027-01-01", "2027-05-31", "2027-07-05", "2027-12-24"];
  const r = calendarReview(net({ calendars: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Site", day_hr_cnt: 8, week_hr_cnt: 40, clndr_data: cal(WEEKDAYS, full) }] }));
  assert.deepEqual(kinds(r), []);
  assert.equal(r.whatIf, null);
  // ~1 year of work ends in the first weeks of 2027: under 60 days of 2027
  const short = calendarReview(net({ hours: 2000 }));
  assert.ok(!short.findings.some((f) => f.kind === "holidays-run-out"), calendarText(short));
});

test("a holiday on a day the week does not work is not counted", () => {
  // 2026-01-04 is a Sunday
  const r = calendarReview(net({ calendars: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Site", day_hr_cnt: 8, clndr_data: cal(WEEKDAYS, ["2026-01-04"]) }] }));
  assert.equal(r.calendars[0].holidays, 0);
  assert.deepEqual(kinds(r), ["no-holidays"]);
});

test("hours per day stored against the hours the days hold, and the name against the days", () => {
  const r = calendarReview(net({ calendars: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard 5 Day Workweek", day_hr_cnt: 8, week_hr_cnt: 40, clndr_data: cal([1, 2, 3, 4, 5, 6, 7], [], D9) }] }));
  const hpd = r.findings.find((f) => f.kind === "hours-per-day");
  assert.equal(hpd.stored, 8);
  assert.equal(hpd.actual, 9);
  assert.match(hpd.text, /10 days takes 8\.9/);
  const wk = r.findings.find((f) => f.kind === "hours-per-week");
  assert.equal(wk.actual, 63);
  const nm = r.findings.find((f) => f.kind === "name-days");
  assert.equal(nm.named, 5);
  assert.equal(nm.works, 7);
  // the same pattern stored right raises none of the three
  const ok = calendarReview(net({ calendars: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "7 Day Workweek", day_hr_cnt: 9, week_hr_cnt: 63, clndr_data: cal([1, 2, 3, 4, 5, 6, 7], [], D9) }] }));
  assert.deepEqual(kinds(ok).filter((k) => ["hours-per-day", "hours-per-week", "name-days"].includes(k)), []);
});

test("every-day critical work, duplicates, unused and no-work calendars", () => {
  const cals = [
    { clndr_id: "C1", default_flag: "Y", clndr_name: "Site", day_hr_cnt: 8, clndr_data: cal(WEEKDAYS, HOL) },
    { clndr_id: "C2", default_flag: "N", clndr_name: "Site copy", day_hr_cnt: 8, clndr_data: cal(WEEKDAYS, HOL) },
    { clndr_id: "C7", default_flag: "N", clndr_name: "Calendar days", day_hr_cnt: 8, clndr_data: cal([1, 2, 3, 4, 5, 6, 7]) },
    { clndr_id: "C0", default_flag: "N", clndr_name: "Empty", day_hr_cnt: 8, clndr_data: cal([]) },
  ];
  const r = calendarReview(net({ calendars: cals, taskCal: "C7", hours: 400 }));
  assert.ok(r.findings.some((f) => f.kind === "every-day" && f.calendarId === "C7" && f.activities[0].code === "A"));
  // C1 is the project calendar (used), C2 is its twin and unused
  const dup = r.findings.find((f) => f.kind === "duplicate");
  assert.deepEqual(dup.calendars, ["Site", "Site copy"]);
  assert.ok(r.findings.some((f) => f.kind === "unused" && f.calendarId === "C2"));
  assert.ok(r.findings.some((f) => f.kind === "unused" && f.calendarId === "C0"));
  assert.ok(!r.findings.some((f) => f.kind === "unused" && f.calendarId === "C1"));
  // faults sort first
  const sev = r.findings.map((f) => f.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => ["fault", "check", "note"].indexOf(a) - ["fault", "check", "note"].indexOf(b)));
});

test("CSV has one row per activity, cells guarded; HTML escapes names", () => {
  const r = calendarReview(net({ calendars: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "=HYPERLINK(\"x\") <b>", day_hr_cnt: 8, clndr_data: cal(WEEKDAYS, HOL) }] }));
  const csv = calendarCsv(r);
  assert.match(csv, /^severity,finding,calendar_id/);
  assert.match(csv, /"'=HYPERLINK\(""x""\) <b>"/);
  const html = calendarTableHtml(r);
  assert.ok(!html.includes("<b>"));
  assert.match(html, /&lt;b&gt;/);
});

// Guard added by the 2026-11-26 red-team run: several missing years read as one range.
test("consecutive missing holiday years are named as a range", () => {
  const r = calendarReview(net({ hours: 8000 }));
  const f = r.findings.find((x) => x.kind === "holidays-run-out");
  assert.ok(f, calendarText(r));
  assert.deepEqual(f.years, [2027, 2028, 2029]);
  assert.match(f.text, /none in 2027-2029,/);
  assert.match(calendarText(r), /TEST: the finish moves from /);
});
