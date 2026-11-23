import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate, xerText, formatDate } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { statusAsPlanned } from "./status.mjs";
import { schedule } from "./cpm.mjs";
import { collapsedAsBuilt, parseDelays, collapsedText, collapsedCsv, collapsedTableHtml, EXAMPLE_DELAYS } from "./collapse.mjs";

const plan = parseXer(EXAMPLE_XER);
const FAR = parseDate("2026-12-31 07:00");
const finished = (x) => statusAsPlanned(x, "77", FAR, { costs: false });
const lastFinish = (x) => formatDate(Math.max(...x.tables.TASK.filter((r) => r.act_end_date).map((r) => parseDate(r.act_end_date))));

test("the as-built model lands every activity on its actual dates, and an empty list moves nothing", () => {
  const done = finished(plan);
  const r = collapsedAsBuilt(done, "");
  assert.equal(r.asBuilt.reproduced, r.asBuilt.activities);
  assert.equal(r.asBuilt.modelFinish, lastFinish(done));
  assert.equal(r.all.earlierDays, 0);
  assert.equal(r.all.finish, r.asBuilt.modelFinish);
  // the in-wall inspection waited for its fixed date: an as-built gap, with the constraint named
  const g = r.asBuilt.gaps.find((x) => x.code === "A1110");
  assert.ok(g && g.days > 0 && g.constraint === "MSO");
});

test("a planted slip taken out gives back the finish without it", () => {
  const dd = parseDate("2026-04-20 07:00");
  // MEP rough-in level 1 is under way at the data date; give it 12 extra days
  const mid = schedule(plan);
  const t = [...mid.model.tasks.values()].find((x) => x.code === "A1090");
  const slipped = finished(statusAsPlanned(plan, "77", parseDate("2026-05-06 07:00"), { costs: false, slips: [{ code: "A1090", hours: 12 * 8 }] }));
  const ref = finished(statusAsPlanned(plan, "77", parseDate("2026-05-06 07:00"), { costs: false }));
  assert.ok(t && dd);
  assert.notEqual(lastFinish(slipped), lastFinish(ref));
  const r = collapsedAsBuilt(slipped, "Activity ID,Days,Party\nA1090,12,Contractor\n");
  assert.equal(r.all.finish, lastFinish(ref));
  assert.equal(r.rows[0].takenDays, 12);
  assert.equal(r.rows[0].party, "Contractor");
});

test("a planted wait taken out of the gap gives back the finish without it", () => {
  const held = { ...plan, tables: { ...plan.tables, TASK: plan.tables.TASK.map((r) => (r.task_code === "A1140" ? { ...r, cstr_type: "CS_MSOA", cstr_date: "2026-07-06 07:00" } : r)) } };
  const done = finished(held);
  const ref = finished(plan);
  assert.notEqual(lastFinish(done), lastFinish(ref));
  const r = collapsedAsBuilt(done, "Activity ID,Days,What\nA1140,,gap\n");
  assert.equal(r.all.finish, lastFinish(ref));
  assert.equal(r.rows[0].what, "gap");
  // more days than the gap holds: capped, and said so
  const r2 = collapsedAsBuilt(done, "Activity ID,Days,What\nA1140,500,gap\n");
  assert.equal(r2.all.finish, lastFinish(ref));
  assert.ok(r2.warnings.some((w) => /were taken out, not 500/.test(w)));
});

test("parties and events are each collapsed alone; concurrency is the overlap", () => {
  const done = finished(plan);
  const r = collapsedAsBuilt(done, EXAMPLE_DELAYS);
  assert.equal(r.byParty.length, 2);
  assert.equal(r.byEvent.length, 2);
  const sum = r.byParty.reduce((s, p) => s + p.earlierDays, 0);
  assert.equal(r.concurrentDays, Math.round((sum - r.all.earlierDays) * 10) / 10);
  assert.ok(r.all.earlierDays >= Math.max(...r.byParty.map((p) => p.earlierDays)));
  const text = collapsedText(r);
  assert.match(text, /but for Owner/);
  assert.match(collapsedCsv(r), /^section,id,name,party/);
  assert.match(collapsedTableHtml(r), /But for/);
});

test("the collapsed XER schedules to the same finish when read back", () => {
  const done = finished(plan);
  const r = collapsedAsBuilt(done, EXAMPLE_DELAYS);
  const back = schedule(parseXer(xerText(r.collapsedXer)), { expectedFinish: false });
  assert.equal(formatDate(back.projects.get("77").finish), r.all.finish);
  const model = schedule(parseXer(xerText(r.asBuiltXer)), { expectedFinish: false });
  assert.equal(formatDate(model.projects.get("77").finish), r.asBuilt.modelFinish);
});

test("the delay list: header-less IDs, bad days, unknown activities, gap words", () => {
  const a = parseDelays("A1060\nA1100");
  assert.deepEqual(a.rows.map((d) => [d.code, d.days, d.what]), [["A1060", null, "activity"], ["A1100", null, "activity"]]);
  const b = parseDelays("Activity ID,Days,What\nA1060,lots,activity\nA1110,3,wait before\n");
  assert.equal(b.rows[0].days, null);
  assert.ok(b.warnings.some((w) => /not a number/.test(w)));
  assert.equal(b.rows[1].what, "gap");
  const r = collapsedAsBuilt(finished(plan), "Activity ID,Days\nNOPE,3\n");
  assert.ok(r.warnings.some((w) => /NOPE is not in project/.test(w)));
  assert.equal(r.all.earlierDays, 0);
});

test("an update still in progress is modelled from its forecast, and says so", () => {
  const r = collapsedAsBuilt(plan, "");
  assert.ok(r.warnings.some((w) => /forecast dates/.test(w)));
  assert.equal(r.asBuilt.reproduced, r.asBuilt.activities);
});
