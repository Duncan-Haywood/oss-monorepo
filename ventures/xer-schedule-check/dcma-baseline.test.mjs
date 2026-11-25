// DCMA points 11 (missed tasks) and 14 (BEI) against a baseline file.
// Quality audit 2026-11-19 (portfolio/quality/audits/2026-11-19-xer-schedule-check.json,
// defect 0): with only the file's planned dates, overdue work that has not
// started is never due, because P6 resets a not-started activity's planned
// dates to its early dates on every schedule run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate } from "./xer.mjs";
import { assess } from "./dcma.mjs";
import { gao } from "./gao.mjs";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";

const point = (r, id) => r.checks.find((c) => c.id === id);
const counted = (t) => t.task_type !== "TT_LOE" && t.task_type !== "TT_WBS" && t.task_type !== "TT_Mile" && t.task_type !== "TT_FinMile";

test("an unstarted activity re-synced by P6 is missed against the baseline, not against planned dates", () => {
  const cur = parseXer(EXAMPLE_XER);
  const dd = assess(cur).project.dataDate;
  // a not-started activity whose planned finish P6 has moved to its (future)
  // early finish, as it does on every schedule run
  const row = cur.tables.TASK.find((t) => counted(t) && t.status_code === "TK_NotStart");
  row.target_end_date = "2027-01-04 17:00";
  assert.ok(row.target_end_date > dd);
  const base = parseXer(EXAMPLE_XER);
  for (const t of base.tables.TASK) if (t.task_code === row.task_code) { t.early_end_date = "2000-01-03 17:00"; t.act_end_date = ""; }
  const own = assess(cur);
  assert.ok(!point(own, 11).items.some((i) => i.code === row.task_code));
  assert.equal(own.baseline.source, "planned dates");
  assert.match(point(own, 11).note, /No baseline file given/);
  const withBase = assess(cur, { baseline: base });
  const miss = point(withBase, 11).items.find((i) => i.code === row.task_code);
  assert.ok(miss, "the re-synced activity is missed against the baseline");
  assert.match(miss.why, /^baseline finish 2000-01-03.*not finished$/);
  assert.equal(withBase.baseline.source, "file");
  assert.match(point(withBase, 11).note, /against the baseline file/);
  assert.equal(point(withBase, 11).total, point(own, 11).total + 1);
});

test("everything due on the baseline: missed = all unfinished or late, BEI = finished / counted", () => {
  const cur = parseXer(EXAMPLE_XER);
  const base = parseXer(EXAMPLE_XER);
  for (const t of base.tables.TASK) { t.early_end_date = "2000-01-03 17:00"; t.act_end_date = ""; }
  const r = assess(cur, { baseline: base });
  const rows = cur.tables.TASK.filter(counted);
  assert.equal(point(r, 11).total, rows.length);
  assert.equal(point(r, 11).count, rows.length); // every finish is after 2000-01-03
  const done = rows.filter((t) => t.status_code === "TK_Complete").length;
  assert.equal(point(r, 14).value, Math.round((done / rows.length) * 1000) / 1000);
  assert.equal(point(r, 14).total, rows.length);
});

test("DCMA and GAO practice 10 agree on the same baseline file", () => {
  const cur = parseXer(EXAMPLE_XER), base = parseXer(EXAMPLE_PREV_XER);
  const r = assess(cur, { baseline: base });
  const g = gao(cur, { baseline: base });
  const t = g.practices.flatMap((p) => p.tests).find((x) => x.id === "missed-baseline");
  assert.equal(point(r, 11).count, 4);
  assert.deepEqual(point(r, 11).items.map((i) => i.code).sort(), t.items.map((i) => i.code).sort());
  assert.equal(point(r, 14).value, 0.5); // 2 finished of 4 due, as practice 10
  // activities added since the baseline are not counted as due
  assert.match(point(r, 11).note, /matched by activity ID/);
});

test("a baseline with no activities falls back to planned dates, with a warning", () => {
  const cur = parseXer(EXAMPLE_XER);
  const empty = parseXer(EXAMPLE_XER);
  empty.tables.TASK = [];
  const r = assess(cur, { baseline: empty });
  assert.equal(r.baseline.source, "planned dates");
  assert.ok(r.warnings.some((w) => /baseline file has no activities/.test(w)));
  assert.deepEqual(point(r, 11), point(assess(cur), 11));
  assert.ok(parseDate(r.project.dataDate) !== null);
});

test("a finished activity added since the baseline counts in neither BEI's numerator nor its denominator", () => {
  const cur = parseXer(EXAMPLE_XER);
  const base = parseXer(EXAMPLE_XER);
  for (const t of base.tables.TASK) { t.early_end_date = "2000-01-03 17:00"; t.act_end_date = ""; }
  const added = cur.tables.TASK.find((t) => counted(t) && t.status_code === "TK_Complete");
  base.tables.TASK = base.tables.TASK.filter((t) => t.task_code !== added.task_code);
  const rows = cur.tables.TASK.filter(counted).filter((t) => t.task_code !== added.task_code);
  const done = rows.filter((t) => t.status_code === "TK_Complete").length;
  const r = assess(cur, { baseline: base });
  assert.equal(point(r, 14).total, rows.length);
  assert.equal(point(r, 14).count, done);
  assert.equal(r.baseline.matched, r.baseline.activities - 1);
});
