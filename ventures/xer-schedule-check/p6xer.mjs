// Microsoft Project XML (MSPDI) -> Primavera P6 XER, ready for P6's import
// (File > Import > Primavera PM - (XER)). Someone who planned in Microsoft
// Project and must submit a P6 file to an owner or a general contractor gets
// one without a P6 seat or a paid converter. Nothing is uploaded: this runs
// in the browser tab (or the CLI).
//
// p6XerText(text, { projectId, activityIds }) -> { xer, text, counts, warnings }
//
// mspdi.mjs already reads MSPDI into P6's tables for the checks (calendars,
// WBS, tasks, links, activity codes from text fields). Those rows carry only
// the fields the checks read, and some of their ids are text (a 24-hour
// calendar is "mspdi-24h"), so P6 would not import them. This module fills
// every field P6 20.12 writes in each table it emits, with P6's defaults
// where Project has no equivalent, renumbers every id as an integer, adds the
// tables P6 expects alongside (CURRTYPE, OBS, the project's WBS node), and
// carries resources and their assignments (RSRC, TASKRSRC).
//
// How Project's terms land in P6's, beyond mspdi.mjs's own mapping:
// - activity ID: the text field named "Activity ID" when the file has one
//   (msproject.mjs writes it, so a P6 file sent through Project comes back
//   with its own IDs); otherwise "A" and Project's row ID times ten (A10,
//   A20, ...), P6's own numbering habit, so the order still reads.
// - the project node of the WBS holds the project's title; summary tasks
//   become WBS nodes under it, each coded by its own part of Project's WBS
//   code (1.2.3 -> 3 under 1.2), in Project's order.
// - calendars are project calendars; hours per week, month and year are
//   worked out from each calendar's week.
// - scheduling options match Project's: lags on the successor's calendar,
//   total float as the smaller of start and finish float, retained logic.
//   So P6's first schedule run (F9) gives the dates Project showed
//   (eval/p6xer-check-2026-11-21.md).
// - resources: work resources become labour resources (hours), material
//   resources material ones (their units); cost resources have no P6 type
//   and are counted. Assignments keep budgeted, actual and remaining units
//   and cost; P6 recomputes units per hour and the rate from them.
//
// Not carried (counted in the warnings): notes, custom number and date
// fields, task splits and contoured work, deadlines (no P6 field), elapsed
// lags on links (P6 has one lag calendar per project), cost resources.

import { parseMspdi, parseXml, durationHours } from "./mspdi.mjs";
import { xerText } from "./xer.mjs";

const kid = (node, name) => node && node.children.find((c) => c.name === name);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const val = (node, name) => { const k = kid(node, name); return k ? k.text.trim() : ""; };
const TEXT_IDS = ["188743731", "188743734", "188743737", "188743740", "188743743", "188743746", "188743747", "188743748", "188743749", "188743750",
  ...Array.from({ length: 20 }, (_, k) => String(188743997 + k))];

