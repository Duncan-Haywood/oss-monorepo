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

// ---- red team 2026-11-19: escaped mutants and two real defects

// A second project in both files: every activity of project 77 copied `copies`
// times under new IDs, so it holds more open work than the project the user picked.
function withOtherProject(x, copies = 2, where = "after") {
  const t = x.tables;
  const row = { ...t.PROJECT[0], proj_id: "88", proj_short_name: "OTHER" };
  if (where === "after") t.PROJECT.push(row); else t.PROJECT.unshift(row);
  const extra = [];
  for (let k = 1; k <= copies; k++) for (const r of t.TASK.filter((r) => r.proj_id === "77")) extra.push({ ...r, proj_id: "88", task_id: `${k}9${r.task_id}`, task_code: `X${k}${r.task_code}` });
  t.TASK.push(...extra);
  return x;
}

test("a multi-project file: the previous side follows the project picked in the current file", () => {
  const r = compare(withOtherProject(parseXer(EXAMPLE_PREV_XER)), withOtherProject(parseXer(EXAMPLE_XER)), { curProjId: "77" });
  assert.equal(r.previous.name, "OFFICE-FITOUT");
  assert.equal(r.current.name, "OFFICE-FITOUT");
  assert.deepEqual(r.activities.deleted.map((x) => x.code), ["A1205"]);
  assert.deepEqual(r.activities.added, []);
});

test("with no project picked, the one holding the most open activities is compared", () => {
  // the bigger project listed first, then a smaller one: the smaller must not win
  const small = (x) => {
    x.tables.PROJECT.push({ ...x.tables.PROJECT[0], proj_id: "99", proj_short_name: "SMALL" });
    x.tables.TASK.push({ ...x.tables.TASK.find((r) => r.task_code === "A1060"), proj_id: "99", task_id: "99001", task_code: "S1" });
    return x;
  };
  const r = compare(small(parseXer(EXAMPLE_PREV_XER)), small(parseXer(EXAMPLE_XER)));
  assert.equal(r.current.name, "OFFICE-FITOUT");
  assert.equal(r.previous.name, "OFFICE-FITOUT");
});

test("the CLI's --project picks the project in both files when comparing", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const add = (text) => text.replace("%T\tCALENDAR", "%R\t88\tOTHER\t88\t2026-04-06 07:00\t2026-03-02 07:00\t2026-07-31 15:30\t\r\n%T\tCALENDAR")
    .replace("%T\tTASKPRED", ["A", "B", "C"].map((c, i) => `%R\t8800${i}\t88\t700\t88\tTT_Task\tTK_NotStart\tO${c}\tOther ${c}\t8\t8\t\t\t\t\t\t\r\n`).join("") + "%T\tTASKPRED");
  const dir = mkdtempSync(join(tmpdir(), "xer-cli-"));
  try {
    writeFileSync(join(dir, "cur.xer"), add(EXAMPLE_XER));
    writeFileSync(join(dir, "prev.xer"), add(EXAMPLE_PREV_XER));
    const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
    const run = (...a) => spawnSync(process.execPath, [cli, join(dir, "cur.xer"), "--previous", join(dir, "prev.xer"), "--json", ...a], { encoding: "utf8" });
    const other = JSON.parse(run("--project", "OTHER").stdout);
    assert.equal(other.current.name, "OTHER");
    assert.equal(other.previous.name, "OTHER");
    assert.equal(other.current.activities, 3);
    assert.equal(run("--project", "NOPE").status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CSV: a name from the contractor's file that a spreadsheet would run is written as text", () => {
  const x = parseXer(EXAMPLE_XER);
  x.tables.TASK.find((r) => r.task_code === "A1190").task_name = '=HYPERLINK("http://x.test","open")';
  x.tables.TASK.find((r) => r.task_code === "A1010").task_name = "@SUM(1)";
  const csv = compareCsv(compare(prev, x));
  assert.ok(csv.includes(`renamed,A1190,"'=HYPERLINK(""http://x.test"",""open"")"`), csv);
  assert.ok(csv.includes("actual date edited,A1010,'@SUM(1),"), csv);
});

test("deleted activities carry their duration in days, and the forecast-start misses are the ones still not started", () => {
  assert.deepEqual(rep.activities.deleted.map((x) => [x.code, x.duration, x.wasCritical]), [["A1205", 3, true]]);
  // A1030 and A1050 were forecast to start and did: they are not misses
  assert.deepEqual(rep.progress.plannedNotStarted.map((x) => x.code), ["A1040", "A1060", "A1070", "A1090"]);
  assert.deepEqual(rep.progress.plannedNotFinished.map((x) => x.code), ["A1030", "A1050", "A1060"]);
});

test("a type change on the last deleted link is still read as a type change", () => {
  const x = parseXer(EXAMPLE_XER);
  // the last relationship in the file: A1150 -> A1190 SS +2d becomes FS
  const last = x.tables.TASKPRED[x.tables.TASKPRED.length - 1];
  last.pred_type = "PR_FS";
  const r = compare(cur, x);
  assert.deepEqual(r.logic.typeChanged.map((t) => [t.pred, t.succ, t.was, t.now]), [["A1150", "A1190", "SS +2d", "FS +2d"]]);
  assert.deepEqual(r.logic.added, []);
  assert.deepEqual(r.logic.deleted, []);
});

test("agreement counts, the project name fallback and a calendar with no hours per day", () => {
  assert.deepEqual(rep.previous.agreement, { compared: 0, matched: 0 });
  // stored early finishes: one that agrees with the recomputed date, one that does not
  const x = parseXer(EXAMPLE_XER);
  const same = compare(cur, cur);
  const ef = (code) => same.float.rows.find((r) => r.code === code)?.finishNow;
  x.tables.TASK.find((r) => r.task_code === "A1060").early_end_date = ef("A1060");
  x.tables.TASK.find((r) => r.task_code === "A1070").early_end_date = "2030-01-01 07:00";
  assert.deepEqual(compare(cur, x).current.agreement, { compared: 2, matched: 1 });
  // no proj_short_name: the name is empty, not undefined
  const n = parseXer(EXAMPLE_XER);
  delete n.tables.PROJECT[0].proj_short_name;
  assert.equal(compare(n, n).current.name, "");
  // a calendar row without day_hr_cnt reads as an 8-hour day
  const strip = (s) => { const y = parseXer(s); for (const c of y.tables.CALENDAR) delete c.day_hr_cnt; return y; };
  const r = compare(strip(EXAMPLE_PREV_XER), strip(EXAMPLE_XER));
  assert.equal(r.period.workingDays, 20);
  assert.equal(r.finish.moved, 15);
  assert.deepEqual(r.logic.lagChanged.map((l) => [l.wasLagDays, l.lagDays]), [[5, 10]]);
});
