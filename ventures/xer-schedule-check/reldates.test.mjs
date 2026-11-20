// reldates.mjs: the lag P6 used, read back from the relationship dates it
// stores on every link (TASKPRED aref, arls; eval/relationship-dates-2026-11-20.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate, formatDate } from "./xer.mjs";
import { schedule, buildModel, lagCalendar } from "./cpm.mjs";
import { assess } from "./dcma.mjs";
import { relationshipLags } from "./reldates.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// the example as P6 would export it straight after scheduling: stored dates,
// and aref/arls on every link written the way P6 writes them
function scheduled() {
  const x = parseXer(EXAMPLE_XER);
  const res = schedule(x).tasks;
  x.tables.TASK = x.tables.TASK.map((r) => {
    const s = res.get(r.task_id);
    if (!s || r.status_code === "TK_Complete") return r;
    return { ...r, early_start_date: formatDate(s.remES ?? s.es), early_end_date: formatDate(s.ef), late_start_date: formatDate(s.remLS ?? s.ls), late_end_date: formatDate(s.lf), total_float_hr_cnt: String(s.tf) };
  });
  const m = buildModel(x);
  x.tables.TASKPRED = x.tables.TASKPRED.map((r) => {
    const rel = m.rels.find((q) => q.id === r.task_pred_id);
    const p = m.tasks.get(r.pred_task_id), s = m.tasks.get(r.task_id);
    if (p.status !== "TK_NotStart" || s.status !== "TK_NotStart") return { ...r, aref: "2026-04-06 07:00", arls: "2026-04-06 07:00" };
    const lc = lagCalendar(m, rel), lag = rel.lag, P = (k, t) => parseDate(t.row[k]);
    let aref, arls;
    if (r.pred_type === "PR_FS") { aref = lc.addWork(P("early_end_date", p), lag); arls = lc.subWork(P("late_start_date", s), lag); }
    if (r.pred_type === "PR_SS") { aref = lc.addWork(P("early_start_date", p), lag); arls = p.cal.subWork(lc.subWork(P("late_start_date", s), lag), p.remain); }
    if (r.pred_type === "PR_FF") { aref = s.cal.subWork(lc.addWork(P("early_end_date", p), lag), s.remain); arls = lc.subWork(P("late_end_date", s), lag); }
    return { ...r, aref: formatDate(aref), arls: formatDate(arls) };
  });
  return x;
}
const setLag = (x, id, hours) => ({ ...x, tables: { ...x.tables, TASKPRED: x.tables.TASKPRED.map((r) => (r.task_pred_id === id ? { ...r, lag_hr_cnt: String(hours) } : r)) } });
const listed = (a) => a.extra.find((e) => e.id === "edited-lags");

test("a file exported straight after scheduling: every link decodes to its own lag", () => {
  const r = relationshipLags(buildModel(scheduled()));
  assert.ok(r.checked >= 15, `checked ${r.checked}`);
  assert.deepEqual(r.links, []);
  assert.deepEqual(r.added, []);
  assert.equal(listed(assess(scheduled())), undefined);
});

test("a shortened lag, which breaks no stored date, is listed with the lag P6 used", () => {
  // 9023: Flooring -> Furniture install, FS 80 h, cut to 16 h
  const x = setLag(scheduled(), "9023", 16);
  const r = relationshipLags(buildModel(x));
  assert.deepEqual(r.links.map((l) => [l.pred.code, l.succ.code, l.lag / 60, l.was / 60, l.witnesses.join("+")]), [["A1160", "A1180", 16, 80, "aref+arls"]]);
  const l = listed(assess(x));
  assert.ok(l, "listed in the assessment");
  assert.equal(l.items[0].code, "A1180");
  assert.equal(l.items[0].lagWas, 80);
  assert.match(l.items[0].why, /lag 16 h \(2 d\); P6's own relationship dates for this link were written with a lag of 80 h \(10 d\)/);
});

test("a lengthened SS lag is read back from both dates", () => {
  // 9025: Paint -> Signage, SS 16 h, lengthened to 56 h
  const r = relationshipLags(buildModel(setLag(scheduled(), "9025", 56)));
  assert.deepEqual(r.links.map((l) => [l.rel.id, l.was / 60]), [["9025", 16]]);
});

test("a lengthened lag the stored dates break also names the old lag, and putting it back explains the differences", () => {
  const a = assess(setLag(scheduled(), "9019", 40)); // Paint -> Flooring FS 0 -> 40 h
  const l = listed(a);
  assert.deepEqual(l.items.map((i) => [i.pred, i.code, i.lagWas]), [["A1150", "A1160", 0]]);
  assert.match(l.items[0].why, /the stored dates leave 0 h .*; P6's own relationship dates for this link were written with a lag of 0 h/);
  assert.equal(l.explained, l.differ);
});

test("a link with no relationship dates, in a file whose other links have them, was added after the run", () => {
  const x = scheduled();
  x.tables.TASKPRED.push({ task_pred_id: "9999", task_id: "5019", pred_task_id: "5013", proj_id: "77", pred_proj_id: "77", pred_type: "PR_FS", lag_hr_cnt: "0", aref: "", arls: "" });
  const r = relationshipLags(buildModel(x));
  assert.deepEqual(r.added.map((l) => [l.pred.code, l.succ.code]), [["A1120", "A1180"]]);
  const l = listed(assess(x));
  assert.ok(l.items.some((i) => i.code === "A1180" && /added after the last schedule run/.test(i.why)));
});

test("a file with no relationship dates (P6 24.12 Web, converters) checks nothing", () => {
  const r = relationshipLags(buildModel(parseXer(EXAMPLE_XER)));
  assert.equal(r.checked, 0);
  assert.deepEqual(r.added, []);
});