// The fields P6 20.12 writes, in its order (a real 20.12 export's %F lines;
// RSRC and TASKRSRC from a 24.12 export, without its 24.12-only fields).
export const FIELDS = {
  CURRTYPE: "curr_id decimal_digit_cnt curr_symbol decimal_symbol digit_group_symbol pos_curr_fmt_type neg_curr_fmt_type curr_type curr_short_name group_digit_cnt base_exch_rate",
  FINTMPL: "fintmpl_id fintmpl_name default_flag",
  OBS: "obs_id parent_obs_id guid seq_num obs_name obs_descr",
  PROJECT: "proj_id fy_start_month_num rsrc_self_add_flag allow_complete_flag rsrc_multi_assign_flag checkout_flag project_flag step_complete_flag cost_qty_recalc_flag batch_sum_flag name_sep_char def_complete_pct_type proj_short_name acct_id orig_proj_id source_proj_id base_type_id clndr_id sum_base_proj_id task_code_base task_code_step priority_num wbs_max_sum_level strgy_priority_num last_checksum critical_drtn_hr_cnt def_cost_per_qty last_recalc_date plan_start_date plan_end_date scd_end_date add_date last_tasksum_date fcst_start_date def_duration_type task_code_prefix guid def_qty_type add_by_name web_local_root_path proj_url def_rate_type add_act_remain_flag act_this_per_link_flag def_task_type act_pct_link_flag critical_path_type task_code_prefix_flag def_rollup_dates_flag use_project_baseline_flag rem_target_link_flag reset_planned_flag allow_neg_act_flag sum_assign_level last_fin_dates_id fintmpl_id last_baseline_update_date cr_external_key apply_actuals_date location_id loaded_scope_level export_flag new_fin_dates_id baselines_to_export baseline_names_to_export next_data_date close_period_flag sum_refresh_date trsrcsum_loaded sumtask_loaded",
  CALENDAR: "clndr_id default_flag clndr_name proj_id base_clndr_id last_chng_date clndr_type day_hr_cnt week_hr_cnt month_hr_cnt year_hr_cnt rsrc_private clndr_data",
  SCHEDOPTIONS: "schedoptions_id proj_id sched_outer_depend_type sched_open_critical_flag sched_lag_early_start_flag sched_retained_logic sched_setplantoforecast sched_float_type sched_calendar_on_relationship_lag sched_use_expect_end_flag sched_progress_override level_float_thrs_cnt level_outer_assign_flag level_outer_assign_priority level_over_alloc_pct level_within_float_flag level_keep_sched_date_flag level_all_rsrc_flag sched_use_project_end_date_for_float enable_multiple_longest_path_calc limit_multiple_longest_path_calc max_multiple_longest_path use_total_float_multiple_longest_paths key_activity_for_multiple_longest_paths LevelPriorityList",
  PROJWBS: "wbs_id proj_id obs_id seq_num est_wt proj_node_flag sum_data_flag status_code wbs_short_name wbs_name phase_id parent_wbs_id ev_user_pct ev_etc_user_value orig_cost indep_remain_total_cost ann_dscnt_rate_pct dscnt_period_type indep_remain_work_qty anticip_start_date anticip_end_date ev_compute_type ev_etc_compute_type guid tmpl_guid plan_open_state",
  RSRC: "rsrc_id parent_rsrc_id clndr_id role_id shift_id user_id pobs_id guid rsrc_seq_num email_addr employee_code office_phone other_phone rsrc_name rsrc_short_name rsrc_title_name def_qty_per_hr cost_qty_type ot_factor active_flag auto_compute_act_flag def_cost_qty_link_flag ot_flag curr_id unit_id rsrc_type location_id rsrc_notes load_tasks_flag level_flag last_checksum",
  ACTVTYPE: "actv_code_type_id actv_short_len seq_num actv_code_type proj_id wbs_id actv_code_type_scope",
  ACTVCODE: "actv_code_id parent_actv_code_id actv_code_type_id actv_code_name short_name seq_num color total_assignments",
  TASK: "task_id proj_id wbs_id clndr_id phys_complete_pct rev_fdbk_flag est_wt lock_plan_flag auto_compute_act_flag complete_pct_type task_type duration_type status_code task_code task_name rsrc_id total_float_hr_cnt free_float_hr_cnt remain_drtn_hr_cnt act_work_qty remain_work_qty target_work_qty target_drtn_hr_cnt target_equip_qty act_equip_qty remain_equip_qty cstr_date act_start_date act_end_date late_start_date late_end_date expect_end_date early_start_date early_end_date restart_date reend_date target_start_date target_end_date rem_late_start_date rem_late_end_date cstr_type priority_type suspend_date resume_date float_path float_path_order guid tmpl_guid cstr_date2 cstr_type2 driving_path_flag act_this_per_work_qty act_this_per_equip_qty external_early_start_date external_late_end_date create_date update_date create_user update_user location_id",
  TASKPRED: "task_pred_id task_id pred_task_id proj_id pred_proj_id pred_type lag_hr_cnt comments float_path aref arls",
  TASKACTV: "task_id actv_code_type_id actv_code_id proj_id",
  TASKRSRC: "taskrsrc_id task_id proj_id cost_qty_link_flag role_id acct_id rsrc_id pobs_id skill_level remain_qty target_qty remain_qty_per_hr target_lag_drtn_hr_cnt target_qty_per_hr act_ot_qty act_reg_qty relag_drtn_hr_cnt ot_factor cost_per_qty target_cost act_reg_cost act_ot_cost remain_cost act_start_date act_end_date restart_date reend_date target_start_date target_end_date rem_late_start_date rem_late_end_date rollup_dates_flag target_crv remain_crv actual_crv ts_pend_act_end_flag guid rate_type act_this_per_cost act_this_per_qty curv_id rsrc_type cost_per_qty_source_type create_user create_date has_rsrchours taskrsrc_sum_id",
};
for (const k of Object.keys(FIELDS)) FIELDS[k] = FIELDS[k].split(" ");

// P6's field lengths: longer values are cut (and counted), as P6's import
// would refuse them
const MAX = { proj_short_name: 40, wbs_short_name: 40, wbs_name: 100, task_code: 40, task_name: 120, clndr_name: 60, rsrc_short_name: 40, rsrc_name: 100, actv_code_type: 60, short_name: 60, actv_code_name: 100 };

// a row with every field of its table, in P6's order; missing ones empty
function full(table, row, defaults = {}) {
  const out = {};
  for (const f of FIELDS[table]) out[f] = row[f] ?? defaults[f] ?? "";
  return out;
}
const stopDate = (node) => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(val(node, "Stop")); return m ? `${m[1]} ${m[2]}` : ""; };
const n2 = (x) => String(Math.round(x * 100) / 100);

