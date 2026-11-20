// Writes ../example.mjs: an invented two-storey office fit-out schedule as
// P6 XER text, for the page's "Load an example" button and the tests. Every
// name, date and number is made up. It carries the faults a DCMA review
// looks for (a lead, long lags, a missing successor, a hard constraint, a
// long activity, out-of-sequence progress) so each check has something to show.
//   node samples/make-example.mjs              (writes ../example.mjs)
//   node samples/make-example.mjs out.xer      (also writes the XER file)
import { writeFileSync } from "node:fs";

const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|07:00|f|11:00)())(0||1(s|11:30|f|15:30)())))(0||3()((0||0(s|07:00|f|11:00)())(0||1(s|11:30|f|15:30)())))(0||4()((0||0(s|07:00|f|11:00)())(0||1(s|11:30|f|15:30)())))(0||5()((0||0(s|07:00|f|11:00)())(0||1(s|11:30|f|15:30)())))(0||6()((0||0(s|07:00|f|11:00)())(0||1(s|11:30|f|15:30)())))(0||7()())))(0||Exceptions()((0||0(d|46168)())(0||1(d|46206)())(0||2(d|46268)())))))";

const acts = [
  // code, name, days, type, status, extra
  ["M1000", "Notice to proceed", 0, "TT_Mile", "TK_Complete", { act_start_date: "2026-03-02 07:00", act_end_date: "2026-03-02 07:00" }],
  ["A1010", "Site survey and as-built check", 3, "TT_Task", "TK_Complete", { act_start_date: "2026-03-02 07:00", act_end_date: "2026-03-05 15:30" }],
  ["A1020", "Shop drawings: partitions and ceilings", 10, "TT_Task", "TK_Complete", { act_start_date: "2026-03-05 07:00", act_end_date: "2026-03-20 15:30" }],
  ["A1030", "Submittal review", 10, "TT_Task", "TK_Active", { act_start_date: "2026-03-23 07:00", remain: 4 }],
  ["A1040", "Procure doors and hardware", 50, "TT_Task", "TK_NotStart"],
  ["A1050", "Demolition, level 1", 5, "TT_Task", "TK_Active", { act_start_date: "2026-03-30 07:00", remain: 3 }],
  ["A1060", "Demolition, level 2", 5, "TT_Task", "TK_NotStart"],
  ["A1070", "Layout and track, level 1", 4, "TT_Task", "TK_NotStart"],
  ["A1080", "Layout and track, level 2", 4, "TT_Task", "TK_NotStart"],
  ["A1090", "MEP rough-in, level 1", 12, "TT_Task", "TK_NotStart"],
  ["A1100", "MEP rough-in, level 2", 12, "TT_Task", "TK_NotStart"],
  ["A1110", "Inspection: in-wall rough-in", 1, "TT_Task", "TK_NotStart", { cstr_type: "CS_MSO", cstr_date: "2026-05-18 07:00" }],
  ["A1120", "Board and tape, level 1", 8, "TT_Task", "TK_NotStart"],
  ["A1130", "Board and tape, level 2", 8, "TT_Task", "TK_NotStart"],
  ["A1140", "Ceiling grid and tile", 10, "TT_Task", "TK_NotStart"],
  ["A1150", "Paint", 8, "TT_Task", "TK_NotStart"],
  ["A1160", "Flooring", 7, "TT_Task", "TK_NotStart"],
  ["A1170", "Hang doors and hardware", 4, "TT_Task", "TK_NotStart"],
  ["A1180", "Furniture install (by owner)", 5, "TT_Task", "TK_NotStart"],
  ["A1190", "Signage", 2, "TT_Task", "TK_NotStart"],
  ["A1200", "Punch list", 5, "TT_Task", "TK_NotStart"],
  ["M1210", "Substantial completion", 0, "TT_FinMile", "TK_NotStart"],
];
// pred, succ, type, lag days
const links = [
  ["M1000", "A1010", "PR_FS", 0], ["A1010", "A1020", "PR_FS", 0], ["A1020", "A1030", "PR_FS", 0], ["A1030", "A1040", "PR_FS", 0],
  ["M1000", "A1050", "PR_FS", 15], ["A1050", "A1060", "PR_SS", 3], ["A1050", "A1070", "PR_FS", 0], ["A1060", "A1080", "PR_FS", 0],
  ["A1030", "A1070", "PR_FS", 0], ["A1070", "A1090", "PR_FS", -2], ["A1080", "A1100", "PR_FS", 0], ["A1090", "A1110", "PR_FS", 0],
  ["A1100", "A1110", "PR_FS", 0], ["A1110", "A1120", "PR_FS", 0], ["A1110", "A1130", "PR_FS", 0], ["A1120", "A1140", "PR_FS", 0],
  ["A1130", "A1140", "PR_FS", 0], ["A1140", "A1150", "PR_FS", 0], ["A1150", "A1160", "PR_FS", 0], ["A1160", "A1170", "PR_FS", 0],
  ["A1040", "A1170", "PR_FS", 0], ["A1170", "A1200", "PR_FS", 0], ["A1160", "A1180", "PR_FS", 10], ["A1200", "M1210", "PR_FS", 0],
  ["A1150", "A1190", "PR_SS", 2],
];
const H = 8;
function build(acts, links, dataDate, exportDate) {
const rows = acts.map(([code, name, days, type, status, extra = {}], i) => {
  const { remain, ...rest } = extra;
  const left = status === "TK_Complete" ? 0 : (remain ?? days);
  return {
    task_id: String(5001 + i), proj_id: "77", wbs_id: "700", clndr_id: "88", task_type: type, status_code: status, task_code: code, task_name: name,
    remain_drtn_hr_cnt: left * H, target_drtn_hr_cnt: days * H, act_start_date: "", act_end_date: "", cstr_type: "", cstr_date: "",
    target_start_date: "", target_end_date: "", ...rest,
  };
});
const id = Object.fromEntries(rows.map((r) => [r.task_code, r.task_id]));
// planned (baseline) finishes: the first four were due by the data date
const planned = { A1010: "2026-03-05 15:30", A1020: "2026-03-19 15:30", A1030: "2026-04-02 15:30", A1050: "2026-04-03 15:30" };
for (const r of rows) if (planned[r.task_code]) r.target_end_date = planned[r.task_code];
const preds = links.map(([p, s, type, lag], i) => ({ task_pred_id: String(9001 + i), task_id: id[s], pred_task_id: id[p], proj_id: "77", pred_proj_id: "77", pred_type: type, lag_hr_cnt: lag * H }));
// The GC's labour is cost loaded at an invented 95 an hour, for earned value
// (evm.mjs): budget = original duration x rate; actual = budget x percent
// complete (duration %), times an overrun on two activities (shop drawings
// 15%, level 1 demolition 30%) so the cost checks have something to find;
// remaining = budget not yet earned.
const RATE = 95, OVER = { A1020: 1.15, A1050: 1.3 };
const costs = (r) => {
  const od = Number(r.target_drtn_hr_cnt) || 0, rd = Number(r.remain_drtn_hr_cnt) || 0;
  const pct = r.status_code === "TK_Complete" ? 1 : r.status_code === "TK_Active" && od ? 1 - rd / od : 0;
  const bac = od * RATE, ac = Math.round(bac * pct * (OVER[r.task_code] || 1) * 100) / 100;
  return { target_cost: bac, act_reg_cost: ac, act_ot_cost: 0, remain_cost: Math.round(bac * (1 - pct) * 100) / 100 };
};
const rsrc = rows.filter((r) => r.task_type === "TT_Task" && !["A1180", "A1040"].includes(r.task_code)).map((r, i) => ({ taskrsrc_id: String(3001 + i), task_id: r.task_id, proj_id: "77", rsrc_id: "1", ...costs(r) }));
// one drywall crew (limit 1 per hour) on both board-and-tape activities,
// which the logic runs side by side: resource levelling has one to move
for (const [k, code] of ["A1120", "A1130"].entries()) {
  const r = rows.find((x) => x.task_code === code);
  if (r) rsrc.push({ taskrsrc_id: String(3101 + k), task_id: r.task_id, proj_id: "77", rsrc_id: "2", remain_qty: r.remain_drtn_hr_cnt, remain_qty_per_hr: 1, relag_drtn_hr_cnt: 0 });
}

const tables = {
  PROJECT: [{ proj_id: "77", proj_short_name: "OFFICE-FITOUT", clndr_id: "88", last_recalc_date: dataDate, plan_start_date: "2026-03-02 07:00", plan_end_date: "2026-07-31 15:30", scd_end_date: "" }],
  CALENDAR: [{ clndr_id: "88", default_flag: "Y", clndr_name: "5 day, 07:00-15:30", proj_id: "", base_clndr_id: "", clndr_type: "CA_Base", day_hr_cnt: 8, week_hr_cnt: 40, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "77", sched_outer_depend_type: "SD_Both", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N", sched_use_project_end_date_for_float: "Y" }],
  TASK: rows,
  TASKPRED: preds,
  TASKRSRC: rsrc,
  RSRC: [
    { rsrc_id: "1", rsrc_short_name: "GC", rsrc_name: "General contractor's labour", rsrc_type: "RT_Labor", clndr_id: "88" },
    { rsrc_id: "2", rsrc_short_name: "DRY", rsrc_name: "Drywall crew", rsrc_type: "RT_Labor", clndr_id: "88" },
  ],
  RSRCRATE: [{ rsrc_rate_id: "1", rsrc_id: "2", max_qty_per_hr: 1, cost_per_qty: 0, start_date: "2026-01-01 00:00" }],
};
const lines = [`ERMHDR\t23.12\t${exportDate}\tProject\tdemo\tExample\tdbxDatabaseNoName\tProject Management\tUSD`];
for (const [name, rs] of Object.entries(tables)) {
  const fields = [...new Set(rs.flatMap((r) => Object.keys(r)))];
  lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
  for (const r of rs) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
}
lines.push("%E", "");
return { text: lines.join("\r\n"), rows };
}
const { text, rows } = build(acts, links, "2026-04-06 07:00", "2026-04-06");

// The previous monthly update (data date 2026-03-09), for the update-to-update
// comparison. The differences are deliberate, one or more for each thing the
// comparison reports: progress since then; A1010's actual finish edited
// afterwards; A1020 finished later than forecast; A1040 lengthened and A1150
// shortened; A1110's start-on constraint added; A1180's lag changed from 5 to
// 10 days; signage moved from after flooring to a start-to-start off paint;
// a final clean deleted, and a level 2 demolition with a start-to-start link
// that was a finish-to-start one.
const prevActs = acts
  .map(([code, name, days, type, status, extra = {}]) => {
    const e = { ...extra };
    if (code === "A1010") e.act_end_date = "2026-03-04 15:30";
    if (code === "A1020") return [code, name, days, type, "TK_Active", { act_start_date: "2026-03-05 07:00", remain: 7 }];
    if (code === "A1030" || code === "A1050") return [code, name, days, type, "TK_NotStart"];
    if (code === "A1040") return [code, name, 40, type, status];
    if (code === "A1150") return [code, name, 10, type, status];
    if (code === "A1110") return [code, name, days, type, status];
    if (code === "A1190") return [code, "Signage and wayfinding", days, type, status];
    return [code, name, days, type, status, e];
  })
  .concat([["A1205", "Final clean", 3, "TT_Task", "TK_NotStart"]]);
const prevLinks = links
  .filter(([p, s]) => !(p === "A1200" && s === "M1210") && !(p === "A1150" && s === "A1190"))
  .map(([p, s, t, lag]) => (p === "A1160" && s === "A1180" ? [p, s, t, 5] : p === "A1050" && s === "A1060" ? [p, s, "PR_FS", 0] : [p, s, t, lag]))
  .concat([["A1200", "A1205", "PR_FS", 0], ["A1205", "M1210", "PR_FS", 0], ["A1160", "A1190", "PR_FS", 0]]);
const prev = build(prevActs, prevLinks, "2026-03-09 07:00", "2026-03-09");

writeFileSync(new URL("../example.mjs", import.meta.url), `// Generated by samples/make-example.mjs: an invented office fit-out schedule.\n// Not a real project; every name, date and number is made up.\nexport const EXAMPLE_XER = ${JSON.stringify(text)};\n// The previous monthly update of the same invented project (data date 2026-03-09).\nexport const EXAMPLE_PREV_XER = ${JSON.stringify(prev.text)};\n`);
if (process.argv[2]) writeFileSync(process.argv[2], text);
if (process.argv[3]) writeFileSync(process.argv[3], prev.text);
console.log(`wrote example.mjs${process.argv[2] ? " and " + process.argv[2] : ""}:`, rows.length, "activities");
