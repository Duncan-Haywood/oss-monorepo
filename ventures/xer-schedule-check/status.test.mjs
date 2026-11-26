import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { statusAsPlanned } from "./status.mjs";

const MAY = parseDate("2026-05-04 07:00");
const row = (x, code) => x.tables.TASK.find((r) => r.task_code === code);

// A1040 has not started in the April file (400 h remaining) and is forecast to
// start before 4 May: statused there it is under way with 272 h left, so 128 of
// its 400 remaining hours (a share of 0.32) were worked in the period.
test("units and physical percent move with the share of the work done in the period", () => {
  const plan = parseXer(EXAMPLE_XER);
  const r0 = row(plan, "A1040");
  r0.act_work_qty = "0"; r0.remain_work_qty = "1000";
  r0.act_equip_qty = "10"; r0.remain_equip_qty = "50";
  r0.phys_complete_pct = ""; // blank, as P6 writes an activity with no percent yet
  const r = row(statusAsPlanned(plan, "77", MAY), "A1040");
  assert.equal(r.status_code, "TK_Active");
  assert.equal(r.remain_drtn_hr_cnt, "272");
  assert.equal(Number(r.act_work_qty), 320);
  assert.equal(Number(r.remain_work_qty), 680);
  assert.equal(Number(r.act_equip_qty), 10 + 50 * 0.32);
  assert.equal(Number(r.remain_equip_qty), 50 * 0.68);
  assert.equal(Number(r.phys_complete_pct), 32);
});

test("an activity part-done already moves only the rest of its percent", () => {
  const plan = parseXer(EXAMPLE_XER);
  row(plan, "A1040").phys_complete_pct = "50";
  const r = row(statusAsPlanned(plan, "77", MAY), "A1040");
  assert.equal(Number(r.phys_complete_pct), 50 + 50 * 0.32);
});

test("a slip planted on work not yet due to start lengthens it but leaves it unstarted", () => {
  const plan = parseXer(EXAMPLE_XER);
  const x = statusAsPlanned(plan, "77", MAY, { slips: [{ code: "A1200", hours: 16 }, { code: "M1210", hours: 16 }] });
  const a = row(x, "A1200");
  assert.equal(a.status_code, "TK_NotStart");
  assert.equal(a.act_start_date, row(plan, "A1200").act_start_date);
  assert.equal(a.remain_drtn_hr_cnt, "56"); // 40 planned + 16 slipped
  assert.ok(a.early_start_date > "2026-05-04"); // still forecast after the data date
  // a milestone has no duration to slip
  const m = row(x, "M1210");
  assert.equal(m.status_code, "TK_NotStart");
  assert.equal(m.remain_drtn_hr_cnt, "0");
  // and its forecast finish moves by the two slipped days (A1200 has float,
  // so the project finish holds)
  assert.equal(row(statusAsPlanned(plan, "77", MAY), "A1200").early_end_date, "2026-07-17 15:30");
  assert.equal(a.early_end_date, "2026-07-21 15:30");
});
