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

// activity codes -> Text2..Text30 and back
function withCodes(types) {
  const x = parseXer(EXAMPLE_XER);
  const T = x.tables;
  T.ACTVTYPE = []; T.ACTVCODE = []; T.TASKACTV = [];
  types.forEach((ty, k) => {
    const tid = `T${k + 1}`;
    T.ACTVTYPE.push({ actv_code_type_id: tid, actv_code_type: ty.name, actv_code_type_scope: ty.scope || "AS_Global", seq_num: String(k), proj_id: "" });
    for (const c of ty.codes) T.ACTVCODE.push({ actv_code_id: `${tid}-${c.id}`, actv_code_type_id: tid, short_name: c.code, actv_code_name: c.name || "", parent_actv_code_id: c.parent ? `${tid}-${c.parent}` : "" });
    T.TASK.forEach((t, i) => { const c = ty.pick(i); if (c) T.TASKACTV.push({ task_id: t.task_id, actv_code_type_id: tid, actv_code_id: `${tid}-${c}`, proj_id: t.proj_id }); });
  });
  return x;
}
const extAttr = (xml, uid, fid) => { const m = xml.match(new RegExp(`<Task><UID>${uid}</UID>[\\s\\S]*?</Task>`)); const v = m && m[0].match(new RegExp(`<FieldID>${fid}</FieldID><Value>([^<]*)</Value>`)); return v ? v[1] : null; };

test("activity codes become named text fields and read back as codes", () => {
  const x = withCodes([
    { name: "Phase", codes: [{ id: "d", code: "DES", name: "Design" }, { id: "c", code: "CON", name: "Construction" }], pick: (i) => (i % 2 ? "c" : "d") },
    { name: "Area [A]", codes: [{ id: "n", code: "N", name: "" }], pick: (i) => (i < 3 ? "n" : null) },
  ]);
  const r = mspdiText(x);
  assert.equal(r.counts.codeTypes, 2);
  assert.equal(r.counts.codeAssignments, x.tables.TASK.length + 3);
  assert.match(r.xml, /<FieldID>188743734<\/FieldID><FieldName>Text2<\/FieldName><Alias>Phase<\/Alias>/);
  // brackets are kept out of Project field names
  assert.match(r.xml, /<FieldName>Text3<\/FieldName><Alias>Area \(A\)<\/Alias>/);
  const t0 = x.tables.TASK[0];
  assert.equal(extAttr(r.xml, r.taskUid.get(t0.task_id), "188743734"), "DES");
  const back = parseMspdi(r.xml);
  const types = back.tables.ACTVTYPE.map((t) => t.actv_code_type);
  assert.deepEqual(types, ["Phase", "Area (A)"]);
  const phase = back.tables.ACTVTYPE[0].actv_code_type_id;
  const codeOf = (taskId) => { const a = back.tables.TASKACTV.find((z) => z.task_id === String(r.taskUid.get(taskId)) && z.actv_code_type_id === phase); return back.tables.ACTVCODE.find((c) => c.actv_code_id === a.actv_code_id).short_name; };
  x.tables.TASK.forEach((t, i) => assert.equal(codeOf(t.task_id), i % 2 ? "CON" : "DES"));
  assert.ok(!r.warnings.some((w) => /activity code assignment/.test(w)));
});

test("with codeNames the description travels too and splits back", () => {
  const x = withCodes([{ name: "Phase", codes: [{ id: "d", code: "DES", name: "Design" }, { id: "x", code: "X", name: "" }], pick: (i) => (i % 3 ? "d" : "x") }]);
  const r = mspdiText(x, { codeNames: true });
  assert.equal(extAttr(r.xml, r.taskUid.get(x.tables.TASK[1].task_id), "188743734"), "DES - Design");
  assert.equal(extAttr(r.xml, r.taskUid.get(x.tables.TASK[0].task_id), "188743734"), "X");
  const back = parseMspdi(r.xml);
  const codes = back.tables.ACTVCODE.map((c) => [c.short_name, c.actv_code_name]).sort();
  assert.deepEqual(codes, [["DES", "Design"], ["X", "X"]]);
});

test("a leaf code repeated under two parents is written as its path", () => {
  const x = withCodes([{ name: "Area", codes: [{ id: "a", code: "A" }, { id: "b", code: "B" }, { id: "a1", code: "001", parent: "a" }, { id: "b1", code: "001", parent: "b" }], pick: (i) => (i % 2 ? "a1" : "b1") }]);
  const r = mspdiText(x);
  assert.equal(extAttr(r.xml, r.taskUid.get(x.tables.TASK[0].task_id), "188743734"), "B.001");
  assert.equal(extAttr(r.xml, r.taskUid.get(x.tables.TASK[1].task_id), "188743734"), "A.001");
  assert.ok(r.warnings.some((w) => /whole path/.test(w)));
  assert.equal(parseMspdi(r.xml).tables.ACTVCODE.length, 2);
});

test("past 29 code types the most assigned are kept and the rest counted", () => {
  const types = Array.from({ length: 31 }, (_, k) => ({ name: `Code ${k + 1}`, codes: [{ id: "v", code: "V" }], pick: (i) => (k < 2 ? (i === 0 ? "v" : null) : "v") }));
  const x = withCodes(types);
  const r = mspdiText(x);
  assert.equal(r.counts.codeTypes, 29);
  assert.ok(!/Alias>Code 1</.test(r.xml) && !/Alias>Code 2</.test(r.xml));
  assert.match(r.xml, /<FieldID>188744016<\/FieldID><FieldName>Text30<\/FieldName>/);
  assert.ok(r.warnings.some((w) => /left out: Code 1 \(1\), Code 2 \(1\)/.test(w)));
  assert.ok(r.warnings.some((w) => /2 activity code assignment\(s\) of the 2 code type/.test(w)));
});

test("duplicate code type names stay apart in Project", () => {
  const x = withCodes([
    { name: "Phase", codes: [{ id: "v", code: "1" }], pick: () => "v" },
    { name: "phase", scope: "AS_Project", codes: [{ id: "v", code: "2" }], pick: () => "v" },
  ]);
  const r = mspdiText(x);
  assert.match(r.xml, /<Alias>Phase \(T1\)<\/Alias>/);
  assert.match(r.xml, /<Alias>phase \(T2\)<\/Alias>/);
});
