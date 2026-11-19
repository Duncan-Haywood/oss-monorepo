import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { compare, compareCsv, compareText, halfStepXer } from "./compare.mjs";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";

const cur = parseXer(EXAMPLE_XER);
const prev = parseXer(EXAMPLE_PREV_XER);
const rep = compare(prev, cur);

test("a file against itself reports no change and a half-step equal to its finish", () => {
  const same = compare(cur, cur);
  assert.equal(same.flags.length, 0);
  assert.equal(same.finish.moved, 0);
  assert.equal(same.finish.halfStep, same.current.finish);
  assert.equal(same.finish.progressEffect, 0);
  assert.equal(same.finish.revisionEffect, 0);
});

test("the example pair: every planted change is reported, and only those", () => {
  assert.deepEqual(rep.progress.actualsEdited.map((x) => [x.code, x.field, x.days]), [["A1010", "actual finish", 1]]);
  assert.deepEqual(rep.progress.started.map((x) => x.code), ["A1030", "A1050"]);
  assert.deepEqual(rep.progress.finished.map((x) => [x.code, x.daysLate]), [["A1020", 3]]);
  assert.deepEqual(rep.durations.origChanged.map((x) => [x.code, x.was, x.now]), [["A1040", 40, 50], ["A1150", 10, 8]]);
  assert.deepEqual(rep.constraints.map((x) => [x.code, x.was, x.now]), [["A1110", "none", "start on 2026-05-18 07:00"]]);
  assert.deepEqual(rep.logic.lagChanged.map((x) => [x.pred, x.succ, x.wasLagDays, x.lagDays]), [["A1160", "A1180", 5, 10]]);
  assert.deepEqual(rep.logic.typeChanged.map((x) => [x.pred, x.succ, x.was, x.now]), [["A1050", "A1060", "FS", "SS +3d"]]);
  assert.deepEqual(rep.logic.added.map((x) => `${x.pred}>${x.succ}`).sort(), ["A1150>A1190", "A1200>M1210"]);
  assert.deepEqual(rep.logic.deleted.map((x) => `${x.pred}>${x.succ}:${x.bothRemain}`).sort(), ["A1160>A1190:true", "A1200>A1205:false", "A1205>M1210:false"]);
  assert.deepEqual(rep.activities.deleted.map((x) => x.code), ["A1205"]);
  assert.deepEqual(rep.activities.added, []);
  assert.deepEqual(rep.activities.renamed.map((x) => x.code), ["A1190"]);
  assert.deepEqual(rep.calendars, []);
  assert.deepEqual(rep.progress.reversed, []);
  assert.equal(rep.period.workingDays, 20);
});

test("the half-step splits the finish movement into progress and revisions that add up", () => {
  const f = rep.finish;
  assert.ok(f.halfStep);
  assert.equal(Math.round((f.progressEffect + f.revisionEffect) * 10) / 10, f.moved);
  assert.equal(f.moved, 15);
  assert.equal(f.progressEffect, 6);
  assert.equal(f.revisionEffect, 9);
  // the half-step file keeps last month's logic and takes this month's progress
  const h = halfStepXer(prev, cur, "77", "77");
  const t = (x, code) => x.tables.TASK.find((r) => r.task_code === code);
  assert.equal(t(h, "A1030").status_code, "TK_Active");
  assert.equal(t(h, "A1040").target_drtn_hr_cnt, t(prev, "A1040").target_drtn_hr_cnt);
  assert.ok(t(h, "A1205"), "an activity deleted this month stays in the half-step");
  assert.equal(h.tables.PROJECT[0].last_recalc_date, "2026-04-06 07:00");
});

test("flags rank the serious changes first", () => {
  assert.equal(rep.flags[0].severity, "high");
  assert.match(rep.flags[0].text, /Actual dates changed/);
  const t = (s) => rep.flags.find((f) => f.text.startsWith(s))?.count;
  assert.equal(t("Relationships deleted on the critical path"), 1);
  assert.equal(t("Original durations shortened on critical activities"), 1);
});

test("swapped files and equal data dates are warned about", () => {
  assert.ok(compare(cur, prev).warnings.some((w) => /wrong way round/.test(w)));
  assert.ok(compare(prev, prev).warnings.some((w) => /same data date/.test(w)));
});

test("an actual date after the data date and reversed progress are flagged", () => {
  const x = parseXer(EXAMPLE_XER);
  const row = (code) => x.tables.TASK.find((r) => r.task_code === code);
  row("A1060").status_code = "TK_Active";
  row("A1060").act_start_date = "2026-04-08 07:00";
  row("A1020").status_code = "TK_Active";
  row("A1020").act_end_date = "";
  row("A1020").remain_drtn_hr_cnt = "8";
  const r = compare(cur, x);
  assert.deepEqual(r.progress.futureActuals.map((f) => f.code), ["A1060"]);
  assert.deepEqual(r.progress.reversed.map((f) => [f.code, f.now]), [["A1020", "in progress"]]);
});

test("text and CSV carry the changes", () => {
  const text = compareText(rep);
  assert.match(text, /\+15 working days/);
  assert.match(text, /progress \+6 working days, revisions \+9 working days/);
  assert.match(text, /A1010 Site survey/);
  const csv = compareCsv(rep).trim().split("\n");
  assert.equal(csv[0], "section,activity,name,was,now,detail");
  assert.ok(csv.some((l) => l.startsWith("actual date edited,A1010,")));
  assert.ok(csv.some((l) => l.startsWith("relationship deleted,A1160 -> A1190,")));
  assert.ok(csv.some((l) => l.startsWith("constraint changed,A1110,")));
});
