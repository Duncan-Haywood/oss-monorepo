import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { parseMspdi, parseXml } from "./mspdi.mjs";
import { schedule } from "./cpm.mjs";
import { mspdiText, ptHours, isoDate } from "./msproject.mjs";
import { EXAMPLE_XER } from "./example.mjs";

const xer = parseXer(EXAMPLE_XER);

test("durations and dates in MSPDI form", () => {
  assert.equal(ptHours(8), "PT8H0M0S");
  assert.equal(ptHours(0.16), "PT0H9M36S");
  assert.equal(ptHours(-16), "PT-16H0M0S");
  assert.equal(isoDate(Date.UTC(2026, 3, 6, 7, 0) / 60000), "2026-04-06T07:00:00");
});

test("the XML is well formed and every activity, WBS node and link is written", () => {
  const r = mspdiText(xer);
  const doc = parseXml(r.xml);
  const proj = doc.children.find((c) => c.name === "Project");
  assert.ok(proj);
  assert.equal(r.counts.activities, xer.tables.TASK.length);
  assert.equal(r.counts.links, xer.tables.TASKPRED.length);
  assert.equal(r.counts.resources, 2);
  assert.equal(r.counts.assignments, xer.tables.TASKRSRC.length);
  assert.match(r.xml, /<Alias>Activity ID<\/Alias>/);
  assert.match(r.xml, /<StatusDate>2026-04-06T07:00:00<\/StatusDate>/);
});

test("read back with the MSPDI reader: names, progress, constraints, lags and calendars intact", () => {
  const r = mspdiText(xer);
  const back = parseMspdi(r.xml);
  const byUid = new Map(back.tables.TASK.map((t) => [t.task_id, t]));
  for (const t of xer.tables.TASK) {
    const b = byUid.get(String(r.taskUid.get(t.task_id)));
    assert.equal(b.task_name, t.task_name);
    assert.equal(b.status_code, t.status_code, t.task_code);
    assert.equal(b.act_start_date, t.status_code === "TK_NotStart" ? "" : t.act_start_date, t.task_code);
    if (t.status_code !== "TK_Complete") assert.equal(Number(b.remain_drtn_hr_cnt), Number(t.remain_drtn_hr_cnt), t.task_code);
    if (t.cstr_type) { assert.equal(b.cstr_type, t.cstr_type); assert.equal(b.cstr_date, t.cstr_date); }
  }
  // the -16 h lead and the SS+24 h lag survive
  const lag = (code) => back.tables.TASKPRED.filter((l) => l.task_id === String(r.taskUid.get(xer.tables.TASK.find((t) => t.task_code === code).task_id))).map((l) => [l.pred_type, Number(l.lag_hr_cnt)]);
  assert.deepEqual(lag("A1090"), [["PR_FS", -16]]);
  assert.deepEqual(lag("A1060"), [["PR_SS", 24]]);
  // three holidays on the calendar, written as exceptions
  assert.equal((r.xml.match(/<Exception>/g) || []).length, 3);
});

test("the read-back schedule equals the original under Project's lag rule", () => {
  const r = mspdiText(xer);
  const back = parseMspdi(r.xml);
  const asProject = { ...xer, tables: { ...xer.tables, SCHEDOPTIONS: xer.tables.SCHEDOPTIONS.map((o) => ({ ...o, sched_calendar_on_relationship_lag: "rcal_Successor", sched_float_type: "FT_SmallestFloat" })), PROJECT: xer.tables.PROJECT.map((p) => ({ ...p, plan_end_date: "" })) } };
  const a = schedule(asProject), b = schedule(back);
  let n = 0;
  for (const t of xer.tables.TASK) {
    if (t.status_code === "TK_Complete") continue;
    const x = a.tasks.get(t.task_id), y = b.tasks.get(String(r.taskUid.get(t.task_id)));
    assert.equal(y.ef, x.ef, t.task_code);
    assert.equal(y.lf, x.lf, t.task_code);
    n++;
  }
  assert.ok(n > 15);
});

test("in-progress work: actual plus remaining, resume at P6's remaining start", () => {
  const r = mspdiText(xer);
  const task = r.xml.split("</Task>").find((c) => c.includes("<Name>Submittal review</Name>"));
  // A1030: started 2026-03-23 07:00, data date 2026-04-06 07:00 = 10 working days (80 h), 32 h left
  assert.match(task, /<ActualDuration>PT80H0M0S<\/ActualDuration>/);
  assert.match(task, /<RemainingDuration>PT32H0M0S<\/RemainingDuration>/);
  assert.match(task, /<Duration>PT112H0M0S<\/Duration>/);
  assert.match(task, /<PercentComplete>71<\/PercentComplete>/);
});

test("level of effort becomes a manual task with its links in the notes; quotes and external dates", () => {
  const x = parseXer(EXAMPLE_XER);
  const T = x.tables.TASK;
  T.push({ ...T[4], task_id: "6000", task_code: "LOE1", task_name: 'Site "supervision"', task_type: "TT_LOE", status_code: "TK_NotStart", early_start_date: "2026-04-06 07:00", early_end_date: "2026-04-17 15:30" });
  x.tables.TASKPRED.push({ task_pred_id: "9900", task_id: "6000", pred_task_id: "5004", proj_id: "77", pred_proj_id: "77", pred_type: "PR_SS", lag_hr_cnt: "0" });
  T[5].task_name = 'Procure ""doors""';
  T[6].external_early_start_date = "2026-05-04 07:00";
  T[6].external_late_end_date = "2026-06-30 15:30";
  const r = mspdiText(x);
  const loe = r.xml.split("</Task>").find((c) => c.includes("supervision"));
  assert.match(loe, /<Manual>1<\/Manual>/);
  assert.match(loe, /<Notes>P6 level of effort activity LOE1; its P6 relationships: SS from A1030<\/Notes>/);
  assert.doesNotMatch(loe, /<PredecessorLink>/);
  assert.match(r.xml, /<Name>Procure &quot;doors&quot;<\/Name>/);
  const ext = r.xml.split("</Task>").find((c) => c.includes(`<Value>${T[6].task_code}</Value>`));
  assert.match(ext, /<ConstraintType>4<\/ConstraintType>/);
  assert.match(ext, /<ConstraintDate>2026-05-04T07:00:00<\/ConstraintDate>/);
  assert.match(ext, /<Deadline>2026-06-30T15:30:00<\/Deadline>/);
  assert.ok(r.warnings.some((w) => /level of effort/.test(w)));
  assert.ok(r.warnings.some((w) => /external dates/.test(w)));
});

test("a multi-project file converts the project asked for, and says so", () => {
  const x = parseXer(EXAMPLE_XER);
  x.tables.PROJECT.push({ proj_id: "78", proj_short_name: "OTHER", clndr_id: "88", last_recalc_date: "2026-04-06 07:00", plan_start_date: "2026-04-06 07:00" });
  x.tables.TASK.push({ ...x.tables.TASK[4], task_id: "7000", proj_id: "78", task_code: "Z1" });
  const r = mspdiText(x);
  assert.equal(r.project.id, "77");
  assert.ok(r.warnings.some((w) => /2 projects/.test(w)));
  const o = mspdiText(x, { projId: "78" });
  assert.equal(o.counts.activities, 1);
  assert.throws(() => mspdiText(x, { projId: "nope" }), /not in the file/);
});
