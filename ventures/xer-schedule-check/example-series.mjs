// An invented series of four monthly updates of the example office fit-out
// for the windows analysis demo: March and April are the example pair
// (example.mjs); May is April statused as planned with the paint duration
// revised up 3 days; June is May statused as planned with board and tape on
// level 1 running 4 days long. Not a real project.
import { EXAMPLE_PREV_XER, EXAMPLE_XER } from "./example.mjs";
import { parseXer, parseDate } from "./xer.mjs";
import { statusAsPlanned, cloneXer } from "./status.mjs";

export function exampleSeries() {
  const mar = parseXer(EXAMPLE_PREV_XER), apr = parseXer(EXAMPLE_XER);
  let may = statusAsPlanned(apr, "77", parseDate("2026-05-04 07:00"));
  may = cloneXer(may);
  for (const r of may.tables.TASK) if (r.task_code === "A1150") { r.target_drtn_hr_cnt = "88"; r.remain_drtn_hr_cnt = "88"; }
  may = statusAsPlanned(may, "77", parseDate("2026-05-04 07:00")); // refresh the stored dates after the revision
  const jun = statusAsPlanned(may, "77", parseDate("2026-06-01 07:00"), { slips: [{ code: "A1120", hours: 32 }] });
  return [
    { xer: mar, label: "March update" },
    { xer: apr, label: "April update" },
    { xer: may, label: "May update" },
    { xer: jun, label: "June update" },
  ];
}
