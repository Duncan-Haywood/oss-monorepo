// Microsoft Project XML (MSPDI) -> Primavera P6 XER, ready for P6's import
// (File > Import > Primavera PM - (XER)). Someone who planned in Microsoft
// Project and must submit a P6 file to an owner or a general contractor gets
// one without a P6 seat or a paid converter. Nothing is uploaded: this runs
// in the browser tab (or the CLI).
//
// p6XerText(text, { projectId, activityIds, deadlines, typesFrom }) -> { xer, text, bytes, encoding, counts, warnings }
// (save `bytes`: Windows-1252, P6's code page, when the text fits it)
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
//   resources material ones (their units). Cost resources have no P6 type:
//   their assignments become expenses (PROJCOST), as do task fixed costs
//   (see "expenses" below). Assignments keep budgeted, actual and remaining units
//   and cost; P6 recomputes units per hour and the rate from them.
//
// - custom fields: the task Number, Cost and Date fields a file uses become
//   activity user-defined fields (UDFTYPE, UDFVALUE), titled by the field's
//   Alias (else Number3, Cost1, Date2): whole numbers as integer UDFs, other
//   numbers as decimal ones, costs as cost UDFs, dates as start-date UDFs. So
//   the UDFs msproject.mjs writes from an XER come back as UDFs, and a
//   Project planner's own custom fields reach the P6 file. (Text fields
//   become activity codes, above.) The resource Text, Number, Cost and Date
//   fields become resource UDFs (table RSRC) the same way, text as text UDFs,
//   so the resource UDFs msproject.mjs writes from an XER come back. The
//   same task fields on summary tasks (Text fields too, but not the Activity
//   ID one) become WBS UDFs (table PROJWBS) on the WBS nodes they turn into,
//   so the WBS UDFs msproject.mjs writes onto summary tasks come back.
//
// - UDF types from the original XER (optional, { typesFrom: xer text or
//   parsed XER }, CLI --types-from original.xer): Project has one kind of
//   Number field, so a P6 decimal UDF that held only whole numbers (a
//   "PERCENT COMPLETE" of 0, 50 and 100) would come back as an integer one,
//   and P6 then refuses a 37.5 typed into it later. When the file came from
//   an XER and that XER is to hand, each UDF whose title (and subject area)
//   matches one in it takes its P6 type: integer or decimal for numbers, start
//   or finish for dates (the eleventh finish-date UDF msproject.mjs had to put
//   in a Date field). An integer type is not taken when a value is no longer
//   whole; that is counted in the warnings (eval/udf-types-from-2026-11-22.md).
//
// - notes: a task's notes become its notebook entries (TASKMEMO), one per
//   "[Topic]" section (the form msproject.mjs writes a P6 notebook in), else
//   one under the topic "Notes"; a summary task's go on its WBS node
//   (WBSMEMO), the project's own notes on the project node. Each entry is
//   the HTML P6 Web writes (one <P> per line). MEMOTYPE lists the topics.
//
// - deadlines (opt-in, { deadlines: true }, CLI --deadlines): P6 has no
//   deadline field; the nearest thing is a finish-on-or-before constraint,
//   which in P6 too moves no early date and caps the late finish, as
//   Project's deadline caps total slack. With no constraint of its own the
//   task gets it as its primary constraint (P6 takes a secondary only after
//   a primary); beside a start-on-or-after, start-on-or-before,
//   finish-on-or-after or as-late-as-possible it is the secondary; beside a
//   finish-on-or-before the earlier date is kept; beside a start-on,
//   finish-on or mandatory constraint (P6 allows no secondary there) it is
//   not carried and named. Off by default: it adds constraints a DCMA
//   reviewer counts as hard ones (check 5), and comes back from
//   msproject.mjs as a deadline only where it was the secondary.
//
// Work contours (Assignment WorkContour 1-7: back loaded, front loaded,
// double peak, early peak, late peak, bell, turtle) are written as P6
// resource curves (RSRCCURVDATA, named "MS Project <contour>", and the
// assignment's curv_id) with the shape Project gives the work over the
// assignment's dates (contours.mjs, measured from Project's own timephased
// work: eval/work-contours-2026-11-21.md). They are not P6's shipped curves
// of the same names, which have other shapes. Project stretches a contoured
// assignment's dates; the task's dates written here already hold that.
//
// Not carried (counted in the warnings): task splits and hand-contoured
// work (WorkContour 8, edited timephased work), deadlines unless asked for, elapsed lags on links (P6 has one lag
// calendar per project), cost resource assignments on summary tasks, P6's finish-date subtype of a date
// UDF (Project has one kind of date field, so a date comes back as a start
// date UDF).

import { parseMspdi, parseXml, durationHours } from "./mspdi.mjs";
import { xerText, xerBytes, parseXer } from "./xer.mjs";
import { memoHtml } from "./notebook.mjs";
import { contourCurveValues, contourName } from "./contours.mjs";
import { RSRC_TEXT_IDS, RSRC_NUMBER_IDS, RSRC_COST_IDS, RSRC_DATE_IDS, RSRC_START_IDS, RSRC_FINISH_IDS } from "./msproject.mjs";

// Project's resource custom fields, by PjField id -> [kind, field name]
const RSRC_FIELDS = new Map([
  ...RSRC_TEXT_IDS.map((id, k) => [id, ["text", `Text${k + 1}`]]),
  ...RSRC_NUMBER_IDS.map((id, k) => [id, ["number", `Number${k + 1}`]]),
  ...RSRC_COST_IDS.map((id, k) => [id, ["cost", `Cost${k + 1}`]]),
  ...RSRC_DATE_IDS.map((id, k) => [id, ["date", `Date${k + 1}`]]),
  ...RSRC_START_IDS.map((id, k) => [id, ["date", `Start${k + 1}`]]),
  ...RSRC_FINISH_IDS.map((id, k) => [id, ["finish", `Finish${k + 1}`]]),
]);
const isoToXer = (s) => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s || ""); return m ? `${m[1]} ${m[2]}` : ""; };

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
  // notebook topics and entries, as P6 7.0 to 24.12 write them
  MEMOTYPE: "memo_type_id seq_num eps_flag proj_flag wbs_flag task_flag memo_type",
  WBSMEMO: "wbs_memo_id proj_id memo_type_id wbs_id wbs_memo",
  TASKMEMO: "memo_id task_id memo_type_id proj_id task_memo",
  // P6 6.0 to 24.12 write these (24.12 adds export_flag, left out so older
  // versions import it)
  // expenses and their categories, as P6 20.12 and 23.12 write them
  COSTTYPE: "cost_type_id seq_num cost_type",
  PROJCOST: "cost_item_id acct_id pobs_id cost_type_id proj_id task_id cost_name po_number vendor_name act_cost cost_per_qty remain_cost target_cost cost_load_type auto_compute_act_flag target_qty qty_name cost_descr contract_manager_import",
  // resource curves, as P6 6.0 to 24.12 write them (a global table)
  RSRCCURVDATA: ["curv_id curv_name default_flag", ...Array.from({ length: 21 }, (_, k) => `pct_usage_${k}`)].join(" "),
  UDFTYPE: "udf_type_id table_name udf_type_name udf_type_label logical_data_type super_flag indicator_expression summary_indicator_expression",
  UDFVALUE: "udf_type_id fk_id proj_id udf_date udf_number udf_text udf_code_id",
  TASKRSRC: "taskrsrc_id task_id proj_id cost_qty_link_flag role_id acct_id rsrc_id pobs_id skill_level remain_qty target_qty remain_qty_per_hr target_lag_drtn_hr_cnt target_qty_per_hr act_ot_qty act_reg_qty relag_drtn_hr_cnt ot_factor cost_per_qty target_cost act_reg_cost act_ot_cost remain_cost act_start_date act_end_date restart_date reend_date target_start_date target_end_date rem_late_start_date rem_late_end_date rollup_dates_flag target_crv remain_crv actual_crv ts_pend_act_end_flag guid rate_type act_this_per_cost act_this_per_qty curv_id rsrc_type cost_per_qty_source_type create_user create_date has_rsrchours taskrsrc_sum_id",
};
for (const k of Object.keys(FIELDS)) FIELDS[k] = FIELDS[k].split(" ");

