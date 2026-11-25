import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { statusAsPlanned, cloneXer } from "./status.mjs";
import { schedule } from "./cpm.mjs";

const plan = () => parseXer(EXAMPLE_XER);
const DD = parseDate("2026-05-06 07:00");
const row = (x, code) => x.tables.TASK.find((r) => r.task_code === code);
const close = (a, b, msg) => assert.ok(Math.abs(Number(a) - b) < 1e-4, `${msg}: ${a} vs ${b}`);

test("a slip planted on an activity not yet started leaves it unstarted, one longer", () => {
  // Paint (A1150) is forecast to start 2026-06-15, six weeks after the data date
  const x = plan();
  const base = statusAsPlanned(x, "77", DD, { costs: false });
  const s = statusAsPlanned(x, "77", DD, { costs: false, slips: [{ code: "A1150", hours: 16 }] });
  const r = row(s, "A1150");
  assert.equal(r.status_code, "TK_NotStart");
  assert.equal(r.act_start_date || "", "");
  assert.equal(Number(r.remain_drtn_hr_cnt), 64 + 16);
  assert.equal(r.early_start_date, row(base, "A1150").early_start_date);
  // its predecessor still drives it, and the finish moves the two days
  assert.equal(s.tables.PROJECT[0].scd_end_date, "2026-07-29 15:30");
  assert.equal(base.tables.PROJECT[0].scd_end_date, "2026-07-27 15:30");
});

// Procure doors (A1040) is under way at the data date: 144 of its 400 h done
function withUnits(x) {
  Object.assign(row(x, "A1040"), { act_work_qty: "0", remain_work_qty: "100", phys_complete_pct: "50" });
  x.tables.TASKRSRC.push({ taskrsrc_id: "3999", task_id: "5005", proj_id: "77", rsrc_id: "1", target_cost: "4000", act_reg_cost: "0", act_ot_cost: "0", remain_cost: "4000", remain_qty: "", remain_qty_per_hr: "", relag_drtn_hr_cnt: "" });
  return x;
}

test("work under way moves the share done in the period from remaining to actual", () => {
  const s = statusAsPlanned(withUnits(plan()), "77", DD);
  const r = row(s, "A1040");
  assert.equal(r.status_code, "TK_Active");
  assert.equal(Number(r.remain_drtn_hr_cnt), 256);
  const g = 144 / 400;
  close(r.act_work_qty, 100 * g, "units done");
  close(r.remain_work_qty, 100 * (1 - g), "units left");
  close(r.phys_complete_pct, 50 + 50 * g, "physical percent");
  const a = s.tables.TASKRSRC.find((t) => t.taskrsrc_id === "3999");
  close(a.act_reg_cost, 4000 * g, "cost spent");
});

test("a slip on work under way earns less than planned but spends at the planned rate", () => {
  const s = statusAsPlanned(withUnits(plan()), "77", DD, { slips: [{ code: "A1040", hours: 40 }] });
  const r = row(s, "A1040");
  assert.equal(Number(r.remain_drtn_hr_cnt), 256 + 40);
  const g = 144 / (400 + 40);
  close(r.act_work_qty, 100 * g, "units done");
  close(r.phys_complete_pct, 50 + 50 * g, "physical percent");
  const a = s.tables.TASKRSRC.find((t) => t.taskrsrc_id === "3999");
  close(a.act_reg_cost, 4000 * (144 / 400), "cost spent");
  close(a.remain_cost, 4000 * (1 - g), "cost left");
});

test("total float is refreshed on every open activity from the run at the new data date", () => {
  const s = statusAsPlanned(plan(), "77", DD, { costs: false });
  const res = schedule(s);
  let n = 0;
  for (const r of s.tables.TASK) {
    if (r.status_code === "TK_Complete") continue;
    const t = res.tasks.get(r.task_id);
    assert.equal(r.total_float_hr_cnt, String(t.tf), r.task_code);
    n++;
  }
  assert.ok(n > 5);
});

test("statusing leaves the input file untouched", () => {
  const x = plan();
  const before = JSON.stringify(cloneXer(x));
  statusAsPlanned(x, "77", DD, { slips: [{ code: "A1150", hours: 16 }] });
  assert.equal(JSON.stringify(x), before);
});

test("no planted slip, on any open activity, gives an actual start to work not reached by the data date", () => {
  const x = plan();
  const base = statusAsPlanned(x, "77", DD, { costs: false });
  const unstarted = base.tables.TASK.filter((r) => r.status_code === "TK_NotStart").map((r) => r.task_code);
  assert.ok(unstarted.length > 5);
  for (const code of base.tables.TASK.filter((r) => r.status_code !== "TK_Complete").map((r) => r.task_code)) {
    const s = statusAsPlanned(x, "77", DD, { costs: false, slips: [{ code, hours: 24 }] });
    for (const c of unstarted) assert.equal(row(s, c).status_code, "TK_NotStart", `slip on ${code} started ${c}`);
    assert.ok(s.tables.PROJECT[0].scd_end_date >= base.tables.PROJECT[0].scd_end_date, `slip on ${code} pulled the finish in`);
  }
});