// working hours in a P6 clndr_data week: (0||2()((0||0(f|16:00|s|08:00)())))
function weekHours(data) {
  const days = /DaysOfWeek\(\)\((.*?)\)\)\(0\|\|Exceptions/s.exec(data);
  if (!days) return null;
  let min = 0;
  for (const m of days[1].matchAll(/f\|(\d\d):(\d\d)\|s\|(\d\d):(\d\d)/g)) {
    const f = +m[1] * 60 + +m[2], s = +m[3] * 60 + +m[4];
    min += (f > s ? f : f + 1440) - s;
  }
  return min / 60;
}

export function p6XerText(text, { projectId = "", activityIds = "auto" } = {}) {
  const parsed = parseMspdi(text);
  const T = parsed.tables;
  const warnings = [...parsed.warnings];
  const doc = parseXml(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const proj = kid(doc, "Project");
  const taskNode = new Map(kids(kid(proj, "Tasks"), "Task").map((t) => [val(t, "UID"), t]));
  let cut = 0;
  const clip = (field, v) => {
    v = String(v ?? "").replace(/[\t\r\n]+/g, " ");
    const m = MAX[field];
    if (m && v.length > m) { cut++; return v.slice(0, m); }
    return v;
  };
  // renumbering: one integer per source id, per table
  const ids = {};
  const idOf = (table, key, start = 1) => {
    const m = (ids[table] ||= new Map());
    if (!m.has(key)) m.set(key, String(start + m.size));
    return m.get(key);
  };
  const P = "1";
  const src = T.PROJECT[0];

  // calendars: the project's and those activities use, with working periods
  // written finish first, as P6 writes them: (f|16:00|s|08:00)
  const usedCals = new Set([T.PROJECT[0].clndr_id, ...T.TASK.map((t) => t.clndr_id)]);
  const CALENDAR = T.CALENDAR.filter((c) => usedCals.has(c.clndr_id)).map((c) => {
    c = { ...c, clndr_data: c.clndr_data.replace(/\(s\|(\d\d:\d\d)\|f\|(\d\d:\d\d)\)/g, (m, a, b) => `(f|${b === "24:00" ? "00:00" : b}|s|${a})`) };
    const wk = weekHours(c.clndr_data) ?? 40;
    return full("CALENDAR", {
      clndr_id: idOf("CAL", c.clndr_id),
      default_flag: c.clndr_id === src.clndr_id ? "Y" : "N",
      clndr_name: clip("clndr_name", c.clndr_name),
      proj_id: P,
      clndr_type: "CA_Project",
      day_hr_cnt: n2(Number(c.day_hr_cnt) || 8),
      week_hr_cnt: n2(wk),
      month_hr_cnt: n2(wk * 52 / 12),
      year_hr_cnt: n2(wk * 52),
      rsrc_private: "N",
      clndr_data: c.clndr_data,
    });
  });
  if (!CALENDAR.length) throw new Error("the file has no calendar with working time");
  const projCal = idOf("CAL", src.clndr_id || T.CALENDAR[0].clndr_id);
  if (!CALENDAR.some((c) => c.default_flag === "Y")) CALENDAR.find((c) => c.clndr_id === projCal).default_flag = "Y";

  // project
  const title = src.proj_short_name;
  const shortName = clip("proj_short_name", projectId || title);
  const PROJECT = [full("PROJECT", {
    proj_id: P, proj_short_name: shortName, clndr_id: projCal,
    last_recalc_date: src.last_recalc_date, plan_start_date: src.plan_start_date, plan_end_date: src.plan_end_date, scd_end_date: src.scd_end_date,
    critical_drtn_hr_cnt: src.critical_drtn_hr_cnt || "0",
    critical_path_type: "CT_TotFloat",
  }, {
    fy_start_month_num: "1", rsrc_self_add_flag: "Y", allow_complete_flag: "Y", rsrc_multi_assign_flag: "Y", checkout_flag: "N", project_flag: "Y",
    step_complete_flag: "N", cost_qty_recalc_flag: "N", batch_sum_flag: "Y", name_sep_char: ".", def_complete_pct_type: "CP_Drtn",
    task_code_base: "1000", task_code_step: "10", priority_num: "10", wbs_max_sum_level: "0", strgy_priority_num: "500", def_cost_per_qty: "0",
    def_duration_type: "DT_FixedDUR2", task_code_prefix: "A", def_qty_type: "QT_Hour", def_rate_type: "COST_PER_QTY", add_act_remain_flag: "N",
    act_this_per_link_flag: "Y", def_task_type: "TT_Task", act_pct_link_flag: "N", task_code_prefix_flag: "Y", def_rollup_dates_flag: "Y",
    use_project_baseline_flag: "Y", rem_target_link_flag: "Y", reset_planned_flag: "N", allow_neg_act_flag: "N", sum_assign_level: "SL_Taskrsrc",
    fintmpl_id: "1", loaded_scope_level: "7", export_flag: "Y",
  })];
  const so = T.SCHEDOPTIONS[0] || {};
  const SCHEDOPTIONS = [full("SCHEDOPTIONS", {
    schedoptions_id: "1", proj_id: P,
    sched_retained_logic: so.sched_retained_logic || "Y",
    sched_float_type: so.sched_float_type || "FT_SmallestFloat",
    sched_calendar_on_relationship_lag: so.sched_calendar_on_relationship_lag || "rcal_Successor",
    sched_progress_override: so.sched_progress_override || "N",
    sched_use_project_end_date_for_float: so.sched_use_project_end_date_for_float || "Y",
  }, {
    sched_outer_depend_type: "SD_Both", sched_open_critical_flag: "N", sched_lag_early_start_flag: "Y", sched_setplantoforecast: "N",
    sched_use_expect_end_flag: "N", level_float_thrs_cnt: "0", level_outer_assign_flag: "N", level_outer_assign_priority: "5", level_over_alloc_pct: "25",
    level_within_float_flag: "N", level_keep_sched_date_flag: "Y", level_all_rsrc_flag: "Y", enable_multiple_longest_path_calc: "N",
    limit_multiple_longest_path_calc: "Y", max_multiple_longest_path: "10", use_total_float_multiple_longest_paths: "Y", LevelPriorityList: "priority_type,ASC_BY_FIELD/ASC",
  })];

  // WBS: the project node, then summary tasks in Project's order
  const wbsDefaults = { obs_id: "1", est_wt: "1", sum_data_flag: "N", status_code: "WS_Open", ev_user_pct: "6", ev_etc_user_value: "0.88", orig_cost: "0", indep_remain_total_cost: "0", ann_dscnt_rate_pct: "", indep_remain_work_qty: "", ev_compute_type: "EC_Cmp_pct", ev_etc_compute_type: "EE_Rem_hr" };
  const root = "1";
  const PROJWBS = [full("PROJWBS", { wbs_id: root, proj_id: P, seq_num: "0", proj_node_flag: "Y", wbs_short_name: shortName, wbs_name: clip("wbs_name", title), parent_wbs_id: "" }, wbsDefaults)];
  idOf("WBS", "", 1);
  const srcWbs = new Map(T.PROJWBS.map((w) => [w.wbs_id, w]));
  const kidSeq = new Map();
  for (const w of T.PROJWBS) {
    const parent = w.parent_wbs_id && srcWbs.has(w.parent_wbs_id) ? w.parent_wbs_id : "";
    const code = w.wbs_short_name || "";
    const pcode = parent ? srcWbs.get(parent).wbs_short_name || "" : "";
    // Project's WBS is the whole path; P6's is this node's part of it
    const own = pcode && code.startsWith(pcode + ".") ? code.slice(pcode.length + 1) : code;
    const seq = (kidSeq.get(parent) || 0) + 1;
    kidSeq.set(parent, seq);
    PROJWBS.push(full("PROJWBS", {
      wbs_id: idOf("WBS", w.wbs_id), proj_id: P, seq_num: String(seq * 10), proj_node_flag: "N",
      wbs_short_name: clip("wbs_short_name", own || String(seq)), wbs_name: clip("wbs_name", w.wbs_name || own), parent_wbs_id: idOf("WBS", parent),
    }, wbsDefaults));
  }

  // activity IDs
  let idField = null;
  if (activityIds !== "row") {
    for (const d of kids(kid(proj, "ExtendedAttributes"), "ExtendedAttribute")) if (/^activity id$/i.test(val(d, "Alias")) && TEXT_IDS.includes(val(d, "FieldID"))) idField = val(d, "FieldID");
  }
  const used = new Set();
  let fromField = 0, dupIds = 0;
  const codeFor = (r) => {
    let code = "";
    if (idField) {
      const e = kids(taskNode.get(r.task_id), "ExtendedAttribute").find((x) => val(x, "FieldID") === idField);
      if (e && val(e, "Value")) { code = val(e, "Value"); fromField++; }
    }
    if (!code) code = `A${(Number(r.ms_id) || Number(r.task_id)) * 10}`;
    code = clip("task_code", code);
    if (used.has(code)) { dupIds++; let k = 2; while (used.has(`${code}-${k}`)) k++; code = `${code}-${k}`; }
    used.add(code);
    return code;
  };

  // resources and assignments, read here (mspdi.mjs reads only their calendars)
  const RSRC = [], TASKRSRC = [];
  const rsrcType = new Map();
  let costRes = 0, costAssign = 0;
  for (const r of kids(kid(proj, "Resources"), "Resource")) {
    const uid = val(r, "UID");
    if (!uid || uid === "0" || val(r, "IsNull") === "1" || !val(r, "Name")) continue;
    const type = val(r, "Type") === "" ? "1" : val(r, "Type");
    if (type === "2") { costRes++; continue; }
    const rt = type === "0" ? "RT_Mat" : "RT_Labor";
    rsrcType.set(uid, rt);
    const name = val(r, "Name");
    RSRC.push(full("RSRC", {
      rsrc_id: idOf("RSRC", uid), clndr_id: projCal, rsrc_seq_num: String(RSRC.length + 1),
      rsrc_name: clip("rsrc_name", name), rsrc_short_name: clip("rsrc_short_name", val(r, "Initials") || name.replace(/\s+/g, "").toUpperCase()),
      email_addr: "", def_qty_per_hr: n2((Number(val(r, "MaxUnits")) || 1)), rsrc_type: rt,
    }, { cost_qty_type: "QT_Hour", active_flag: "Y", auto_compute_act_flag: "N", def_cost_qty_link_flag: "Y", ot_flag: "N", curr_id: "1", load_tasks_flag: "", level_flag: "Y" }));
  }

  // activities
  const TASK = [];
  const taskIds = new Set();
  let deadlines = 0, notes = 0;
  for (const r of T.TASK) {
    const node = taskNode.get(r.task_id);
    if (val(node, "Deadline")) deadlines++;
    if (val(node, "Notes")) notes++;
    taskIds.add(r.task_id);
    const pct = Math.max(0, Math.min(100, Number(val(node, "PercentComplete")) || 0));
    TASK.push(full("TASK", {
      task_id: idOf("TASK", r.task_id), proj_id: P, wbs_id: idOf("WBS", srcWbs.has(r.wbs_id) ? r.wbs_id : ""), clndr_id: idOf("CAL", r.clndr_id),
      phys_complete_pct: String(r.status_code === "TK_Complete" ? 100 : pct), task_type: r.task_type, status_code: r.status_code,
      task_code: codeFor(r), task_name: clip("task_name", r.task_name),
      total_float_hr_cnt: r.total_float_hr_cnt, free_float_hr_cnt: r.free_float_hr_cnt,
      remain_drtn_hr_cnt: n2(Number(r.remain_drtn_hr_cnt) || 0), target_drtn_hr_cnt: n2(Number(r.target_drtn_hr_cnt) || 0),
      cstr_type: r.cstr_type, cstr_date: r.cstr_date,
      act_start_date: r.act_start_date, act_end_date: r.act_end_date,
      early_start_date: r.early_start_date, early_end_date: r.early_end_date, late_start_date: r.late_start_date, late_end_date: r.late_end_date,
      restart_date: r.status_code === "TK_Complete" ? "" : r.resume_date || r.restart_date || r.early_start_date,
      reend_date: r.reend_date,
      // Project's Resume (where the remaining work of a task in progress
      // restarts) is P6's suspend and resume: work stopped at Project's Stop
      // (else the actual start) and resumes there
      suspend_date: r.status_code === "TK_Active" && r.resume_date ? stopDate(node) || r.act_start_date : "",
      resume_date: r.status_code === "TK_Active" && r.resume_date ? r.resume_date : "",
      rem_late_start_date: r.status_code === "TK_Complete" ? "" : r.late_start_date, rem_late_end_date: r.status_code === "TK_Complete" ? "" : r.late_end_date,
      target_start_date: r.target_start_date || r.early_start_date, target_end_date: r.target_end_date || r.early_end_date,
    }, {
      rev_fdbk_flag: "N", est_wt: "1", lock_plan_flag: "N", auto_compute_act_flag: "N", complete_pct_type: "CP_Drtn", duration_type: "DT_FixedDUR2",
      act_work_qty: "0", remain_work_qty: "0", target_work_qty: "0", target_equip_qty: "0", act_equip_qty: "0", remain_equip_qty: "0",
      priority_type: "PT_Normal", driving_path_flag: "N", act_this_per_work_qty: "0", act_this_per_equip_qty: "0",
    }));
  }
  const taskRow = new Map(TASK.map((t) => [t.task_id, t]));
  // Actual dates after the data date: P6's schedule log lists each one and
  // a reviewer flags them (DCMA). With a status date in the file it stays the
  // data date and the count is reported; with none (the project start stands
  // in), the data date moves to the latest actual date, so nothing recorded
  // as done sits in the future.
  let lastActual = "", late = 0;
  const dd0 = PROJECT[0].last_recalc_date;
  for (const t of TASK) {
    let past = false;
    for (const d of [t.act_start_date, t.act_end_date]) { if (d > lastActual) lastActual = d; if (d > dd0) past = true; }
    if (past) late++;
  }
  if (late && val(proj, "StatusDate")) warnings.push(`${late} activit${late === 1 ? "y has" : "ies have"} actual dates after the status date ${dd0} (to ${lastActual}); the status date is kept as P6's data date, so P6's schedule log will list them: correct the actuals or the status date`);
  else if (late) {
    const k = warnings.findIndex((w) => w.startsWith("no status date in the file"));
    if (k >= 0) warnings.splice(k, 1);
    warnings.push(`no status date, and actual dates run to ${lastActual}: that is used as P6's data date, so recorded progress is not in the future`);
    PROJECT[0].last_recalc_date = lastActual;
  }

  // assignments: P6 keeps hours (labour) or units (material) and cost
  const hrs = (s) => durationHours(s) ?? 0;
  for (const a of kids(kid(proj, "Assignments"), "Assignment")) {
    const tu = val(a, "TaskUID"), ru = val(a, "ResourceUID");
    if (!taskIds.has(tu)) continue;
    if (!rsrcType.has(ru)) { if (ru && ru !== "-65535") costAssign++; continue; }
    const t = taskRow.get(idOf("TASK", tu));
    const target = hrs(val(a, "Work")), act = hrs(val(a, "ActualWork"));
    const remain = val(a, "RemainingWork") ? hrs(val(a, "RemainingWork")) : Math.max(0, target - act);
    // MSPDI costs are in hundredths of the currency unit
    const cost = (k) => (Number(val(a, k)) || 0) / 100;
    const tc = cost("Cost"), ac = cost("ActualCost"), rc = val(a, "RemainingCost") ? cost("RemainingCost") : Math.max(0, tc - ac);
    const dur = Number(t.target_drtn_hr_cnt) || 0;
    const rt = rsrcType.get(ru);
    TASKRSRC.push(full("TASKRSRC", {
      taskrsrc_id: idOf("TASKRSRC", val(a, "UID") || `${tu}-${ru}`), task_id: t.task_id, proj_id: P, rsrc_id: idOf("RSRC", ru),
      remain_qty: n2(remain), target_qty: n2(target), act_reg_qty: n2(act), act_ot_qty: "0",
      target_qty_per_hr: n2(dur ? target / dur : 0), remain_qty_per_hr: n2(Number(t.remain_drtn_hr_cnt) ? remain / Number(t.remain_drtn_hr_cnt) : 0),
      cost_per_qty: n2(target ? tc / target : 0), target_cost: n2(tc), act_reg_cost: n2(ac), act_ot_cost: "0", remain_cost: n2(rc),
      act_start_date: t.act_start_date, act_end_date: t.act_end_date, restart_date: t.restart_date, reend_date: t.reend_date,
      target_start_date: t.target_start_date, target_end_date: t.target_end_date, rsrc_type: rt,
    }, { cost_qty_link_flag: "Y", skill_level: "", target_lag_drtn_hr_cnt: "0", relag_drtn_hr_cnt: "0", rollup_dates_flag: "Y", ts_pend_act_end_flag: "N", rate_type: "COST_PER_QTY", act_this_per_cost: "0", act_this_per_qty: "0", cost_per_qty_source_type: "ST_Rsrc", has_rsrchours: "N" }));
    if (rt === "RT_Labor") { t.target_work_qty = n2(Number(t.target_work_qty) + target); t.act_work_qty = n2(Number(t.act_work_qty) + act); t.remain_work_qty = n2(Number(t.remain_work_qty) + remain); }
  }

  // relationships
  let elapsedLags = 0;
  const TASKPRED = T.TASKPRED.map((l) => {
    if (l.lag_calendar === "24h") elapsedLags++;
    return full("TASKPRED", { task_pred_id: idOf("PRED", l.task_pred_id), task_id: idOf("TASK", l.task_id), pred_task_id: idOf("TASK", l.pred_task_id), proj_id: P, pred_proj_id: P, pred_type: l.pred_type, lag_hr_cnt: n2(Number(l.lag_hr_cnt) || 0) });
  });

  // activity codes from text fields (project codes). msproject.mjs writes a
  // hierarchical P6 code as its whole path (parent.child) when the same leaf
  // code sits under two parents; such a type (two dotted values sharing a
  // leaf; values with no dot are top-level codes) is rebuilt as P6's
  // hierarchy, so it imports as the code tree it came from. Other dotted
  // codes stay as typed.
  const ACTVTYPE = [], ACTVCODE = [];
  const leafOf = new Map(); // source code id -> written code id
  let trees = 0;
  for (const a of T.ACTVTYPE || []) {
    const codes = (T.ACTVCODE || []).filter((c) => c.actv_code_type_id === a.actv_code_type_id);
    const leaves = new Map();
    for (const c of codes) { const k = c.short_name.lastIndexOf("."); if (k > 0) { const leaf = c.short_name.slice(k + 1); leaves.set(leaf, (leaves.get(leaf) || 0) + 1); } }
    // a value with no dot is a top-level code (P6 lets one be assigned)
    // (and codes, not names: no spaces, so "P.C For Footings" stays a name)
    const tree = codes.every((c) => /^[^.\s]+(\.[^.\s]+)*$/.test(c.short_name)) && [...leaves.values()].some((n) => n > 1);
    if (tree) trees++;
    const typeId = idOf("ATYPE", a.actv_code_type_id);
    let len = 1;
    const node = new Map(); // path -> written id
    // parents before children, so an assigned parent code keeps its description
    const order = tree ? [...codes].sort((x, y) => x.short_name.split(".").length - y.short_name.split(".").length) : codes;
    for (const c of order) {
      const segs = tree ? c.short_name.split(".") : [c.short_name];
      let parent = "";
      segs.forEach((seg, i) => {
        const path = segs.slice(0, i + 1).join(".");
        len = Math.max(len, seg.length);
        if (node.has(path) && i === segs.length - 1) {
          // a parent made for an earlier path, now assigned itself: keep its description
          const row = ACTVCODE.find((r) => r.actv_code_id === node.get(path));
          row.actv_code_name = clip("actv_code_name", c.actv_code_name);
        } else if (!node.has(path)) {
          const last = i === segs.length - 1;
          const id = idOf("ACODE", last ? c.actv_code_id : `${a.actv_code_type_id}|${path}`);
          node.set(path, id);
          ACTVCODE.push(full("ACTVCODE", { actv_code_id: id, parent_actv_code_id: parent, actv_code_type_id: typeId, actv_code_name: clip("actv_code_name", last ? c.actv_code_name : seg), short_name: clip("short_name", seg), seq_num: String(ACTVCODE.length + 1), color: "", total_assignments: "" }));
        }
        parent = node.get(path);
      });
      leafOf.set(c.actv_code_id, parent);
    }
    ACTVTYPE.push(full("ACTVTYPE", { actv_code_type_id: typeId, actv_short_len: String(Math.min(60, len)), seq_num: a.seq_num, actv_code_type: clip("actv_code_type", a.actv_code_type), proj_id: P, actv_code_type_scope: "AS_Project" }));
  }
  const TASKACTV = (T.TASKACTV || []).map((r) => full("TASKACTV", { task_id: idOf("TASK", r.task_id), actv_code_type_id: idOf("ATYPE", r.actv_code_type_id), actv_code_id: leafOf.get(r.actv_code_id), proj_id: P }));

  const tables = {
    CURRTYPE: [full("CURRTYPE", { curr_id: "1", decimal_digit_cnt: "2", curr_symbol: "$", decimal_symbol: ".", digit_group_symbol: ",", pos_curr_fmt_type: "#1.1", neg_curr_fmt_type: "(#1.1)", curr_type: "US Dollar", curr_short_name: "USD", group_digit_cnt: "3", base_exch_rate: "1" })],
    // the financial period template the project names, as P6 20.12 writes it
    FINTMPL: [full("FINTMPL", { fintmpl_id: "1", fintmpl_name: "Calendar", default_flag: "Y" })],
    OBS: [full("OBS", { obs_id: "1", seq_num: "0", obs_name: "Enterprise" })],
    PROJECT, CALENDAR, SCHEDOPTIONS, PROJWBS,
    ...(RSRC.length ? { RSRC } : {}),
    ...(ACTVTYPE.length ? { ACTVTYPE, ACTVCODE } : {}),
    TASK, TASKPRED,
    ...(TASKACTV.length ? { TASKACTV } : {}),
    ...(TASKRSRC.length ? { TASKRSRC } : {}),
  };

  if (idField) warnings.push(`activity IDs from the "Activity ID" text field on ${fromField} of ${TASK.length} activities${fromField < TASK.length ? `; the rest are A + row ID x 10` : ""}`);
  else warnings.push(`activity IDs are A + Project's row ID x 10 (A10, A20, ...), as no text field is named "Activity ID"`);
  if (dupIds) warnings.push(`${dupIds} repeated activity ID(s) given a -2, -3 suffix (P6 needs them unique)`);
  if (trees) warnings.push(`${trees} activity code type(s) written as parent.child paths rebuilt as P6 code hierarchies`);
  if (cut) warnings.push(`${cut} name(s) or code(s) cut to P6's field length`);
  if (elapsedLags) warnings.push(`${elapsedLags} elapsed lag(s) written in hours: P6 counts every lag on one calendar per project (successor's), so set the lag calendar to 24 hour in P6 if those links matter`);
  if (deadlines) warnings.push(`${deadlines} deadline(s) not carried: P6 has no deadline (add a finish-on-or-before secondary constraint in P6 if needed)`);
  if (notes) warnings.push(`${notes} task note(s) not carried`);
  if (costRes) warnings.push(`${costRes} cost resource(s) and ${costAssign} assignment(s) of them not carried: P6 keeps such costs as expenses`);

  const xer = { version: "20.12", exportDate: new Date().toISOString().slice(0, 10), tables, format: "xer" };
  const counts = { activities: TASK.length, relationships: TASKPRED.length, wbs: PROJWBS.length - 1, calendars: CALENDAR.length, resources: RSRC.length, assignments: TASKRSRC.length, codeTypes: ACTVTYPE.length };
  return { xer, text: xerText(xer), counts, warnings, project: { name: title, id: shortName } };
}

export const p6xerSummary = (r) =>
  `${r.counts.activities} activities, ${r.counts.relationships} relationships, ${r.counts.wbs} WBS nodes, ${r.counts.calendars} calendar(s)` +
  (r.counts.resources ? `, ${r.counts.resources} resources (${r.counts.assignments} assignments)` : "") +
  (r.counts.codeTypes ? `, ${r.counts.codeTypes} activity code type(s)` : "");

// What P6's import would refuse or misread, checked on the tables written:
// every table carries P6's fields; ids are whole numbers, unique per table;
// every reference resolves; activity IDs are unique; values fit P6's field
// lengths and hold no tab or line break (clndr_data aside); dates are
// "YYYY-MM-DD HH:MM"; progress is consistent (started has an actual start,
// complete an actual finish). Actual dates after the data date are not a
// problem here: P6 imports them and its schedule log lists them (the writer
// warns). -> list of problems
export function p6Problems(tables) {
  const out = [];
  const say = (s) => { if (out.length < 50) out.push(s); };
  const KEY = { CURRTYPE: "curr_id", FINTMPL: "fintmpl_id", OBS: "obs_id", PROJECT: "proj_id", CALENDAR: "clndr_id", SCHEDOPTIONS: "schedoptions_id", PROJWBS: "wbs_id", RSRC: "rsrc_id", ACTVTYPE: "actv_code_type_id", ACTVCODE: "actv_code_id", TASK: "task_id", TASKPRED: "task_pred_id", TASKRSRC: "taskrsrc_id" };
  const keys = {};
  for (const [t, rows] of Object.entries(tables)) {
    if (!FIELDS[t]) { say(`${t}: not a table this writer knows`); continue; }
    for (const r of rows) {
      if (Object.keys(r).join(" ") !== FIELDS[t].join(" ")) { say(`${t}: fields differ from P6's`); break; }
    }
    const k = KEY[t];
    if (!k) continue;
    keys[t] = new Set();
    for (const r of rows) {
      if (!/^\d+$/.test(r[k])) say(`${t} ${r[k]}: id is not a whole number`);
      if (keys[t].has(r[k])) say(`${t} ${r[k]}: id repeated`);
      keys[t].add(r[k]);
    }
  }
  const ref = (t, field, target, optional = false) => {
    for (const r of tables[t] || []) {
      const v = r[field];
      if (v === "" && optional) continue;
      if (!keys[target]?.has(v)) say(`${t} ${r[KEY[t]] ?? ""}: ${field} ${v || "(empty)"} is not in ${target}`);
    }
  };
  ref("PROJECT", "clndr_id", "CALENDAR"); ref("PROJECT", "fintmpl_id", "FINTMPL");
  ref("CALENDAR", "proj_id", "PROJECT", true);
  ref("SCHEDOPTIONS", "proj_id", "PROJECT");
  ref("PROJWBS", "proj_id", "PROJECT"); ref("PROJWBS", "parent_wbs_id", "PROJWBS", true); ref("PROJWBS", "obs_id", "OBS");
  ref("RSRC", "clndr_id", "CALENDAR"); ref("RSRC", "curr_id", "CURRTYPE");
  ref("ACTVTYPE", "proj_id", "PROJECT"); ref("ACTVCODE", "actv_code_type_id", "ACTVTYPE");
  ref("TASK", "proj_id", "PROJECT"); ref("TASK", "wbs_id", "PROJWBS"); ref("TASK", "clndr_id", "CALENDAR");
  ref("TASKPRED", "task_id", "TASK"); ref("TASKPRED", "pred_task_id", "TASK");
  ref("TASKACTV", "task_id", "TASK"); ref("TASKACTV", "actv_code_id", "ACTVCODE"); ref("TASKACTV", "actv_code_type_id", "ACTVTYPE");
  ref("TASKRSRC", "task_id", "TASK"); ref("TASKRSRC", "rsrc_id", "RSRC");
  const nodes = (tables.PROJWBS || []).filter((w) => w.proj_node_flag === "Y");
  if (nodes.length !== 1) say(`PROJWBS: ${nodes.length} project nodes (P6 needs one)`);
  // every WBS node reaches the project node
  const wbs = new Map((tables.PROJWBS || []).map((w) => [w.wbs_id, w]));
  for (const w of wbs.values()) {
    let x = w, hops = 0;
    while (x && x.proj_node_flag !== "Y" && hops++ < 1000) x = wbs.get(x.parent_wbs_id);
    if (!x) say(`PROJWBS ${w.wbs_id}: does not reach the project node`);
  }
  const codes = new Set();
  for (const t of tables.TASK || []) {
    if (codes.has(t.task_code)) say(`TASK ${t.task_code}: activity ID repeated`);
    codes.add(t.task_code);
    if (!t.task_code) say(`TASK ${t.task_id}: no activity ID`);
    if (t.status_code !== "TK_NotStart" && !t.act_start_date) say(`TASK ${t.task_code}: ${t.status_code} with no actual start`);
    if (t.status_code === "TK_Complete" && !t.act_end_date) say(`TASK ${t.task_code}: complete with no actual finish`);
  }
  for (const [t, rows] of Object.entries(tables)) for (const r of rows) for (const [f, v] of Object.entries(r)) {
    if (f !== "clndr_data" && /[\t\r\n]/.test(v)) say(`${t}.${f}: tab or line break in a value`);
    if (MAX[f] && v.length > MAX[f]) say(`${t}.${f}: ${v.length} characters (P6 takes ${MAX[f]})`);
    if (/_date$|_date2$/.test(f) && v && !/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(v)) say(`${t}.${f}: date ${v} is not YYYY-MM-DD HH:MM`);
  }
  return out;
}
