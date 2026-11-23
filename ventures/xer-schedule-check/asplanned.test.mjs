import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate, formatDate } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { statusAsPlanned, cloneXer } from "./status.mjs";
import { schedule } from "./cpm.mjs";
import { asPlannedVsAsBuilt, delaySteps, asPlannedText, asPlannedCsv, asPlannedTableHtml } from "./asplanned.mjs";

const plan = parseXer(EXAMPLE_XER);
const FAR = parseDate("2026-12-31 07:00");
const finished = (x) => statusAsPlanned(x, "77", FAR, { costs: false });

test("a job built exactly to plan has no delay and no step", () => {
  const r = asPlannedVsAsBuilt(finished(plan), plan);
  assert.equal(r.delayDays, 0);
  assert.equal(r.sum, 0);
  assert.ok(r.path.length > 3);
  assert.ok(r.path.every((x) => !x.waitDays && !x.durationDays && !x.added));
  assert.deepEqual(delaySteps(r), []);
});

test("a slipped activity shows as a longer duration, the planned gap it used up as negative, and the steps add to the delay", () => {
  const slipped = finished(statusAsPlanned(plan, "77", parseDate("2026-05-06 07:00"), { costs: false, slips: [{ code: "A1090", hours: 12 * 8 }] }));
  const r = asPlannedVsAsBuilt(slipped, plan);
  assert.ok(r.delayDays > 0);
  assert.equal(r.sum, r.delayDays);
  const steps = delaySteps(r);
  assert.equal(steps[0].code, "A1090");
  assert.equal(steps[0].kind, "longer duration");
  // the inspection was fixed for a date: the slack the plan had before it was used up
  const used = steps.find((s) => s.code === "A1110");
  assert.ok(used && used.days < 0 && used.kind === "planned gap used up");
  assert.ok(steps.filter((s) => s.days > 0).every((s) => s.code === "A1090"));
  assert.ok(r.overruns.some((o) => o.code === "A1090" && o.onPath));
});

test("a wait planted before an activity is a late start of exactly that many days", () => {
  // hold the level 1 drywall (A1120) 6 working days past its early start
  const run = schedule(plan);
  const t = [...run.model.tasks.values()].find((x) => x.code === "A1120");
  const r0 = run.tasks.get(t.id);
  const held = cloneXer(plan);
  const row = held.tables.TASK.find((x) => x.task_code === "A1120");
  row.cstr_type = "CS_MSOA"; row.cstr_date = formatDate(t.cal.nextStart(t.cal.addWork(r0.remES ?? r0.es, 6 * 8 * 60)));
  const r = asPlannedVsAsBuilt(finished(held), plan);
  const step = r.path.find((x) => x.code === "A1120");
  assert.equal(step.waitDays, 6);
  assert.equal(r.delayDays, r.sum);
  assert.deepEqual(delaySteps(r).filter((s) => s.days > 0).map((s) => s.code), ["A1120"]);
});

test("added and deleted activities are named; the step across added work lands on the next planned activity", () => {
  const slipped = finished(statusAsPlanned(plan, "77", parseDate("2026-05-06 07:00"), { costs: false, slips: [{ code: "A1090", hours: 12 * 8 }] }));
  const renamed = cloneXer(slipped);
  renamed.tables.TASK.find((x) => x.task_code === "A1090").task_code = "A1095";
  const r = asPlannedVsAsBuilt(renamed, plan);
  assert.ok(r.added.some((a) => a.code === "A1095" && a.onPath));
  assert.ok(r.deleted.some((d) => d.code === "A1090"));
  const after = r.path.find((x) => x.through.includes("A1095"));
  assert.ok(after && after.waitDays > 0);
  assert.equal(r.sum, r.delayDays);
});

test("text, CSV and HTML carry the path and the sum, and the CSV keeps formulas as text", () => {
  const slipped = finished(statusAsPlanned(plan, "77", parseDate("2026-05-06 07:00"), { costs: false, slips: [{ code: "A1090", hours: 12 * 8 }] }));
  const x = cloneXer(slipped);
  x.tables.TASK.find((t) => t.task_code === "A1090").task_name = "=HYPERLINK(1)";
  const r = asPlannedVsAsBuilt(x, plan);
  assert.match(asPlannedText(r), /MIP 3\.1\/3\.2/);
  assert.match(asPlannedText(r), new RegExp(`Sum \\+${r.sum} d = delay \\+${r.delayDays} d`));
  const csv = asPlannedCsv(r);
  assert.match(csv, /'=HYPERLINK/);
  assert.ok(csv.split("\r\n").some((l) => l.startsWith("path,A1090,")));
  assert.match(asPlannedTableHtml(r), /Where the delay grew/);
  assert.doesNotMatch(asPlannedTableHtml(r), /<script|=HYPERLINK\(1\)<\/td>.*onerror/);
});

test("without a baseline, the file's own planned dates stand in, with a warning", () => {
  const x = cloneXer(finished(plan));
  const run = schedule(plan);
  for (const row of x.tables.TASK) { const r = run.tasks.get(row.task_id); if (r && !run.model.tasks.get(row.task_id).span) { row.target_start_date = formatDate(r.remES ?? r.es); row.target_end_date = formatDate(r.ef); } }
  const r = asPlannedVsAsBuilt(x, null);
  assert.equal(r.plan.source, "planned dates in the final file");
  assert.ok(r.warnings.some((w) => /Planned Start and Planned Finish stand in/.test(w)));
  assert.equal(r.sum, r.delayDays);
});
