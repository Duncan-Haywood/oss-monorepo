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

// red-team guards, 2026-11-23
const csvRows = (csv) => {
  // a small RFC 4180 reader: quoted cells may hold commas and doubled quotes
  const rows = [];
  for (const line of csv.split("\r\n").filter(Boolean)) {
    const cells = []; let cell = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === ",") { cells.push(cell); cell = ""; } else cell += c;
    }
    cells.push(cell); rows.push(cells);
  }
  return rows;
};
const slip = (code, days) => finished(statusAsPlanned(plan, "77", parseDate("2026-05-06 07:00"), { costs: false, slips: [{ code, hours: days * 8 }] }));

test("every CSV row, added and not-built rows included, has the header's column count", () => {
  const renamed = cloneXer(slip("A1090", 12));
  const row = renamed.tables.TASK.find((x) => x.task_code === "A1090");
  row.task_code = "A1095"; row.task_name = 'MEP, "level 1", rework';
  const r = asPlannedVsAsBuilt(renamed, plan);
  assert.ok(r.added.length && r.deleted.length && r.milestones.length);
  const rows = csvRows(asPlannedCsv(r));
  const width = rows[0].length;
  for (const cells of rows) assert.equal(cells.length, width, cells.join("|"));
  assert.ok(rows.some((c) => c[0] === "added" && c[1] === "A1095" && c[2] === 'MEP, "level 1", rework'));
  assert.ok(rows.some((c) => c[0] === "not built" && c[1] === "A1090"));
});

test("a one-day late start is a late start, not a planned gap used up", () => {
  const run = schedule(plan);
  const t = [...run.model.tasks.values()].find((x) => x.code === "A1120");
  const r0 = run.tasks.get(t.id);
  const held = cloneXer(plan);
  const row = held.tables.TASK.find((x) => x.task_code === "A1120");
  row.cstr_type = "CS_MSOA"; row.cstr_date = formatDate(t.cal.nextStart(t.cal.addWork(r0.remES ?? r0.es, 1 * 8 * 60)));
  const r = asPlannedVsAsBuilt(finished(held), plan);
  const steps = delaySteps(r).filter((s) => s.code === "A1120");
  assert.deepEqual(steps.map((s) => [s.kind, s.days]), [["late start", 1]]);
});

test("a milestone on the path has zero actual days", () => {
  const r = asPlannedVsAsBuilt(slip("A1090", 12), plan);
  const miles = r.path.filter((x) => x.code === "M1000");
  assert.equal(miles.length, 1);
  assert.equal(miles[0].actualDays, 0);
  assert.equal(miles[0].plannedDays, 0);
});

test("a calendar without day_hr_cnt reads as 8 hours a day, the same as one that stores 8", () => {
  const blank = (x) => { const y = cloneXer(x); for (const c of y.tables.CALENDAR) c.day_hr_cnt = ""; return y; };
  const slipped = slip("A1090", 12);
  const a = asPlannedVsAsBuilt(slipped, plan);
  const b = asPlannedVsAsBuilt(blank(slipped), blank(plan));
  assert.ok(a.path.some((x) => x.plannedFloat > 0));
  assert.deepEqual(b.path.map((x) => [x.code, x.plannedFloat, x.plannedDays, x.actualDays]), a.path.map((x) => [x.code, x.plannedFloat, x.plannedDays, x.actualDays]));
  // and the final file's own planned dates, when there is no baseline
  const own = (x) => { const y = cloneXer(x); const run = schedule(plan); for (const row of y.tables.TASK) { const q = run.tasks.get(row.task_id); if (q) { row.target_start_date = formatDate(q.remES ?? q.es); row.target_end_date = formatDate(q.ef); } } return y; };
  const c = asPlannedVsAsBuilt(own(slipped), null), d = asPlannedVsAsBuilt(blank(own(slipped)), null);
  assert.ok(c.path.some((x) => x.plannedDays > 0));
  assert.deepEqual(d.path.map((x) => x.plannedDays), c.path.map((x) => x.plannedDays));
});

test("a level-of-effort predecessor never joins the as-built path", () => {
  const add = (x) => {
    const y = cloneXer(x);
    const loe = { ...y.tables.TASK.find((t) => t.task_code === "A1150"), task_id: "5099", task_code: "L9000", task_name: "Site supervision", task_type: "TT_LOE", status_code: "TK_Complete" };
    y.tables.TASK.push(loe);
    const fs = y.tables.TASKPRED.find((p) => p.task_id === "5013");
    y.tables.TASKPRED.push({ ...fs, task_pred_id: "9098", task_id: "5099", pred_task_id: "5001", pred_type: "PR_SS", lag_hr_cnt: "0" });
    y.tables.TASKPRED.push({ ...fs, task_pred_id: "9099", task_id: "5017", pred_task_id: "5099", pred_type: "PR_FF", lag_hr_cnt: "0" });
    return y;
  };
  const r = asPlannedVsAsBuilt(add(slip("A1090", 12)), add(plan));
  assert.ok(!r.path.some((x) => x.code === "L9000"), r.path.map((x) => x.code).join(" "));
  assert.equal(r.sum, r.delayDays);
});

test("added work at the end of the path is a row in the HTML table and labelled as such in the CSV", () => {
  // the last activity on the path slips and is renamed: its step is not in the plan
  const x = cloneXer(slip("A1180", 5));
  x.tables.TASK.find((t) => t.task_code === "A1180").task_code = "Z9999";
  const r = asPlannedVsAsBuilt(x, plan);
  assert.equal(r.floatTerm, null);
  assert.equal(r.tail, 5);
  assert.equal(r.sum, r.delayDays);
  const html = asPlannedTableHtml(r);
  assert.match(html, /Where the delay grew/);
  assert.match(html, /added work at the end of the path<\/td><td[^>]*>[^<]*<\/td><td class="n">\+5<\/td>/);
  const rows = csvRows(asPlannedCsv(r));
  assert.ok(rows.some((c) => c[0] === "total" && c[2] === "added work at the end of the path" && c[12] === "5"));
  assert.ok(!rows.some((c) => c[2] === "planned float at the path's end"));
});
