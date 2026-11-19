// Files written by hand or by other tools rather than exported from P6: the
// faults found by running cli.mjs over 245 public XER files from GitHub on
// 2026-11-19 (eval/converter-files-2026-11-19.md). Each test is one fault.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXer, num, formatDate } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { assess } from "./dcma.mjs";

function xerText(tables) {
  const lines = ["ERMHDR\t20.12\t2026-01-05\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return lines.join("\r\n");
}
const PROJECT = [{ proj_id: "1", proj_short_name: "P", clndr_id: "C1", last_recalc_date: "2026-01-05 08:00", plan_start_date: "2026-01-05 08:00" }];
const t = (id, code, hours, extra = {}) => ({ task_id: id, proj_id: "1", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: code, task_name: code, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra });

test("num: blank, NaN, infinite and text all read as null", () => {
  for (const s of ["", " ", null, undefined, "NaN", "inf", "-inf", "1e999999", "nope", "NotANumber"]) assert.equal(num(s), null, String(s));
  assert.equal(num("-0"), -0);
  assert.equal(num("160.5"), 160.5);
});

test("a lag that is not a number is taken as 0 and reported, not run forever", () => {
  const x = parseXer(xerText({
    PROJECT,
    CALENDAR: [{ clndr_id: "C1", clndr_name: "Std", day_hr_cnt: 8, week_hr_cnt: 40, clndr_data: "" }],
    TASK: [t("1", "A", 8), t("2", "B", 8, { remain_drtn_hr_cnt: "inf" })],
    TASKPRED: [{ task_pred_id: "9", task_id: "2", pred_task_id: "1", pred_type: "PR_FS", lag_hr_cnt: "NotANumber" }],
  }));
  const out = schedule(x);
  // zero lag and zero remaining: B takes A's finish, snapped to the next working start
  assert.equal(formatDate(out.tasks.get("2").ef), "2026-01-06 08:00");
  assert.ok(out.warnings.some((w) => /1 lag value does not read as a number and was taken as 0: link 9 \("NotANumber"\)/.test(w)), out.warnings.join("\n"));
  assert.ok(out.warnings.some((w) => /remaining duration value does not read/.test(w) && /B \("inf"\)/.test(w)));
});

test("activities with no calendar take their project's, in one warning per missing calendar", () => {
  const x = parseXer(xerText({
    PROJECT,
    CALENDAR: [{ clndr_id: "C0", clndr_name: "24h", day_hr_cnt: 24, week_hr_cnt: 168, clndr_data: "" }, { clndr_id: "C1", clndr_name: "Std", day_hr_cnt: 8, week_hr_cnt: 40, clndr_data: "" }],
    TASK: [t("1", "A", 8, { clndr_id: "" }), t("2", "B", 8, { clndr_id: "" }), t("3", "C", 8, { clndr_id: "C9" })],
  }));
  const out = schedule(x);
  const w = out.warnings.filter((s) => /calendar/.test(s) && !/stores no work pattern/.test(s));
  assert.deepEqual(w, ["2 activities: no calendar is named (A, B); used Std", "1 activity: calendar C9 is not in the file (C); used Std"]);
  assert.ok(!out.warnings.some((s) => /undefined/.test(s)));
  assert.equal(formatDate(out.tasks.get("1").ef), "2026-01-05 17:00"); // Std, not the first calendar (24 h)
});

test("a blank calendar's week and day hours set its working days", () => {
  const x = parseXer(xerText({
    PROJECT,
    CALENDAR: [
      { clndr_id: "C1", clndr_name: "Six", day_hr_cnt: 8, week_hr_cnt: 48, clndr_data: "" },
      { clndr_id: "C7", clndr_name: "Seven", day_hr_cnt: 24, week_hr_cnt: 168, clndr_data: "" },
      { clndr_id: "C5", clndr_name: "Odd", day_hr_cnt: 8, week_hr_cnt: 42, clndr_data: "" },
    ],
    // 2026-01-05 is a Monday: 48 h is Mon-Sat on Six, two days on Seven, Mon-Fri + Mon on Odd
    TASK: [t("1", "SIX", 48), t("2", "SEVEN", 48, { clndr_id: "C7" }), t("3", "ODD", 48, { clndr_id: "C5" })],
  }));
  const out = schedule(x);
  assert.equal(formatDate(out.tasks.get("1").ef), "2026-01-10 17:00");
  assert.equal(formatDate(out.tasks.get("2").ef), "2026-01-07 08:00");
  assert.equal(formatDate(out.tasks.get("3").ef), "2026-01-12 17:00");
  assert.ok(out.warnings.some((w) => /Six\) stores no work pattern; assumed Monday to Saturday \(48 h a week\), 8 h a day/.test(w)));
  assert.ok(out.warnings.some((w) => /Seven\) stores no work pattern; assumed every day, all day/.test(w)));
  assert.ok(out.warnings.some((w) => /Odd\) stores no work pattern; assumed Monday to Friday/.test(w)));
});

test("stored dates with no stored float say so instead of NaN", () => {
  const x = parseXer(xerText({
    PROJECT,
    CALENDAR: [{ clndr_id: "C1", clndr_name: "Std", day_hr_cnt: 8, week_hr_cnt: 40, clndr_data: "" }],
    TASK: [t("1", "A", 8, { early_end_date: "2026-01-09 17:00", late_end_date: "2026-01-09 17:00", total_float_hr_cnt: "NaN" })],
  }));
  const text = JSON.stringify(assess(x));
  assert.ok(!/NaN|Infinity/.test(text));
  assert.ok(/float not stored; recomputed/.test(text));
});

test("cli: a file it cannot assess ends with one line and exit 1, no stack trace", () => {
  const dir = mkdtempSync(join(tmpdir(), "xer-"));
  const f = join(dir, "odd.xer");
  writeFileSync(f, "ERMHDR\t24.8\t2024-09-08\tProject\n%T\tTASK\n%F\tTask_ID\tTask_Name\n%R\t1000\tTask 1\n%E\n");
  let err;
  try { execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, f], { stdio: "pipe" }); } catch (e) { err = e; }
  assert.equal(err.status, 1);
  assert.equal(err.stderr.toString().trim(), "xer-schedule-check: the file has no PROJECT table and no activities with a task_id: is it an XER export from P6?");
});
