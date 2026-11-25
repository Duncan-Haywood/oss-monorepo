// reldates.mjs: the lag P6 used, read back from the relationship dates it
// stores on every link (TASKPRED aref, arls; eval/relationship-dates-2026-11-20.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate, formatDate } from "./xer.mjs";
import { schedule, buildModel, lagCalendar } from "./cpm.mjs";
import { assess } from "./dcma.mjs";
import { relationshipLags, unspentLag } from "./reldates.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// the example as P6 would export it straight after scheduling: stored dates,
// and aref/arls on every link written the way P6 writes them
function scheduled(x = parseXer(EXAMPLE_XER)) {
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
    // into a finished activity: nothing reads these dates
    if (s.status === "TK_Complete") return { ...r, aref: "2026-04-06 07:00", arls: "2026-04-06 07:00" };
    // a started end: the dates carry only the lag unspent at the data date
    // (eval/relationship-dates-started-2026-11-24.md)
    const lc = lagCalendar(m, rel), lag = unspentLag(m, rel, p, s).eff, P = (k, t) => parseDate(t.row[k]);
    const done = p.status === "TK_Complete", rem = done ? 0 : p.remain;
    let aref = null, arls;
    if (r.pred_type === "PR_FS") { if (!done) aref = lc.addWork(P("early_end_date", p), lag); arls = lc.subWork(P("late_start_date", s), lag); }
    if (r.pred_type === "PR_SS") { if (!done) aref = lc.addWork(P("early_start_date", p), lag); arls = p.cal.subWork(lc.subWork(P("late_start_date", s), lag), rem); }
    if (r.pred_type === "PR_FF") { if (!done) aref = s.cal.subWork(lc.addWork(P("early_end_date", p), lag), s.remain); arls = lc.subWork(P("late_end_date", s), lag); }
    return { ...r, aref: aref === null ? "" : formatDate(aref), arls: formatDate(arls) };
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
  // the links with a started end decode too, against the lag still unspent
  assert.equal(r.started.checked, 6);
  assert.equal(r.started.agree.size, 6);
  assert.deepEqual([...r.started.was, ...r.started.atMost], []);
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

// Links with a started end (eval/relationship-dates-started-2026-11-24.md):
// P6 writes their dates with only the lag still unspent at the data date.
const lagSet = (x, id, hours) => setLag(x, id, hours); // before scheduling: the lag P6 used

test("an in-progress predecessor's FS lag changed after the run reads back exactly (nothing of it was spent)", () => {
  // 9004: A1030 (in progress) -> A1040, FS 0 h, given 24 h
  const x = setLag(scheduled(), "9004", 24);
  const r = relationshipLags(buildModel(x));
  assert.deepEqual(r.started.was.map((l) => [l.pred.code, l.succ.code, l.lag / 60, l.was / 60]), [["A1030", "A1040", 24, 0]]);
  assert.deepEqual(r.started.atMost, []);
  const l = listed(assess(x));
  assert.ok(l.items.some((i) => i.code === "A1040" && i.lagWas === 0 && /written with a lag of 0 h/.test(i.why)));
});

test("an SS lag partly unspent at the run reads back exactly from a started predecessor", () => {
  // 9006: A1050 (started 40 working hours before the data date) -> A1060;
  // scheduled with SS 64 h (24 h unspent), then edited to 80 h
  const x = setLag(scheduled(lagSet(parseXer(EXAMPLE_XER), "9006", 64)), "9006", 80);
  const r = relationshipLags(buildModel(x));
  assert.deepEqual(r.started.was.map((l) => [l.rel.id, l.lag / 60, l.was / 60]), [["9006", 80, 64]]);
});

test("a lag fully spent at the run and lengthened since is bounded by the work already spent", () => {
  // 9006: SS 24 h, all spent (40 h since A1050's actual start); given 64 h,
  // so 24 h would now be unspent: the old lag was at most 40 h
  const x = setLag(scheduled(), "9006", 64);
  const r = relationshipLags(buildModel(x));
  assert.deepEqual(r.started.was, []);
  assert.deepEqual(r.started.atMost.map((l) => [l.rel.id, l.lag / 60, l.atMost / 60]), [["9006", 64, 40]]);
  const l = listed(assess(x));
  const it = l.items.find((i) => i.code === "A1060");
  assert.equal(it.lagWasAtMost, 40);
  assert.equal(it.lagWas, null);
  assert.match(it.why, /none of the lag left at the data date, so at the last schedule run the lag was at most 40 h \(5 d\), the working time already spent since A1050's actual start/);
});

test("a finished predecessor's FS lag into an in-progress activity: the same bound", () => {
  // 9005: M1000 (finished 200 working hours before the data date) -> A1050
  // (in progress), FS 120 h, all spent; lengthened to 280 h
  const r = relationshipLags(buildModel(setLag(scheduled(), "9005", 280)));
  assert.deepEqual(r.started.atMost.map((l) => [l.pred.code, l.succ.code, l.atMost / 60]), [["M1000", "A1050", 200]]);
});

test("a change that leaves no lag unspent either way is invisible, and not listed", () => {
  // 9006: SS 24 h -> 32 h, both under the 40 h already spent
  const x = setLag(scheduled(), "9006", 32);
  const r = relationshipLags(buildModel(x));
  assert.deepEqual([...r.started.was, ...r.started.atMost], []);
  assert.ok(r.started.agree.has("9006"));
});

test("an SF link decodes too: aref is the successor's early start, arls a late finish less the predecessor's duration", () => {
  // the shape of CCA's and the hotel file's SF links (eval/p6-probes-2026-11-24.md):
  // add one between two unstarted activities, with the dates P6 would write
  const x0 = scheduled();
  const m0 = buildModel(x0);
  const open = [...m0.tasks.values()].filter((t) => t.status === "TK_NotStart" && !t.span && t.remain > 0);
  const [p, s] = [open[0], open[open.length - 1]];
  const lag = 16 * 60, lc = p.cal, P = (k, t) => parseDate(t.row[k]);
  const aref = s.cal.subWork(lc.addWork(P("early_start_date", p), lag), s.remain);
  const arls = p.cal.subWork(lc.subWork(P("late_end_date", s), lag), p.remain);
  const row = { task_pred_id: "sf1", task_id: s.id, pred_task_id: p.id, proj_id: s.proj, pred_proj_id: p.proj, pred_type: "PR_SF", lag_hr_cnt: "16", aref: formatDate(aref), arls: formatDate(arls) };
  const x = { ...x0, tables: { ...x0.tables, TASKPRED: [...x0.tables.TASKPRED, row] } };
  const before = relationshipLags(buildModel(x0)).checked;
  const r = relationshipLags(buildModel(x));
  assert.equal(r.checked, before + 1);
  assert.deepEqual(r.links, []);
  // the lag lengthened after the run reads back as the 16 h P6 used, on both dates
  const r2 = relationshipLags(buildModel(setLag(x, "sf1", 40)));
  assert.deepEqual(r2.links.map((l) => [l.rel.id, l.lag / 60, l.was / 60, l.witnesses.join("+")]), [["sf1", 40, 16, "aref+arls"]]);
});

test("an SF lag is spent from the predecessor's actual start", () => {
  const m = buildModel(scheduled());
  const started = [...m.tasks.values()].find((t) => t.status === "TK_Active" && t.actStart !== null);
  const succ = [...m.tasks.values()].find((t) => t.status === "TK_NotStart" && !t.span);
  const rel = { id: "sf", predId: started.id, succId: succ.id, type: "PR_SF", lag: 400 * 60 };
  const u = unspentLag(m, rel, started, succ);
  const dd = m.projects.get(succ.proj).dataDate;
  assert.ok(u.spent > 0, "some of it ran before the data date");
  assert.equal(u.spent, lagCalendar(m, rel).workBetween(started.actStart, dd));
  assert.equal(u.eff, rel.lag - u.spent);
});
