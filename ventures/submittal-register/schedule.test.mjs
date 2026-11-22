import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegister, linesFromText } from "./engine.mjs";
import { SAMPLE_TEXT } from "./sample.mjs";
import { matchSections, minusDays, parseDate, parseLeadTimes, parsePins, readActivityCsv, readReviewPeriod, readSchedule, readXer, scheduleCsv, scheduleRegister, termsFor } from "./schedule.mjs";

// A small XER in P6's layout: tab-separated, %T table, %F fields, %R rows.
const XER = [
  "ERMHDR\t19.12\t2026-01-05\tProject\tadmin\tadmin\tdbxDatabaseNoName\tProject Management\tUSD",
  "%T\tPROJECT",
  "%F\tproj_id\tproj_short_name\tlast_recalc_date",
  "%R\t1\tCLINIC\t2026-03-02 00:00",
  "%T\tPROJWBS",
  "%F\twbs_id\tproj_id\twbs_name",
  "%R\t10\t1\tStructure",
  "%R\t11\t1\tFinishes",
  "%T\tTASK",
  "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\tstatus_code\tact_start_date\tact_end_date\trestart_date\treend_date\tearly_start_date\tearly_end_date\ttarget_start_date\ttarget_end_date",
  "%R\t1\t1\t10\tA1000\tSubmit shop drawings - misc metals\tTT_Task\tTK_NotStart\t\t\t2026-03-02 08:00\t2026-03-20 17:00\t2026-03-02 08:00\t2026-03-20 17:00\t2026-03-02 08:00\t2026-03-20 17:00",
  "%R\t2\t1\t10\tA1010\tInstall misc metal embeds and lintels\tTT_Task\tTK_NotStart\t\t\t2026-05-04 08:00\t2026-05-15 17:00\t2026-05-04 08:00\t2026-05-15 17:00\t2026-05-04 08:00\t2026-05-15 17:00",
  "%R\t3\t1\t10\tA1020\tSteel stair and handrails L1-L2\tTT_Task\tTK_NotStart\t\t\t2026-06-01 08:00\t2026-06-12 17:00\t2026-06-01 08:00\t2026-06-12 17:00\t2026-06-01 08:00\t2026-06-12 17:00",
  "%R\t4\t1\t11\tA2000\tHang doors and install door hardware L1\tTT_Task\tTK_NotStart\t\t\t2026-09-07 08:00\t2026-09-18 17:00\t2026-09-07 08:00\t2026-09-18 17:00\t2026-09-07 08:00\t2026-09-18 17:00",
  "%R\t5\t1\t11\tA2010\tPaint walls L1 (prime and first coat)\tTT_Task\tTK_NotStart\t\t\t2026-08-03 08:00\t2026-08-21 17:00\t2026-08-03 08:00\t2026-08-21 17:00\t2026-08-03 08:00\t2026-08-21 17:00",
  "%R\t6\t1\t11\tA2020\tPaint walls L2\tTT_Task\tTK_NotStart\t\t\t2026-08-24 08:00\t2026-09-04 17:00\t2026-08-24 08:00\t2026-09-04 17:00\t2026-08-24 08:00\t2026-09-04 17:00",
  "%R\t7\t1\t11\tM9000\tSubstantial completion\tTT_FinMile\tTK_NotStart\t\t\t\t2026-10-30 17:00\t\t2026-10-30 17:00\t\t2026-10-30 17:00",
  "%R\t8\t1\t10\tA0900\tExcavate footings\tTT_Task\tTK_Complete\t2026-01-12 08:00\t2026-01-30 17:00\t\t\t2026-01-12 08:00\t2026-01-30 17:00\t2026-01-12 08:00\t2026-01-30 17:00",
  "%E",
].join("\r\n");

test("reads the TASK table: start = actual if started, else remaining early start; WBS names", () => {
  const s = readXer(XER);
  assert.equal(s.dataDate, "2026-03-02");
  const by = Object.fromEntries(s.activities.map((a) => [a.code, a]));
  assert.equal(by.A1010.start, "2026-05-04");
  assert.equal(by.A1010.wbs, "Structure");
  assert.equal(by.A0900.start, "2026-01-12");
  assert.equal(by.A0900.done, true);
  assert.deepEqual([by.M9000.start, by.M9000.milestone], ["2026-10-30", true]); // a finish milestone's date is its finish
  assert.equal(readSchedule(XER).activities.length, s.activities.length);
});

test("sample book sections each go to the first activity doing their work, not the submittal step", () => {
  const reg = buildRegister(linesFromText(SAMPLE_TEXT));
  const m = matchSections(reg.sections, readXer(XER).activities);
  assert.equal(m.get("05 50 00").activity.code, "A1010"); // not A1000 "Submit shop drawings"
  assert.equal(m.get("08 71 00").activity.code, "A2000");
  assert.equal(m.get("09 91 23").activity.code, "A2010"); // L1 paint starts first
});

test("a section number in the activity wins over words", () => {
  const acts = [
    { code: "X1", name: "Paint walls", wbs: "", start: "2026-01-05", finish: "", milestone: false, done: false },
    { code: "X2", name: "09 91 23 interior painting stairs", wbs: "", start: "2026-02-02", finish: "", milestone: false, done: false },
  ];
  const m = matchSections([{ number: "09 91 23", title: "INTERIOR PAINTING" }], acts);
  assert.equal(m.get("09 91 23").activity.code, "X2");
  assert.equal(m.get("09 91 23").basis, "spec number");
});