// P6's field lengths: longer values are cut (and counted), as P6's import
// would refuse them
const MAX = { proj_short_name: 40, wbs_short_name: 40, wbs_name: 100, task_code: 40, task_name: 120, clndr_name: 60, rsrc_short_name: 40, rsrc_name: 100, actv_code_type: 60, short_name: 60, actv_code_name: 100, udf_type_label: 40, udf_text: 255, memo_type: 40 };

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

// UDF types from the original XER (see "UDF types from the original XER"
// above). Titles match as msproject.mjs writes them: square brackets as round
// ones, case and outer spaces ignored, within a subject area (TASK, PROJWBS,
// RSRC). Only a number type for a number type and a date type for a date type.
const NUM_TYPE = /^FT_(INT|FLOAT|FLOAT_2_DECIMALS)$/, DATE_TYPE = /^FT_(START|END)_DATE$/;
export const udfTitleKey = (table, title) => `${table}|${String(title ?? "").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim().toLowerCase()}`;
export function udfTyper(typesFrom) {
  const ref = typeof typesFrom === "string" ? parseXer(typesFrom) : typesFrom;
  const known = new Map();
  for (const u of ref?.tables?.UDFTYPE || []) {
    const k = udfTitleKey(u.table_name, u.udf_type_label || u.udf_type_name);
    if (!known.has(k)) known.set(k, u.logical_data_type);
  }
  const t = { ref: Boolean(ref), matched: 0, changed: 0, values: 0, notWhole: [], unmatched: 0 };
  t.type = (table, title, type, rows) => {
    if (!ref || type === "FT_TEXT" || type === "FT_MONEY") return type;
    const r = known.get(udfTitleKey(table, title));
    if (!r) { t.unmatched++; return type; }
    if (!(NUM_TYPE.test(type) && NUM_TYPE.test(r)) && !(DATE_TYPE.test(type) && DATE_TYPE.test(r))) { t.unmatched++; return type; }
    t.matched++;
    if (r === type) return type;
    if (r === "FT_INT" && !rows.every((x) => Number.isInteger(Number(x.udf_number)))) { t.notWhole.push(title); return type; }
    t.changed++; t.values += rows.length;
    return r;
  };
  t.note = () => `user-defined field types from the original XER: ${t.matched} field(s) matched by title${t.changed ? `, ${t.changed} given the original's type (${t.values} value(s); a decimal UDF holding whole numbers stays decimal, a finish-date UDF in a Date field stays a finish date)` : ", all already of the original's type"}${t.notWhole.length ? `; ${t.notWhole.length} kept decimal though integer in the original, as a value is no longer whole: ${t.notWhole.slice(0, 5).join(", ")}${t.notWhole.length > 5 ? ", ..." : ""}` : ""}${t.unmatched ? `; ${t.unmatched} number or date field(s) with no title of that kind in it keep the type read from Project` : ""}`;
  return t;
}

// a Project deadline as P6 constraints (see "deadlines" above)
const SECONDARY_OK = new Set(["CS_MSOA", "CS_MSOB", "CS_MEOA", "CS_ALAP"]);
const NO_SECONDARY = new Set(["CS_MSO", "CS_MEO", "CS_MANDSTART", "CS_MANDFIN"]);
export function deadlineConstraint(r, dl) {
  const d = r.deadline_date;
  const out = { cstr_type: r.cstr_type, cstr_date: r.cstr_date, cstr_type2: "", cstr_date2: "" };
  if (!r.cstr_type) { out.cstr_type = "CS_MEOB"; out.cstr_date = d; dl.primary++; }
  else if (r.cstr_type === "CS_MEOB") { if (!r.cstr_date || d < r.cstr_date) out.cstr_date = d; dl.merged++; }
  else if (SECONDARY_OK.has(r.cstr_type)) { out.cstr_type2 = "CS_MEOB"; out.cstr_date2 = d; dl.secondary++; }
  else if (NO_SECONDARY.has(r.cstr_type)) dl.blocked.push(`${r.ms_id || r.task_id} ${r.task_name}`.trim());
  return out;
}

