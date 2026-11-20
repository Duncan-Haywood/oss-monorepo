// "Lags edited after the last schedule run" (dcma.mjs): a link whose lag is
// longer than the working time the stored dates leave for it. Found on CCA
// (P6 6.0), where one 608 h lag with room for 440 h accounts for the file's
// two stored-date differences (eval/edited-lags-2026-11-19.md; that lag's
// relationship date shows P6 used 608 h, eval/relationship-dates-2026-11-20.md).
// Lags changed and read back from the relationship dates: reldates.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, formatDate } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { assess } from "./dcma.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// the example as P6 would export it straight after scheduling
function scheduled() {
  const x = parseXer(EXAMPLE_XER);
  const res = schedule(x).tasks;
  x.tables.TASK = x.tables.TASK.map((r) => {
    const s = res.get(r.task_id);
    if (!s || r.status_code === "TK_Complete") return r;
    return { ...r, early_start_date: formatDate(s.remES ?? s.es), early_end_date: formatDate(s.ef), late_start_date: formatDate(s.remLS ?? s.ls), late_end_date: formatDate(s.lf), total_float_hr_cnt: String(s.tf) };
  });
  return x;
}
const setLag = (x, id, hours) => ({ ...x, tables: { ...x.tables, TASKPRED: x.tables.TASKPRED.map((r) => (r.task_pred_id === id ? { ...r, lag_hr_cnt: String(hours) } : r)) } });
const listed = (a) => a.extra.find((e) => e.id === "edited-lags");

test("a file exported straight after scheduling lists no edited lags", () => {
  const a = assess(scheduled());
  assert.equal(a.recompute.matched, a.recompute.compared);
  assert.equal(listed(a), undefined);
});

test("a lag lengthened without rescheduling is named, and accounts for the differences it causes", () => {
  // 9019: Paint -> Flooring, FS 0; lengthened to 40 h (5 d)
  const a = assess(setLag(scheduled(), "9019", 40));
  const l = listed(a);
  assert.ok(l, "listed");
  assert.deepEqual(l.items.map((i) => [i.pred, i.code]), [["A1150", "A1160"]]);
  assert.match(l.items[0].why, /FS link from A1150, lag 40 h \(5 d\); the stored dates leave 0 h \(0 d\) after A1150 early finish/);
  const differ = a.recompute.compared - a.recompute.matched;
  assert.ok(differ > 0);
  assert.equal(l.differ, differ);
  assert.equal(l.explained, differ);
  assert.ok(a.recompute.items.every((i) => /agrees once the edited lags are put back/.test(i.why)));
});

test("a lag lengthened within the successor's slack still eats the predecessor's float, and is named from the late dates", () => {
  // 9023: Flooring -> Furniture install (by owner), FS 80 h; Furniture has float, so a longer lag moves no early date
  const base = scheduled();
  const furn = base.tables.TASK.find((r) => r.task_code === "A1180");
  assert.ok(Number(furn.total_float_hr_cnt) > 16, "furniture has float to absorb the edit");
  const a = assess(setLag(base, "9023", 96));
  const l = listed(a);
  assert.ok(l, "listed");
  assert.deepEqual(l.items.map((i) => i.code), ["A1180"]);
  assert.equal(l.explained, l.differ);
});

test("a shortened lag breaks no link and is not listed as lengthened", () => {
  const a = assess(setLag(scheduled(), "9005", 40)); // 120 h -> 40 h
  assert.equal(listed(a), undefined);
});

test("a difference the lags do not cause is left unexplained, and a typed late date that breaks a link is named as one", () => {
  const x = setLag(scheduled(), "9019", 40);
  // a stored late date typed by hand: Procure doors now "finishes late" after Hang doors must start
  x.tables.TASK = x.tables.TASK.map((r) => (r.task_code === "A1040" ? { ...r, late_end_date: "2026-12-31 15:30" } : r));
  const l = listed(assess(x));
  assert.deepEqual(l.items.map((i) => [i.pred, i.code]), [["A1150", "A1160"], ["A1040", "A1170"]]);
  assert.match(l.items[1].why, /break it even with no lag .* between A1040's stored late finish 2026-12-31 15:30/);
  assert.equal(l.explained, l.differ - 1);
});