test("an activity that reads as another trade's work is skipped, and locations in parentheses are not work", () => {
  const acts = [
    { code: "C1", name: "Chilled water pit base and wall concrete", wbs: "", start: "2026-01-05", finish: "", milestone: false, done: false },
    { code: "C2", name: "1st fix chilled water pipe (Plant RM)", wbs: "", start: "2026-04-06", finish: "", milestone: false, done: false },
    { code: "C3", name: "1st fix sprinkler pipe (Locker RM)", wbs: "", start: "2026-02-02", finish: "", milestone: false, done: false },
  ];
  const m = matchSections([{ number: "23 21 13", title: "HYDRONIC PIPING" }, { number: "10 51 13", title: "LOCKERS" }], acts);
  assert.equal(m.get("23 21 13").activity.code, "C2");
  assert.equal(m.get("10 51 13"), null);
});

test("pins set a section's activity by ID", () => {
  const acts = readXer(XER).activities;
  const m = matchSections([{ number: "05 50 00", title: "METAL FABRICATIONS" }], acts, parsePins("05 50=A1020"));
  assert.equal(m.get("05 50 00").activity.code, "A1020");
  assert.equal(m.get("05 50 00").basis, "pinned by you");
});

test("work words fall back from level 3 to the level-2 group to the division", () => {
  assert.ok(termsFor("07 14 16", "COLD FLUID-APPLIED WATERPROOFING").listed.some((t) => t.includes("waterproofing")));
  assert.equal(termsFor("07 14 16", "x").key, "0710");
  assert.equal(termsFor("99 99 99", "x").key, "");
});

test("review period from Division 01 (SectionFormat and UFGS wording)", () => {
  const book = (t) => linesFromText(t);
  const a = readReviewPeriod(book("SECTION 01 33 00 - SUBMITTAL PROCEDURES\nPART 1 - GENERAL\n1.6 SUBMITTAL PROCEDURES\nA. Initial Review: Allow 15 days for initial review of each submittal.\n\fSECTION 09 91 23 - INTERIOR PAINTING\nAllow 30 days for curing before review."));
  assert.deepEqual([a.days, a.working], [15, false]);
  const b = readReviewPeriod(book("SECTION 01 33 00\nallow a review period, beginning with receipt by the approving authority, that includes at least [15] [_____] working days for submittals for QC manager approval"));
  assert.deepEqual([b.days, b.working], [15, true]);
  const c = readReviewPeriod(book("SECTION 01 33 00\nContracting Officer review will be completed within ____ days after the date of submission."));
  assert.equal(c, null); // a blank is not a number
  const d = readReviewPeriod(book("SECTION 01 33 00\nThe Architect will return submittals within fourteen (14) calendar days of receipt, after review."));
  assert.deepEqual([d.days, d.working], [14, false]);
});

test("dates: submit by = need-by - lead - review x cycles; closeout before the last finish; late at the data date", () => {
  const reg = buildRegister(linesFromText(SAMPLE_TEXT));
  const sched = scheduleRegister(reg, readXer(XER), { reviewDays: 14, cycles: 2, leadTimes: "08 71=56" });
  const by = Object.fromEntries(sched.rows.map((r) => [r.id, r]));
  // 05 50 00 needed 2026-05-04: minus 28 days.
  assert.equal(by["055000-002"].needBy, "2026-05-04");
  assert.equal(by["055000-002"].submitBy, "2026-04-06");
  // Door hardware: 2026-09-07 - 56 lead - 28 review.
  assert.equal(by["087100-002"].submitBy, "2026-06-15");
  assert.equal(by["087100-002"].leadDays, 56);
  // Closeout rows: one review period before the last finish (substantial completion 2026-10-30).
  assert.equal(by["087100-007"].phase, "Closeout");
  assert.equal(by["087100-007"].submitBy, "2026-10-16");
  assert.equal(sched.summary.late, 0);
  assert.equal(sched.reviewSource, "set by you");
  const late = scheduleRegister(reg, { ...readXer(XER), dataDate: "2026-04-20" }, { reviewDays: 14 });
  assert.ok(late.rows.find((r) => r.id === "055000-002").late);
  const csv = scheduleCsv(sched);
  assert.match(csv.split("\r\n")[0], /Submit By,Need By,Activity ID,Activity,Matched On/);
  assert.match(csv, /2026-04-06,2026-05-04,A1010,Install misc metal embeds and lintels/);
});

test("working-day arithmetic skips weekends", () => {
  assert.equal(minusDays("2026-03-09", 5, true), "2026-03-02"); // Monday minus 5 working days = previous Monday
  assert.equal(minusDays("2026-03-09", 1, true), "2026-03-06"); // Monday minus 1 = Friday
  assert.equal(minusDays("2026-03-01", 1), "2026-02-28");
});

test("CSV schedules: header aliases and date shapes", () => {
  const s = readActivityCsv("\ufeffActivity ID,Activity Name,Start,Finish\nA1,\"Doors, frames and hardware\",15-Jun-26 08:00,26-Jun-26\nA2,Paint,7/6/2026,7/17/2026\nA3,No date,,\n");
  assert.deepEqual(s.activities.map((a) => [a.code, a.name, a.start]), [["A1", "Doors, frames and hardware", "2026-06-15"], ["A2", "Paint", "2026-07-06"]]);
  assert.equal(parseDate("2026-06-15 A"), "2026-06-15");
  assert.equal(parseDate("2026-02-30"), "");
  assert.equal(parseDate("2025-03-091"), "");
  assert.throws(() => readActivityCsv("foo,bar\n1,2\n"), /name column and a start column/);
});

test("lead-time list: longest prefix wins", () => {
  assert.deepEqual(parseLeadTimes("26=90, 26 24 13=120; junk"), [["262413", 120], ["26", 90]]);
});