export function p6XerText(text, { projectId = "", activityIds = "auto", deadlines: carryDeadlines = false, typesFrom = null } = {}) {
  const parsed = parseMspdi(text);
  const T = parsed.tables;
  const warnings = [...parsed.warnings];
  const typer = udfTyper(typesFrom);
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
  const RSRC = [], TASKRSRC = [], RSRCCURVDATA = [];
  const curveOf = new Map(); // WorkContour -> written curv_id
  let contoured = 0, handContoured = 0;
  const contourCurve = (wc) => {
    if (!contourName(wc)) return "";
    if (!curveOf.has(wc)) {
      const id = String(RSRCCURVDATA.length + 1);
      const v = contourCurveValues(wc);
      RSRCCURVDATA.push(full("RSRCCURVDATA", { curv_id: id, curv_name: `MS Project ${contourName(wc)}`, default_flag: "N", ...Object.fromEntries(v.map((x, k) => [`pct_usage_${k}`, String(x)])) }));
      curveOf.set(wc, id);
    }
    return curveOf.get(wc);
  };
  const rsrcType = new Map();
  let costRes = 0, costAssign = 0, dupRsrc = 0, summaryAssign = 0, summaryCost = 0, rsrcNotes = 0, costNotes = 0;
  const costRsrc = new Map(); // cost resource uid -> { name, group, accrue }
  const rsrcShort = new Set();
  const rsrcGroup = new Map(); // rsrc_id -> the Project resource's Group
  const rsrcFieldVals = new Map(); // resource field id -> Map(rsrc uid -> value)
  for (const r of kids(kid(proj, "Resources"), "Resource")) {
    const uid = val(r, "UID");
    if (!uid || uid === "0" || val(r, "IsNull") === "1" || !val(r, "Name")) continue;
    const type = val(r, "Type") === "" ? "1" : val(r, "Type");
    if (type === "2") { costRes++; if ((val(r, "Notes") || "").trim()) costNotes++; costRsrc.set(uid, { name: val(r, "Name"), group: val(r, "Group"), accrue: val(r, "AccrueAt") }); continue; }
    const rt = type === "0" ? "RT_Mat" : "RT_Labor";
    rsrcType.set(uid, rt);
    const name = val(r, "Name");
    // P6's resource ID must be unique, and Project fills Initials with the
    // name's first letter (Carpenter and Crane are both "C"), so repeats get
    // a -2, -3 suffix as activity IDs do
    let short = clip("rsrc_short_name", val(r, "Initials") || name.replace(/\s+/g, "").toUpperCase());
    if (rsrcShort.has(short)) { dupRsrc++; let k = 2; while (rsrcShort.has(`${short.slice(0, MAX.rsrc_short_name - String(k).length - 1)}-${k}`)) k++; short = `${short.slice(0, MAX.rsrc_short_name - String(k).length - 1)}-${k}`; }
    rsrcShort.add(short);
    for (const e of kids(r, "ExtendedAttribute")) {
      const fid = val(e, "FieldID"), v = val(e, "Value");
      if (!RSRC_FIELDS.has(fid) || !v) continue;
      if (!rsrcFieldVals.has(fid)) rsrcFieldVals.set(fid, new Map());
      rsrcFieldVals.get(fid).set(uid, v);
    }
    // the resource's notes (plain text in Project's XML) as P6's resource
    // notes, written as P6 Web writes rich text (notebook.mjs's memoHtml)
    const rnote = (val(r, "Notes") || "").trim();
    if (rnote) rsrcNotes++;
    const group = (val(r, "Group") || "").trim();
    if (group) rsrcGroup.set(idOf("RSRC", uid), group);
    RSRC.push(full("RSRC", {
      rsrc_id: idOf("RSRC", uid), clndr_id: projCal, rsrc_seq_num: String(RSRC.length + 1),
      rsrc_name: clip("rsrc_name", name), rsrc_short_name: short, rsrc_notes: rnote ? memoHtml(rnote) : "",
      email_addr: "", def_qty_per_hr: n2((Number(val(r, "MaxUnits")) || 1)), rsrc_type: rt,
    }, { cost_qty_type: "QT_Hour", active_flag: "Y", auto_compute_act_flag: "N", def_cost_qty_link_flag: "Y", ot_flag: "N", curr_id: "1", load_tasks_flag: "", level_flag: "Y" }));
  }

  // Project's resource Group as P6's resource hierarchy (parent_rsrc_id):
  // a path of resource IDs from the top, "/" between them, as msproject.mjs
  // writes P6's tree ("LAB/CARP"). Each step is the resource with that ID
  // when the file has one, else a new labour resource of that ID and name
  // (a Project file whose Group is a plain word, "Electrical", gets one
  // parent of that name: P6 has no resource group field, and its hierarchy
  // is where P6 users file resources by trade). A step already given a
  // parent by its own Group keeps it; a link that would make a loop is not made.
  const hier = { groups: 0, parentsAdded: 0, loops: 0 };
  {
    const byShort = new Map(RSRC.map((x) => [x.rsrc_short_name, x]));
    const byId = new Map(RSRC.map((x) => [x.rsrc_id, x]));
    const above = (x, target) => { // is `target` x or an ancestor of x?
      const seen = new Set();
      for (let p = x; p && !seen.has(p.rsrc_id); p = byId.get(p.parent_rsrc_id)) { if (p === target) return true; seen.add(p.rsrc_id); }
      return false;
    };
    for (const [id, group] of rsrcGroup) {
      const row = byId.get(id);
      const steps = group.split("/").map((g) => g.trim()).filter(Boolean);
      if (!row || !steps.length) continue;
      hier.groups++;
      let parent = null, path = "";
      for (const step of steps) {
        path += `/${step}`;
        const short = clip("rsrc_short_name", step);
        let node = byShort.get(short);
        if (!node) {
          node = full("RSRC", {
            rsrc_id: idOf("RSRC", `group:${path}`), clndr_id: projCal, rsrc_seq_num: String(RSRC.length + 1),
            rsrc_name: clip("rsrc_name", step), rsrc_short_name: short, rsrc_notes: "", email_addr: "", def_qty_per_hr: "1", rsrc_type: "RT_Labor",
          }, { cost_qty_type: "QT_Hour", active_flag: "Y", auto_compute_act_flag: "N", def_cost_qty_link_flag: "Y", ot_flag: "N", curr_id: "1", load_tasks_flag: "", level_flag: "Y" });
          RSRC.push(node); byShort.set(short, node); byId.set(node.rsrc_id, node); rsrcShort.add(short);
          hier.parentsAdded++;
        }
        if (parent && !node.parent_rsrc_id && node !== parent) {
          if (above(parent, node)) hier.loops++; else node.parent_rsrc_id = parent.rsrc_id;
        }
        parent = node;
      }
      if (parent && parent !== row && !row.parent_rsrc_id) {
        if (above(parent, row)) hier.loops++; else row.parent_rsrc_id = parent.rsrc_id;
      }
    }
    // parents before their children, as P6 lists the tree
    const depth = (x) => { let d = 0; const seen = new Set(); for (let p = byId.get(x.parent_rsrc_id); p && !seen.has(p.rsrc_id); p = byId.get(p.parent_rsrc_id)) { seen.add(p.rsrc_id); d++; } return d; };
    if (hier.groups) {
      const order = RSRC.map((x, i) => [depth(x), i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[2]);
      RSRC.splice(0, RSRC.length, ...order);
    }
  }

  // activities
  const TASK = [];
  const taskIds = new Set();
  let deadlines = 0;
  const dl = { primary: 0, secondary: 0, merged: 0, blocked: [] };
  for (const r of T.TASK) {
    const node = taskNode.get(r.task_id);
    if (val(node, "Deadline")) deadlines++;
    const c = carryDeadlines && r.deadline_date ? deadlineConstraint(r, dl) : { cstr_type: r.cstr_type, cstr_date: r.cstr_date, cstr_type2: "", cstr_date2: "" };
    taskIds.add(r.task_id);
    const pct = Math.max(0, Math.min(100, Number(val(node, "PercentComplete")) || 0));
    TASK.push(full("TASK", {
      task_id: idOf("TASK", r.task_id), proj_id: P, wbs_id: idOf("WBS", srcWbs.has(r.wbs_id) ? r.wbs_id : ""), clndr_id: idOf("CAL", r.clndr_id),
      phys_complete_pct: String(r.status_code === "TK_Complete" ? 100 : pct), task_type: r.task_type, status_code: r.status_code,
      task_code: codeFor(r), task_name: clip("task_name", r.task_name),
      total_float_hr_cnt: r.total_float_hr_cnt, free_float_hr_cnt: r.free_float_hr_cnt,
      remain_drtn_hr_cnt: n2(Number(r.remain_drtn_hr_cnt) || 0), target_drtn_hr_cnt: n2(Number(r.target_drtn_hr_cnt) || 0),
      cstr_type: c.cstr_type, cstr_date: c.cstr_date, cstr_type2: c.cstr_type2, cstr_date2: c.cstr_date2,
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

  // expenses (PROJCOST): P6 has no cost resource; a cost it keeps on an
  // activity without hours or units is an expense item. So each assignment
  // of a Project cost resource becomes an expense named after the resource,
  // in the cost category (COSTTYPE) named by the resource's Group, accrued as
  // the resource accrues (Project's AccrueAt 1 start, 2 end, 3 prorated ->
  // P6's CL_Start, CL_End, CL_Uniform). Budgeted cost is the assignment's
  // baseline cost when it has one (P6's budget is the plan), else its cost;
  // actual and remaining as Project stores them. A task's fixed cost becomes
  // an expense named "Fixed cost". The assignment notes msproject.mjs writes
  // for a P6 expense ("Expense: ", "Vendor: ", "PO: ", "Quantity: " lines,
  // then the description) come back as those fields: the expense name, when
  // msproject.mjs had to give the resource another, and the rest.
  const COSTTYPE = [], PROJCOST = [];
  const costType = new Map();
  const typeOf = (name) => {
    name = (name || "").trim();
    if (!name) return "";
    if (!costType.has(name.toLowerCase())) {
      const id = String(COSTTYPE.length + 1);
      costType.set(name.toLowerCase(), id);
      COSTTYPE.push(full("COSTTYPE", { cost_type_id: id, seq_num: String(COSTTYPE.length * 10), cost_type: name }));
    }
    return costType.get(name.toLowerCase());
  };
  const LOAD = { 1: "CL_Start", 2: "CL_End", 3: "CL_Uniform" };
  const money = (node, k) => (Number(val(node, k)) || 0) / 100;
  function expense(taskId, res, a) {
    const tc = money(a, "Cost"), ac = money(a, "ActualCost");
    const rc = val(a, "RemainingCost") ? money(a, "RemainingCost") : Math.max(0, tc - ac);
    const base = kids(a, "Baseline").find((b) => (val(b, "Number") || "0") === "0" && val(b, "Cost") !== "");
    const budget = base ? money(base, "Cost") : tc;
    const meta = { name: "", vendor: "", po: "", qty: "", unit: "", descr: [] };
    for (const line of (val(a, "Notes") || "").split(/\r?\n/)) {
      const m = /^(Expense|Vendor|PO|Quantity):\s*(.*)$/.exec(line);
      if (m && !meta.descr.length) {
        if (m[1] === "Expense") meta.name = m[2];
        else if (m[1] === "Vendor") meta.vendor = m[2];
        else if (m[1] === "PO") meta.po = m[2];
        else { const q = /^(-?[\d.]+)\s*(.*)$/.exec(m[2]); if (q) { meta.qty = q[1]; meta.unit = q[2]; } }
      } else if (line.trim() || meta.descr.length) meta.descr.push(line);
    }
    const qty = Number(meta.qty) || 0;
    PROJCOST.push(full("PROJCOST", {
      cost_item_id: String(PROJCOST.length + 1), cost_type_id: typeOf(res.group), proj_id: P, task_id: taskId,
      cost_name: clip("cost_name", meta.name || res.name), po_number: clip("po_number", meta.po), vendor_name: clip("vendor_name", meta.vendor),
      act_cost: n2(ac), remain_cost: n2(rc), target_cost: n2(budget),
      // P6's budgeted cost is units x price: one unit at the whole cost, or
      // the quantity the notes carry
      target_qty: qty ? meta.qty : "1", cost_per_qty: qty ? String(Math.round((budget / qty) * 10000) / 10000) : n2(budget),
      qty_name: clip("qty_name", meta.unit), cost_load_type: Object.hasOwn(LOAD, res.accrue) ? LOAD[res.accrue] : "CL_Uniform",
      cost_descr: meta.descr.join("\n").trim().replace(/\r?\n/g, " "),
    }, { auto_compute_act_flag: "N" }));
  }
  // task fixed costs: actual by Project's accrual (start: all once started;
  // end: all once finished; prorated: the % complete share)
  let fixedCosts = 0;
  for (const r of T.TASK) {
    const node = taskNode.get(r.task_id);
    const fc = money(node, "FixedCost");
    if (!fc) continue;
    fixedCosts++;
    const acc = val(node, "FixedCostAccrual") || "3";
    const pct = Math.max(0, Math.min(100, Number(val(node, "PercentComplete")) || 0));
    const act = r.status_code === "TK_Complete" ? fc : acc === "1" ? (r.status_code === "TK_Active" ? fc : 0) : acc === "2" ? 0 : Math.round(fc * pct) / 100;
    PROJCOST.push(full("PROJCOST", {
      cost_item_id: String(PROJCOST.length + 1), cost_type_id: "", proj_id: P, task_id: idOf("TASK", r.task_id), cost_name: "Fixed cost",
      act_cost: n2(act), remain_cost: n2(fc - act), target_cost: n2(fc), target_qty: "1", cost_per_qty: n2(fc), cost_load_type: Object.hasOwn(LOAD, acc) ? LOAD[acc] : "CL_Uniform",
    }, { auto_compute_act_flag: "N" }));
  }

  // assignments: P6 keeps hours (labour) or units (material) and cost
  const hrs = (s) => durationHours(s) ?? 0;
  for (const a of kids(kid(proj, "Assignments"), "Assignment")) {
    const tu = val(a, "TaskUID"), ru = val(a, "ResourceUID");
    if (!taskIds.has(tu)) { if (taskNode.has(tu) && rsrcType.has(ru)) summaryAssign++; if (taskNode.has(tu) && costRsrc.has(ru)) summaryCost++; continue; }
    if (costRsrc.has(ru)) { costAssign++; expense(idOf("TASK", tu), costRsrc.get(ru), a); continue; }
    if (!rsrcType.has(ru)) continue;
    const t = taskRow.get(idOf("TASK", tu));
    const target = hrs(val(a, "Work")), act = hrs(val(a, "ActualWork"));
    const remain = val(a, "RemainingWork") ? hrs(val(a, "RemainingWork")) : Math.max(0, target - act);
    // MSPDI costs are in hundredths of the currency unit
    const cost = (k) => (Number(val(a, k)) || 0) / 100;
    const tc = cost("Cost"), ac = cost("ActualCost"), rc = val(a, "RemainingCost") ? cost("RemainingCost") : Math.max(0, tc - ac);
    const dur = Number(t.target_drtn_hr_cnt) || 0;
    const rt = rsrcType.get(ru);
    const wc = val(a, "WorkContour").trim();
    const curv = contourCurve(wc);
    if (curv) contoured++;
    else if (wc === "8") handContoured++;
    TASKRSRC.push(full("TASKRSRC", {
      taskrsrc_id: idOf("TASKRSRC", val(a, "UID") || `${tu}-${ru}`), task_id: t.task_id, proj_id: P, rsrc_id: idOf("RSRC", ru),
      remain_qty: n2(remain), target_qty: n2(target), act_reg_qty: n2(act), act_ot_qty: "0",
      target_qty_per_hr: n2(dur ? target / dur : 0), remain_qty_per_hr: n2(Number(t.remain_drtn_hr_cnt) ? remain / Number(t.remain_drtn_hr_cnt) : 0),
      cost_per_qty: n2(target ? tc / target : 0), target_cost: n2(tc), act_reg_cost: n2(ac), act_ot_cost: "0", remain_cost: n2(rc),
      act_start_date: t.act_start_date, act_end_date: t.act_end_date, restart_date: t.restart_date, reend_date: t.reend_date,
      target_start_date: t.target_start_date, target_end_date: t.target_end_date, rsrc_type: rt, curv_id: curv,
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
  let trees = 0, kept = 0;
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
    // an outline code's lookup table gives each value its parent (mspdi.mjs):
    // keep that tree as it is, parents first
    const inType = new Map(codes.map((c) => [c.actv_code_id, c]));
    if (codes.some((c) => inType.has(c.parent_actv_code_id))) {
      kept++;
      const depth = (c) => { let n = 0; for (let x = c; x && inType.has(x.parent_actv_code_id) && n < codes.length; x = inType.get(x.parent_actv_code_id)) n++; return n; };
      for (const c of [...codes].sort((x, y) => depth(x) - depth(y))) {
        len = Math.max(len, c.short_name.length);
        const id = idOf("ACODE", c.actv_code_id);
        ACTVCODE.push(full("ACTVCODE", { actv_code_id: id, parent_actv_code_id: inType.has(c.parent_actv_code_id) ? idOf("ACODE", c.parent_actv_code_id) : "", actv_code_type_id: typeId, actv_code_name: clip("actv_code_name", c.actv_code_name), short_name: clip("short_name", c.short_name), seq_num: String(ACTVCODE.length + 1), color: "", total_assignments: "" }));
        leafOf.set(c.actv_code_id, id);
      }
      ACTVTYPE.push(full("ACTVTYPE", { actv_code_type_id: typeId, actv_short_len: String(Math.min(60, len)), seq_num: a.seq_num, actv_code_type: clip("actv_code_type", a.actv_code_type), proj_id: P, actv_code_type_scope: "AS_Project" }));
      continue;
    }
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

  // activity user-defined fields (mspdi.mjs reads them from Number, Cost and
  // Date fields). P6 needs a UDF's title unique within its subject area.
  const UDFTYPE = [], UDFVALUE = [];
  const udfLabels = new Set();
  let udfDupLabels = 0;
  // WBS user-defined fields (mspdi.mjs reads them from the summary tasks'
  // fields) the same way, on the WBS nodes; titles are unique per subject area
  const wbsLabels = new Set();
  let wbsUdfFields = 0, wbsUdfValues = 0;
  for (const u of (T.UDFTYPE || []).filter((x) => x.table_name === "TASK" || x.table_name === "PROJWBS")) {
    const wbs = u.table_name === "PROJWBS";
    const rows = (T.UDFVALUE || []).filter((v) => v.udf_type_id === u.udf_type_id && (wbs ? srcWbs.has(v.fk_id) : taskIds.has(v.fk_id)));
    if (!rows.length) continue;
    const id = idOf("UDF", wbs ? `wbs-${u.udf_type_id}` : u.udf_type_id);
    const seen = wbs ? wbsLabels : udfLabels;
    let label = clip("udf_type_label", u.udf_type_label || u.udf_type_name);
    if (seen.has(label.toLowerCase())) { udfDupLabels++; let k = 2; const cut = (x) => `${label.slice(0, MAX.udf_type_label - String(x).length - 3)} (${x})`; while (seen.has(cut(k).toLowerCase())) k++; label = cut(k); }
    seen.add(label.toLowerCase());
    UDFTYPE.push(full("UDFTYPE", { udf_type_id: id, table_name: u.table_name, udf_type_name: `user_field_${id}`, udf_type_label: label, logical_data_type: typer.type(u.table_name, u.udf_type_label || u.udf_type_name, u.logical_data_type, rows), super_flag: "N" }));
    for (const v of rows) UDFVALUE.push(full("UDFVALUE", { udf_type_id: id, fk_id: idOf(wbs ? "WBS" : "TASK", v.fk_id), proj_id: P, udf_date: v.udf_date, udf_number: v.udf_number, udf_text: clip("udf_text", v.udf_text), udf_code_id: "" }));
    if (wbs) { wbsUdfFields++; wbsUdfValues += rows.length; }
  }

  // resource custom fields (Text, Number, Cost, Date) -> resource UDFs, the
  // inverse of msproject.mjs's resource fields. P6 writes a resource UDF's
  // value with an empty proj_id (resources are global).
  const fieldDefs = new Map(kids(kid(proj, "ExtendedAttributes"), "ExtendedAttribute").map((d) => [val(d, "FieldID"), { name: val(d, "FieldName"), alias: val(d, "Alias") }]));
  const rsrcLabels = new Set();
  let rsrcUdfValues = 0, rsrcUdfFields = 0, rsrcUnread = 0;
  for (const [fid, [kind, fname]] of RSRC_FIELDS) {
    const vals = rsrcFieldVals.get(fid);
    if (!vals) continue;
    const rows = [];
    for (const [uid, v] of vals) {
      if (kind === "text") { const x = v.trim() ? v : ""; if (x) rows.push({ uid, udf_text: clip("udf_text", x), udf_number: "", udf_date: "" }); continue; }
      if (kind === "date" || kind === "finish") { const d = isoToXer(v); if (d) rows.push({ uid, udf_text: "", udf_number: "", udf_date: d }); else rsrcUnread++; continue; }
      const n = Number(v);
      if (!Number.isFinite(n) || v.trim() === "") { rsrcUnread++; continue; }
      rows.push({ uid, udf_text: "", udf_date: "", udf_number: String(kind === "cost" ? n / 100 : n) });
    }
    if (!rows.length) continue;
    const def = fieldDefs.get(fid) || {};
    const id = idOf("UDF", `rsrc-${fid}`);
    let label = clip("udf_type_label", def.alias || def.name || fname);
    if (rsrcLabels.has(label.toLowerCase())) { udfDupLabels++; let k = 2; const cut = (x) => `${label.slice(0, MAX.udf_type_label - String(x).length - 3)} (${x})`; while (rsrcLabels.has(cut(k).toLowerCase())) k++; label = cut(k); }
    rsrcLabels.add(label.toLowerCase());
    const type = typer.type("RSRC", def.alias || def.name || fname, kind === "text" ? "FT_TEXT" : kind === "date" ? "FT_START_DATE" : kind === "finish" ? "FT_END_DATE" : kind === "cost" ? "FT_MONEY" : rows.every((r) => Number.isInteger(Number(r.udf_number))) ? "FT_INT" : "FT_FLOAT_2_DECIMALS", rows);
    UDFTYPE.push(full("UDFTYPE", { udf_type_id: id, table_name: "RSRC", udf_type_name: `user_field_${id}`, udf_type_label: label, logical_data_type: type, super_flag: "N" }));
    rsrcUdfFields++;
    for (const r of rows) { UDFVALUE.push(full("UDFVALUE", { udf_type_id: id, fk_id: idOf("RSRC", r.uid), proj_id: "", udf_date: r.udf_date, udf_number: r.udf_number, udf_text: r.udf_text, udf_code_id: "" })); rsrcUdfValues++; }
  }

  // notes -> notebook topics and entries (mspdi.mjs reads them from the task
  // notes, notebook.mjs); an entry on a summary task goes on its WBS node,
  // the project summary task's on the project node
  const MEMOTYPE = (T.MEMOTYPE || []).map((m) => full("MEMOTYPE", { memo_type_id: idOf("MEMOTYPE", m.memo_type_id), seq_num: m.seq_num, memo_type: clip("memo_type", m.memo_type) }, { eps_flag: "Y", proj_flag: "Y", wbs_flag: "Y", task_flag: "Y" }));
  const TASKMEMO = (T.TASKMEMO || []).filter((m) => taskIds.has(m.task_id)).map((m) => full("TASKMEMO", { memo_id: idOf("TASKMEMO", m.memo_id), task_id: idOf("TASK", m.task_id), memo_type_id: idOf("MEMOTYPE", m.memo_type_id), proj_id: P, task_memo: m.task_memo }));
  const WBSMEMO = (T.WBSMEMO || []).filter((m) => m.wbs_id === "" || srcWbs.has(m.wbs_id)).map((m) => full("WBSMEMO", { wbs_memo_id: idOf("WBSMEMO", m.wbs_memo_id), proj_id: P, memo_type_id: idOf("MEMOTYPE", m.memo_type_id), wbs_id: idOf("WBS", m.wbs_id), wbs_memo: m.wbs_memo }));

  const tables = {
    CURRTYPE: [full("CURRTYPE", { curr_id: "1", decimal_digit_cnt: "2", curr_symbol: "$", decimal_symbol: ".", digit_group_symbol: ",", pos_curr_fmt_type: "#1.1", neg_curr_fmt_type: "(#1.1)", curr_type: "US Dollar", curr_short_name: "USD", group_digit_cnt: "3", base_exch_rate: "1" })],
    // the financial period template the project names, as P6 20.12 writes it
    FINTMPL: [full("FINTMPL", { fintmpl_id: "1", fintmpl_name: "Calendar", default_flag: "Y" })],
    ...(MEMOTYPE.length ? { MEMOTYPE } : {}),
    OBS: [full("OBS", { obs_id: "1", seq_num: "0", obs_name: "Enterprise" })],
    ...(RSRCCURVDATA.length ? { RSRCCURVDATA } : {}),
    // P6 writes the UDF titles with the global tables, before PROJECT, and the values last
    ...(UDFTYPE.length ? { UDFTYPE } : {}),
    ...(COSTTYPE.length ? { COSTTYPE } : {}),
    PROJECT, CALENDAR, SCHEDOPTIONS, PROJWBS,
    ...(RSRC.length ? { RSRC } : {}),
    ...(ACTVTYPE.length ? { ACTVTYPE, ACTVCODE } : {}),
    TASK,
    ...(WBSMEMO.length ? { WBSMEMO } : {}),
    ...(PROJCOST.length ? { PROJCOST } : {}),
    ...(TASKMEMO.length ? { TASKMEMO } : {}),
    TASKPRED,
    ...(TASKACTV.length ? { TASKACTV } : {}),
    ...(TASKRSRC.length ? { TASKRSRC } : {}),
    ...(UDFVALUE.length ? { UDFVALUE } : {}),
  };

  if (idField) warnings.push(`activity IDs from the "Activity ID" text field on ${fromField} of ${TASK.length} activities${fromField < TASK.length ? `; the rest are A + row ID x 10` : ""}`);
  else warnings.push(`activity IDs are A + Project's row ID x 10 (A10, A20, ...), as no text field is named "Activity ID"`);
  if (dupIds) warnings.push(`${dupIds} repeated activity ID(s) given a -2, -3 suffix (P6 needs them unique)`);
  if (kept) warnings.push(`${kept} activity code type(s) keep the hierarchy of their outline code's lookup table`);
  if (trees) warnings.push(`${trees} activity code type(s) written as parent.child paths rebuilt as P6 code hierarchies`);
  if (dupRsrc) warnings.push(`${dupRsrc} repeated resource ID(s) given a -2, -3 suffix (P6 needs them unique; Project fills Initials with the name's first letter)`);
  if (contoured) warnings.push(`${contoured} contoured assignment(s) written with a resource curve of Project's shape (${[...curveOf.keys()].map((w) => `MS Project ${contourName(w)}`).join(", ")}): P6 spreads their units and cost as Project spreads the work`);
  if (handContoured) warnings.push(`${handContoured} assignment(s) with hand-edited timephased work (contour "Contoured") written with an even spread: P6 has no per-period edit an XER carries`);
  if (summaryAssign) warnings.push(`${summaryAssign} assignment(s) on summary tasks not carried: summary tasks become WBS nodes in P6, which hold no resources`);
  const dateNote = (tab) => {
    const st = UDFTYPE.some((u) => u.table_name === tab && u.logical_data_type === "FT_START_DATE"), fi = UDFTYPE.some((u) => u.table_name === tab && u.logical_data_type === "FT_END_DATE");
    return st && fi ? " (Date and Start fields as start-date UDFs, Finish fields as finish-date UDFs)" : st ? " (dates as start-date UDFs)" : fi ? " (Finish fields as finish-date UDFs)" : "";
  };
  const taskUdfTypes = UDFTYPE.length - rsrcUdfFields - wbsUdfFields, taskUdfValues = UDFVALUE.length - rsrcUdfValues - wbsUdfValues;
  if (taskUdfTypes) warnings.push(`${taskUdfValues} custom field value(s) in ${taskUdfTypes} field(s) written as activity user-defined fields${dateNote("TASK")}`);
  if (wbsUdfFields) warnings.push(`${wbsUdfValues} summary task custom field value(s) in ${wbsUdfFields} field(s) written as WBS user-defined fields${dateNote("PROJWBS")}`);
  if (rsrcUdfFields) warnings.push(`${rsrcUdfValues} resource custom field value(s) in ${rsrcUdfFields} field(s) written as resource user-defined fields${dateNote("RSRC")}`);
  if (rsrcUnread) warnings.push(`${rsrcUnread} resource custom field value(s) could not be read as a number or date and were left out`);
  if (typer.ref) warnings.push(typer.note());
  if (udfDupLabels) warnings.push(`${udfDupLabels} repeated custom field title(s) given a (2), (3) suffix (P6 needs UDF titles unique)`);
  if (cut) warnings.push(`${cut} name(s) or code(s) cut to P6's field length`);
  if (elapsedLags) warnings.push(`${elapsedLags} elapsed lag(s) written in hours: P6 counts every lag on one calendar per project (successor's), so set the lag calendar to 24 hour in P6 if those links matter`);
  if (deadlines && !carryDeadlines) warnings.push(`${deadlines} deadline(s) not carried: P6 has no deadline field (turn on "deadlines as finish-on-or-before" (--deadlines) to write each as a finish-on-or-before constraint, which caps the late finish in P6 as the deadline caps total slack in Project)`);
  if (carryDeadlines && dl.primary + dl.secondary + dl.merged) warnings.push(`${dl.primary + dl.secondary + dl.merged} deadline(s) written as finish-on-or-before constraints (${[dl.primary ? `${dl.primary} as the primary constraint` : "", dl.secondary ? `${dl.secondary} as the secondary` : "", dl.merged ? `${dl.merged} merged with a finish-no-later-than, the earlier date kept` : ""].filter(Boolean).join(", ")}): P6's float then counts down to them as Project's slack does; a DCMA review counts them as hard constraints`);
  if (dl.blocked.length) warnings.push(`${dl.blocked.length} deadline(s) not carried: the task has a must-start-on, must-finish-on or mandatory constraint, beside which P6 takes no secondary constraint (Project ID and name: ${dl.blocked.slice(0, 5).join(", ")}${dl.blocked.length > 5 ? ", ..." : ""})`);
  const doneDl = deadlines - dl.primary - dl.secondary - dl.merged - dl.blocked.length;
  if (carryDeadlines && doneDl > 0) warnings.push(`${doneDl} deadline(s) on finished tasks not carried`);
  if (TASKMEMO.length || WBSMEMO.length) {
    const onRoot = WBSMEMO.filter((m) => m.wbs_id === root).length, onWbs = WBSMEMO.length - onRoot;
    const where = [TASKMEMO.length ? `${TASKMEMO.length} on activities` : "", onWbs ? `${onWbs} on WBS nodes from summary tasks` : "", onRoot ? `${onRoot} on the project node from the project's notes` : ""].filter(Boolean).join(", ");
    warnings.push(`${TASKMEMO.length + WBSMEMO.length} note section(s) written as notebook entries (${where}) under ${MEMOTYPE.length} notebook topic(s): ${MEMOTYPE.map((m) => m.memo_type).join(", ")}`);
  }
  if (costAssign || fixedCosts) warnings.push(`${costAssign + fixedCosts} expense(s) written (PROJCOST)${costAssign ? `: ${costAssign} assignment(s) of ${costRes} cost resource(s), named after the resource${COSTTYPE.length ? `, in ${COSTTYPE.length} cost categor${COSTTYPE.length === 1 ? "y" : "ies"} from the resources' Group` : ""}` : ""}${fixedCosts ? `${costAssign ? ";" : ":"} ${fixedCosts} task fixed cost(s) as "Fixed cost"` : ""}; budgeted cost is the baseline cost where the assignment has one`);
  else if (costRes) warnings.push(`${costRes} cost resource(s) with no assignment on an activity`);
  if (hier.groups) warnings.push(`${hier.groups} resource(s) filed under parent resources from their Group (P6's resource hierarchy)${hier.parentsAdded ? `; ${hier.parentsAdded} parent resource(s) added, named by the Group's steps` : ""}${hier.loops ? `; ${hier.loops} link(s) left out that would have made a loop` : ""}`);
  if (rsrcNotes) warnings.push(`${rsrcNotes} resource note(s) written as the resource's notes (RSRC.rsrc_notes)`);
  if (costNotes) warnings.push(`${costNotes} cost resource note(s) not carried: cost resources become expenses in P6, which hold no notes`);
  if (summaryCost) warnings.push(`${summaryCost} cost resource assignment(s) on summary tasks not carried: summary tasks become WBS nodes in P6, which hold no expenses`);

  const xer = { version: "20.12", exportDate: new Date().toISOString().slice(0, 10), tables, format: "xer" };
  const counts = { activities: TASK.length, rsrcGroups: hier.groups, parentResources: hier.parentsAdded, relationships: TASKPRED.length, wbs: PROJWBS.length - 1, calendars: CALENDAR.length, resources: RSRC.length, assignments: TASKRSRC.length, curves: RSRCCURVDATA.length, contoured, codeTypes: ACTVTYPE.length, udfFields: taskUdfTypes, udfValues: taskUdfValues, wbsUdfFields, wbsUdfValues, rsrcUdfFields, rsrcUdfValues, expenses: PROJCOST.length, costTypes: COSTTYPE.length, ...(typer.ref ? { typesFromXer: { fields: typer.matched, changed: typer.changed, values: typer.values, notWhole: typer.notWhole.length, unmatched: typer.unmatched } } : {}), notebookTopics: MEMOTYPE.length, taskNotebooks: TASKMEMO.length, wbsNotebooks: WBSMEMO.length };
  const out = xerText(xer);
  // saved in Windows-1252, as P6 writes and reads an XER, when every
  // character fits it (xer.mjs, xerBytes)
  const { bytes, encoding, unmapped } = xerBytes(out);
  if (unmapped) warnings.push(`${unmapped} character(s) do not fit Windows-1252, P6's usual XER code page, so the file is saved as UTF-8: check names and notes after the import`);
  return { xer, text: out, bytes, encoding, counts, warnings, project: { name: title, id: shortName } };
}

export const p6xerSummary = (r) =>
  `${r.counts.activities} activities, ${r.counts.relationships} relationships, ${r.counts.wbs} WBS nodes, ${r.counts.calendars} calendar(s)` +
  (r.counts.resources ? `, ${r.counts.resources} resources (${r.counts.assignments} assignments)` : "") +
  (r.counts.codeTypes ? `, ${r.counts.codeTypes} activity code type(s)` : "") +
  (r.counts.udfFields ? `, ${r.counts.udfValues} custom field value(s) as ${r.counts.udfFields} UDF(s)` : "") +
  (r.counts.wbsUdfFields ? `, ${r.counts.wbsUdfValues} summary task custom field value(s) as ${r.counts.wbsUdfFields} WBS UDF(s)` : "") +
  (r.counts.rsrcUdfFields ? `, ${r.counts.rsrcUdfValues} resource custom field value(s) as ${r.counts.rsrcUdfFields} resource UDF(s)` : "") +
  (r.counts.expenses ? `, ${r.counts.expenses} expense(s)` : "") +
  (r.counts.taskNotebooks || r.counts.wbsNotebooks ? `, ${r.counts.taskNotebooks + r.counts.wbsNotebooks} note(s) as notebook entries` : "");

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
  const KEY = { CURRTYPE: "curr_id", FINTMPL: "fintmpl_id", OBS: "obs_id", PROJECT: "proj_id", CALENDAR: "clndr_id", SCHEDOPTIONS: "schedoptions_id", PROJWBS: "wbs_id", RSRC: "rsrc_id", ACTVTYPE: "actv_code_type_id", ACTVCODE: "actv_code_id", TASK: "task_id", TASKPRED: "task_pred_id", TASKRSRC: "taskrsrc_id", RSRCCURVDATA: "curv_id", UDFTYPE: "udf_type_id", MEMOTYPE: "memo_type_id", TASKMEMO: "memo_id", WBSMEMO: "wbs_memo_id", COSTTYPE: "cost_type_id", PROJCOST: "cost_item_id" };
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
  ref("RSRC", "clndr_id", "CALENDAR"); ref("RSRC", "curr_id", "CURRTYPE"); ref("RSRC", "parent_rsrc_id", "RSRC", true);
  {
    const byId = new Map((tables.RSRC || []).map((r) => [r.rsrc_id, r]));
    for (const r of tables.RSRC || []) {
      const seen = new Set();
      for (let p = r; p?.parent_rsrc_id; p = byId.get(p.parent_rsrc_id)) {
        if (seen.has(p.rsrc_id)) { say(`RSRC ${r.rsrc_short_name}: resource hierarchy loops`); break; }
        seen.add(p.rsrc_id);
      }
    }
  }
  ref("ACTVTYPE", "proj_id", "PROJECT"); ref("ACTVCODE", "actv_code_type_id", "ACTVTYPE");
  ref("TASK", "proj_id", "PROJECT"); ref("TASK", "wbs_id", "PROJWBS"); ref("TASK", "clndr_id", "CALENDAR");
  ref("TASKPRED", "task_id", "TASK"); ref("TASKPRED", "pred_task_id", "TASK");
  ref("TASKACTV", "task_id", "TASK"); ref("TASKACTV", "actv_code_id", "ACTVCODE"); ref("TASKACTV", "actv_code_type_id", "ACTVTYPE");
  ref("TASKRSRC", "task_id", "TASK"); ref("TASKRSRC", "rsrc_id", "RSRC"); ref("TASKRSRC", "curv_id", "RSRCCURVDATA", true);
  ref("UDFVALUE", "udf_type_id", "UDFTYPE");
  ref("PROJCOST", "task_id", "TASK"); ref("PROJCOST", "proj_id", "PROJECT"); ref("PROJCOST", "cost_type_id", "COSTTYPE", true);
  ref("TASKMEMO", "task_id", "TASK"); ref("TASKMEMO", "memo_type_id", "MEMOTYPE"); ref("TASKMEMO", "proj_id", "PROJECT");
  ref("WBSMEMO", "wbs_id", "PROJWBS"); ref("WBSMEMO", "memo_type_id", "MEMOTYPE"); ref("WBSMEMO", "proj_id", "PROJECT");
  // a value's fk_id is a row of its UDF's subject area (TASK, PROJWBS or
  // RSRC); an activity or WBS UDF's value names the project, a resource UDF's none
  {
    const area = new Map((tables.UDFTYPE || []).map((u) => [u.udf_type_id, u.table_name]));
    for (const v of tables.UDFVALUE || []) {
      const t = area.get(v.udf_type_id);
      if (t && !keys[t]?.has(v.fk_id)) say(`UDFVALUE ${v.udf_type_id}/${v.fk_id}: fk_id ${v.fk_id} is not in ${t}`);
      if ((t === "TASK" || t === "PROJWBS") && !keys.PROJECT?.has(v.proj_id)) say(`UDFVALUE ${v.udf_type_id}/${v.fk_id}: proj_id ${v.proj_id || "(empty)"} is not in PROJECT`);
    }
  }
  // a UDF's title is unique within its subject area; a value fits its type
  const udfType = new Map();
  const titles = new Set();
  for (const u of tables.UDFTYPE || []) {
    udfType.set(u.udf_type_id, u.logical_data_type);
    const k = `${u.table_name}|${u.udf_type_label.toLowerCase()}`;
    if (titles.has(k)) say(`UDFTYPE ${u.udf_type_id}: title ${u.udf_type_label} repeated`);
    titles.add(k);
  }
  const udfSeen = new Set();
  for (const v of tables.UDFVALUE || []) {
    const t = udfType.get(v.udf_type_id) || "";
    if (udfSeen.has(`${v.udf_type_id}|${v.fk_id}`)) say(`UDFVALUE ${v.udf_type_id}/${v.fk_id}: two values for one ${(tables.UDFTYPE || []).find((u) => u.udf_type_id === v.udf_type_id)?.table_name === "RSRC" ? "resource" : "activity"}`);
    udfSeen.add(`${v.udf_type_id}|${v.fk_id}`);
    if (/DATE/.test(t) && !v.udf_date) say(`UDFVALUE ${v.udf_type_id}/${v.fk_id}: date UDF with no date`);
    if (/INT|FLOAT|MONEY/.test(t) && !Number.isFinite(Number(v.udf_number === "" ? NaN : v.udf_number))) say(`UDFVALUE ${v.udf_type_id}/${v.fk_id}: ${t} value ${v.udf_number} is not a number`);
    if (t === "FT_INT" && !Number.isInteger(Number(v.udf_number))) say(`UDFVALUE ${v.udf_type_id}/${v.fk_id}: integer UDF value ${v.udf_number}`);
  }
  const nodes = (tables.PROJWBS || []).filter((w) => w.proj_node_flag === "Y");
  if (nodes.length !== 1) say(`PROJWBS: ${nodes.length} project nodes (P6 needs one)`);
  // every WBS node reaches the project node
  const wbs = new Map((tables.PROJWBS || []).map((w) => [w.wbs_id, w]));
  for (const w of wbs.values()) {
    let x = w, hops = 0;
    while (x && x.proj_node_flag !== "Y" && hops++ < 1000) x = wbs.get(x.parent_wbs_id);
    if (!x) say(`PROJWBS ${w.wbs_id}: does not reach the project node`);
  }
  const rsrcIds = new Set();
  for (const r of tables.RSRC || []) {
    if (rsrcIds.has(r.rsrc_short_name)) say(`RSRC ${r.rsrc_short_name}: resource ID repeated`);
    rsrcIds.add(r.rsrc_short_name);
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
