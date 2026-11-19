// "Durations edited after the last schedule run" (dcma.mjs): a not-started
// activity whose stored early dates span a different amount of work than its
// remaining duration. Found on Harbour Pointe (P6 17.12), where 8 such edits
// explain all 25 stored-date differences (eval/edited-durations-2026-11-19.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, formatDate } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { assess } from "./dcma.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// the example as P6 would export it straight after scheduling: every open
// activity carries the early and late dates and float the logic gives
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
const edit = (x, code, hours) => ({ ...x, tables: { ...x.tables, TASK: x.tables.TASK.map((r) => (r.task_code === code ? { ...r, remain_drtn_hr_cnt: String(hours) } : r)) } });
const listed = (a) => a.extra.find((e) => e.id === "edited-durations");

test("a file exported straight after scheduling lists no edited durations", () => {
  const a = assess(scheduled());
  assert.equal(a.recompute.matched, a.recompute.compared);
  assert.equal(listed(a), undefined);
});

test("a duration changed without rescheduling is named, and accounts for the differences it causes", () => {
  const a = assess(edit(scheduled(), "A1090", 136)); // MEP rough-in, level 1: 12 d -> 17 d
  const l = listed(a);
  assert.ok(l, "listed");
  assert.deepEqual(l.items.map((i) => i.code), ["A1090"]);
  assert.match(l.items[0].why, /remaining duration 17 d; the stored dates .* span 12 d/);
  const differ = a.recompute.compared - a.recompute.matched;
  assert.ok(differ > 0);
  assert.equal(l.differ, differ);
  assert.equal(l.explained, differ);
  assert.ok(a.recompute.items.every((i) => /agrees once the edited durations are put back/.test(i.why)));
});

test("a shortened duration and a started activity: only the unstarted edit is listed", () => {
  // A1050 is in progress; its remaining duration changes with progress, not by edit
  const a = assess(edit(edit(scheduled(), "A1150", 40), "A1050", 8));
  assert.deepEqual(listed(a).items.map((i) => i.code), ["A1150"]);
});

test("a difference the edits do not cause is left unexplained", () => {
  const x = edit(scheduled(), "A1160", 80);
  // a stored late date typed by hand on another activity
  x.tables.TASK = x.tables.TASK.map((r) => (r.task_code === "A1040" ? { ...r, late_end_date: "2026-12-31 15:30" } : r));
  const l = listed(assess(x));
  assert.deepEqual(l.items.map((i) => i.code), ["A1160"]);
  assert.equal(l.explained, l.differ - 1);
});
