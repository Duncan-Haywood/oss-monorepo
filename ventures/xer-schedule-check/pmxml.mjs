// Primavera P6 XML reader ("P6 XML", PMXML: root <APIBusinessObjects>). P6
// Professional's File > Export > Primavera PM - (XML), P6 EPPM's Export and
// Oracle Primavera Cloud all write this format; many owners and lenders get it
// instead of an XER. It carries the same objects as an XER under the names of
// P6's API (Activity, Relationship, WBS, Calendar, ResourceAssignment...).
//
// parsePmxml(text) -> { version, exportDate, currency, tables, warnings, format: "pmxml" }
//
// `tables` has the shape parseXer gives (PROJECT, SCHEDOPTIONS, CALENDAR,
// PROJWBS, TASK, TASKPRED, RSRC, RSRCRATE, TASKRSRC, ACTVTYPE, ACTVCODE,
// TASKACTV, UDFTYPE, UDFVALUE, MEMOTYPE, TASKMEMO), with XER's field names and
// value forms ("2024-03-04 08:00", Y/N, TT_Task, PR_FS, hours), so the
// schedule engine, the DCMA and GAO checks, the Gantt chart and the
// converters read a P6 XML file exactly as they read an XER, and xerText()
// writes it back as an XER for P6's import.
//
// What an XER has and P6 XML does not: stored total and free float (P6's
// XML export leaves calculated float out), so the "stored float" check has
// nothing to compare and says so. What P6 XML has and this leaves out:
// baseline projects (<BaselineProject>), named in the warnings.

import { parseXml } from "./mspdi.mjs";

const kid = (node, name) => node && node.children.find((c) => c.name === name);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);
const val = (node, name) => { const k = kid(node, name); return k ? k.text.trim() : ""; };

// "2024-03-04T08:00:00" -> "2024-03-04 08:00"
export function pmDate(s) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s || "");
  return m ? `${m[1]} ${m[2]}` : "";
}
// "1" / "true" -> Y, "0" / "false" -> N, "" -> ""
const yn = (s) => (s === "" ? "" : s === "1" || s.toLowerCase() === "true" ? "Y" : "N");
// P6 XML percentages are fractions (0.5); XER's are 0-100
const pct = (s) => (s === "" || !Number.isFinite(+s) ? "" : String(Math.round(+s * 100 * 1e6) / 1e6));
// numbers as written, trailing ".0" dropped so "8.0" reads as XER's "8"
const n = (s) => (s === "" || !Number.isFinite(+s) ? s : String(+s));

export const TASK_TYPE = {
  "Task Dependent": "TT_Task", "Resource Dependent": "TT_Rsrc", "Level of Effort": "TT_LOE",
  "Start Milestone": "TT_Mile", "Finish Milestone": "TT_FinMile", "WBS Summary": "TT_WBS",
};
export const STATUS = { "Not Started": "TK_NotStart", "In Progress": "TK_Active", Completed: "TK_Complete" };
export const CONSTRAINT = {
  "Start On": "CS_MSO", "Start On or Before": "CS_MSOB", "Start On or After": "CS_MSOA",
  "Finish On": "CS_MEO", "Finish On or Before": "CS_MEOB", "Finish On or After": "CS_MEOA",
  "As Late As Possible": "CS_ALAP", "Mandatory Start": "CS_MANDSTART", "Mandatory Finish": "CS_MANDFIN",
};
export const LINK = { "Finish to Start": "PR_FS", "Start to Start": "PR_SS", "Finish to Finish": "PR_FF", "Start to Finish": "PR_SF" };
const DURATION_TYPE = {
  "Fixed Units": "DT_FixedQty", "Fixed Duration and Units/Time": "DT_FixedDrtn",
  "Fixed Units/Time": "DT_FixedRate", "Fixed Duration and Units": "DT_FixedDUR2",
};
const PCT_TYPE = { Physical: "CP_Phys", Duration: "CP_Drtn", Units: "CP_Units" };
const PRIORITY = { Top: "PT_Top", High: "PT_High", Normal: "PT_Normal", Low: "PT_Low", Lowest: "PT_Lowest" };
const LAG_CAL = {
  "Predecessor Activity Calendar": "rcal_Predecessor", "Successor Activity Calendar": "rcal_Successor",
  "24 Hour Calendar": "rcal_24Hour", "Project Default Calendar": "rcal_ProjDefault",
};
// "Finish Float = Late Finish - Early Finish" and so on
const floatType = (s) => (/^start float/i.test(s) ? "FT_SF" : /^finish float/i.test(s) ? "FT_FF" : /smallest/i.test(s) ? "FT_SmallestFloat" : "");
const CRIT_PATH = { "Critical Float": "CT_TotFloat", "Longest Path": "CT_DrivPath" };
const RSRC_TYPE = { Labor: "RT_Labor", Nonlabor: "RT_Equip", Material: "RT_Mat" };
const CAL_TYPE = { Global: "CA_Base", Project: "CA_Project", Resource: "CA_Rsrc" };
const SCOPE = { Global: "AS_Global", EPS: "AS_EPS", Project: "AS_Project" };
const UDF_TYPE = {
  Text: "FT_TEXT", Double: "FT_FLOAT_2_DECIMALS", Integer: "FT_INT", Cost: "FT_MONEY",
  "Start Date": "FT_START_DATE", "Finish Date": "FT_END_DATE", Indicator: "FT_STATICTYPE", Code: "FT_STATICTYPE",
};
const UDF_TABLE = { Activity: "TASK", WBS: "PROJWBS", Resource: "RSRC", Project: "PROJECT", "Resource Assignment": "TASKRSRC", Relationship: "TASKPRED" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------- calendars ----------

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
const serialDay = (ymd) => Math.round((Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) - SERIAL_EPOCH) / 86400000);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// <WorkTime><Start>08:00:00</Start><Finish>11:59:00</Finish></WorkTime>: P6
// writes the last working minute (11:59 for a period that ends at noon), so a
// finish one minute short of a half hour is moved up to it, as MPXJ reads it.
export function workPeriods(node) {
  const out = [];
  for (const w of kids(node, "WorkTime")) {
    const s = /^(\d{1,2}):(\d{2})/.exec(val(w, "Start")), f = /^(\d{1,2}):(\d{2})/.exec(val(w, "Finish"));
    if (!s || !f) continue;
    const a = +s[1] * 60 + +s[2];
    let b = +f[1] * 60 + +f[2];
    if ((b + 1) % 30 === 0) b += 1;
    if (b <= a) b += 24 * 60; // a period running to midnight
    if (b > 24 * 60) b = 24 * 60;
    if (b > a) out.push([hhmm(a), hhmm(b)]);
  }
  return out;
}
const periodsData = (ps) => ps.map((p, k) => `(0||${k}(s|${p[0]}|f|${p[1]})())`).join("");

export function calendarData(cal) {
  const week = kid(cal, "StandardWorkWeek");
  if (!week) return "";
  const byDay = new Map();
  for (const d of kids(week, "StandardWorkHours")) byDay.set(val(d, "DayOfWeek"), workPeriods(d));
  const days = DAYS.map((d, k) => `(0||${k + 1}()(${periodsData(byDay.get(d) || [])}))`).join("");
  const ex = [];
  for (const e of kids(kid(cal, "HolidayOrExceptions"), "HolidayOrException")) {
    const d = val(e, "Date");
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) continue;
    ex.push([serialDay(d), workPeriods(e)]);
  }
  ex.sort((a, b) => a[0] - b[0]);
  const exc = ex.map(([d, ps], k) => `(0||${k}(d|${d})(${periodsData(ps)}))`).join("");
  return `(0||CalendarData()((0||DaysOfWeek()(${days}))(0||Exceptions()(${exc}))))`;
}

function calendarRow(c, projId) {
  return {
    clndr_id: val(c, "ObjectId"),
    default_flag: yn(val(c, "IsDefault")) || "N",
    clndr_name: val(c, "Name"),
    proj_id: projId || val(c, "ProjectObjectId"),
    base_clndr_id: val(c, "BaseCalendarObjectId"),
    clndr_type: CAL_TYPE[val(c, "Type")] || "",
    day_hr_cnt: n(val(c, "HoursPerDay")),
    week_hr_cnt: n(val(c, "HoursPerWeek")),
    month_hr_cnt: n(val(c, "HoursPerMonth")),
    year_hr_cnt: n(val(c, "HoursPerYear")),
    rsrc_private: yn(val(c, "IsPersonal")) || "N",
    clndr_data: calendarData(c),
  };
}

// ---------- the reader ----------

export function isPmxml(text) {
  return /^﻿?\s*(<\?[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<([A-Za-z_][\w.-]*:)?APIBusinessObjects[\s>]/.test(text.slice(0, 4096));
}

export function parsePmxml(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const root = parseXml(text);
  const api = root.children.find((c) => c.name === "APIBusinessObjects");
  if (!api) throw new Error("not a P6 XML file: no <APIBusinessObjects> element");
  const warnings = [];
  const ver = /Primavera\/P6\/V([\d.]+)\//.exec(text.slice(0, 4096));
  const T = {
    PROJECT: [], SCHEDOPTIONS: [], CALENDAR: [], PROJWBS: [], TASK: [], TASKPRED: [],
    RSRC: [], RSRCRATE: [], TASKRSRC: [], ACTVTYPE: [], ACTVCODE: [], TASKACTV: [],
    UDFTYPE: [], UDFVALUE: [], MEMOTYPE: [], TASKMEMO: [],
  };

  // global objects: calendars, resources, code types and codes, UDF types
  for (const c of kids(api, "Calendar")) T.CALENDAR.push(calendarRow(c, ""));
  for (const r of kids(api, "Resource")) {
    T.RSRC.push({
      rsrc_id: val(r, "ObjectId"), parent_rsrc_id: val(r, "ParentObjectId"), clndr_id: val(r, "CalendarObjectId"),
      rsrc_short_name: val(r, "Id"), rsrc_name: val(r, "Name"), rsrc_type: RSRC_TYPE[val(r, "ResourceType")] || "RT_Labor",
      active_flag: yn(val(r, "IsActive")), def_qty_per_hr: n(val(r, "DefaultUnitsPerTime")),
      unit_id: val(r, "UnitOfMeasureObjectId"), rsrc_seq_num: val(r, "SequenceNumber"),
      employee_code: val(r, "EmployeeId"), rsrc_title_name: val(r, "Title"), rsrc_notes: val(r, "ResourceNotes"),
    });
  }
  for (const r of kids(api, "ResourceRate")) {
    T.RSRCRATE.push({
      rsrc_rate_id: val(r, "ObjectId"), rsrc_id: val(r, "ResourceObjectId"), start_date: pmDate(val(r, "EffectiveDate")),
      max_qty_per_hr: n(val(r, "MaxUnitsPerTime")), cost_per_qty: n(val(r, "PricePerUnit")),
    });
  }
  const codeTypes = (node, projId) => {
    for (const t of kids(node, "ActivityCodeType")) {
      T.ACTVTYPE.push({
        actv_code_type_id: val(t, "ObjectId"), actv_code_type: val(t, "Name"), seq_num: val(t, "SequenceNumber"),
        actv_short_len: val(t, "Length"), proj_id: projId || val(t, "ProjectObjectId"),
        actv_code_type_scope: SCOPE[val(t, "Scope")] || (projId ? "AS_Project" : "AS_Global"),
      });
    }
    for (const c of kids(node, "ActivityCode")) {
      T.ACTVCODE.push({
        actv_code_id: val(c, "ObjectId"), parent_actv_code_id: val(c, "ParentObjectId"), actv_code_type_id: val(c, "CodeTypeObjectId"),
        actv_code_name: val(c, "Description"), short_name: val(c, "CodeValue"), seq_num: val(c, "SequenceNumber"), color: val(c, "Color"),
      });
    }
  };
  codeTypes(api, "");
  const udfKinds = new Map();
  for (const u of kids(api, "UDFType")) {
    const id = val(u, "ObjectId"), dt = val(u, "DataType");
    udfKinds.set(id, dt);
    T.UDFTYPE.push({
      udf_type_id: id, table_name: UDF_TABLE[val(u, "SubjectArea")] || val(u, "SubjectArea"),
      udf_type_name: val(u, "Title"), udf_type_label: val(u, "Title"), logical_data_type: UDF_TYPE[dt] || "FT_TEXT",
    });
  }
  for (const t of kids(api, "NotebookTopic")) {
    T.MEMOTYPE.push({ memo_type_id: val(t, "ObjectId"), memo_type: val(t, "Name"), seq_num: val(t, "SequenceNumber"),
      task_flag: yn(val(t, "AvailableForActivity")), wbs_flag: yn(val(t, "AvailableForWBS")), proj_flag: yn(val(t, "AvailableForProject")), eps_flag: yn(val(t, "AvailableForEPS")) });
  }
  const udfValues = (node, table, fk, projId) => {
    for (const u of kids(node, "UDF")) {
      const type = val(u, "TypeObjectId");
      const row = { udf_type_id: type, fk_id: fk, proj_id: projId, udf_date: "", udf_number: "", udf_text: "", udf_code_id: "" };
      const kind = udfKinds.get(type) || "";
      const text = val(u, "TextValue"), dbl = val(u, "DoubleValue"), int = val(u, "IntegerValue"), cost = val(u, "CostValue");
      const sd = val(u, "StartDateValue"), fd = val(u, "FinishDateValue"), ind = val(u, "IndicatorValue"), code = val(u, "CodeValue");
      if (sd || fd) row.udf_date = pmDate(sd || fd);
      else if (dbl !== "" || int !== "" || cost !== "") row.udf_number = n(dbl !== "" ? dbl : int !== "" ? int : cost);
      else if (code !== "") row.udf_code_id = code;
      else if (ind !== "") row.udf_text = ind;
      else row.udf_text = text;
      if (!kind && !udfKinds.has(type)) {
        // a value whose type the file does not list: guess the type from the value
        udfKinds.set(type, row.udf_date ? "Start Date" : row.udf_number !== "" ? "Double" : "Text");
        T.UDFTYPE.push({ udf_type_id: type, table_name: table, udf_type_name: `UDF ${type}`, udf_type_label: `UDF ${type}`, logical_data_type: UDF_TYPE[udfKinds.get(type)] });
      }
      T.UDFVALUE.push(row);
    }
  };
  for (const r of kids(api, "Resource")) udfValues(r, "RSRC", val(r, "ObjectId"), "");

  const projects = kids(api, "Project");
  if (!projects.length) warnings.push("the file holds no <Project>");
  const baselines = kids(api, "BaselineProject");
  if (baselines.length) warnings.push(`${baselines.length} baseline ${baselines.length === 1 ? "project is" : "projects are"} in the file and ${baselines.length === 1 ? "was" : "were"} not read; open the baseline as its own file to compare`);
  let pred = 0;
  for (const p of projects) {
    const pid = val(p, "ObjectId");
    const so = kid(p, "ScheduleOptions");
    // scheduling options sit in <ScheduleOptions>; older exports put them on the project
    const opt = (k) => (so && kid(so, k) ? val(so, k) : val(p, k));
    const node = `p${pid}`;
    const oos = opt("OutOfSequenceScheduleType");
    T.PROJECT.push({
      proj_id: pid, proj_short_name: val(p, "Id"), clndr_id: val(p, "ActivityDefaultCalendarObjectId"),
      last_recalc_date: pmDate(val(p, "DataDate")), plan_start_date: pmDate(val(p, "PlannedStartDate")),
      plan_end_date: pmDate(val(p, "MustFinishByDate")), scd_end_date: pmDate(val(p, "ScheduledFinishDate")),
      critical_drtn_hr_cnt: n(opt("CriticalActivityFloatThreshold") || val(p, "CriticalActivityFloatLimit")),
      critical_path_type: CRIT_PATH[opt("CriticalActivityPathType")] || "",
      def_task_type: TASK_TYPE[val(p, "ActivityDefaultActivityType")] || "",
      def_duration_type: DURATION_TYPE[val(p, "ActivityDefaultDurationType")] || "",
      def_complete_pct_type: PCT_TYPE[val(p, "ActivityDefaultPercentCompleteType")] || "",
      fy_start_month_num: val(p, "FiscalYearStartMonth"), guid: val(p, "GUID"),
      sum_base_proj_id: val(p, "CurrentBaselineProjectObjectId"),
      task_code_prefix: val(p, "ActivityIdPrefix"), task_code_base: val(p, "ActivityIdSuffix"), task_code_step: val(p, "ActivityIdIncrement"),
      name_sep_char: val(p, "WBSCodeSeparator"),
    });
    T.SCHEDOPTIONS.push({
      schedoptions_id: String(T.SCHEDOPTIONS.length + 1), proj_id: pid,
      sched_outer_depend_type: opt("IgnoreOtherProjectRelationships") === "1" ? "SD_None" : "SD_Both",
      sched_open_critical_flag: yn(opt("MakeOpenEndedActivitiesCritical")),
      sched_lag_early_start_flag: opt("StartToStartLagCalculationType") === "1" ? "Y" : opt("StartToStartLagCalculationType") === "0" ? "N" : "",
      sched_retained_logic: oos ? (oos === "Retained Logic" ? "Y" : "N") : "",
      sched_progress_override: oos ? (oos === "Progress Override" ? "Y" : "N") : "",
      sched_float_type: floatType(opt("ComputeTotalFloatType")),
      sched_calendar_on_relationship_lag: LAG_CAL[opt("RelationshipLagCalendar")] || "",
      sched_use_expect_end_flag: yn(opt("UseExpectedFinishDates")),
      sched_use_project_end_date_for_float: yn(opt("CalculateFloatBasedOnFinishDate")),
      level_all_rsrc_flag: yn(opt("LevelAllResources")), level_within_float_flag: yn(opt("LevelWithinFloat")),
      level_over_alloc_pct: n(opt("OverAllocationPercentage")),
      enable_multiple_longest_path_calc: yn(opt("MultipleFloatPathsEnabled")), max_multiple_longest_path: opt("MaximumMultipleFloatPaths"),
      use_total_float_multiple_longest_paths: yn(opt("MultipleFloatPathsUseTotalFloat")),
    });
    for (const c of kids(p, "Calendar")) T.CALENDAR.push(calendarRow(c, pid));
    codeTypes(p, pid);
    for (const t of kids(p, "NotebookTopic")) T.MEMOTYPE.push({ memo_type_id: val(t, "ObjectId"), memo_type: val(t, "Name"), seq_num: val(t, "SequenceNumber"), task_flag: "Y", wbs_flag: "Y", proj_flag: "Y", eps_flag: "N" });

    // the project node an XER keeps at the top of PROJWBS
    T.PROJWBS.push({ wbs_id: node, proj_id: pid, seq_num: "0", proj_node_flag: "Y", wbs_short_name: val(p, "Id"), wbs_name: val(p, "Name"), parent_wbs_id: "", status_code: "WS_Open" });
    const wbsIds = new Set(kids(p, "WBS").map((w) => val(w, "ObjectId")));
    for (const w of kids(p, "WBS")) {
      const parent = val(w, "ParentObjectId");
      T.PROJWBS.push({
        wbs_id: val(w, "ObjectId"), proj_id: pid, seq_num: val(w, "SequenceNumber"), proj_node_flag: "N",
        wbs_short_name: val(w, "Code"), wbs_name: val(w, "Name"),
        parent_wbs_id: parent && wbsIds.has(parent) ? parent : node,
        status_code: { Active: "WS_Open", Inactive: "WS_Closed", "What-If": "WS_Whatif", Planned: "WS_Planned" }[val(w, "Status")] || "WS_Open",
        guid: val(w, "GUID"), est_wt: n(val(w, "EstimatedWeight")),
      });
      udfValues(w, "PROJWBS", val(w, "ObjectId"), pid);
    }

    for (const a of kids(p, "Activity")) {
      const id = val(a, "ObjectId");
      const wbs = val(a, "WBSObjectId");
      // the dates P6's scheduler last computed: XER keeps them as early and
      // late start/finish; P6 XML as the Remaining Early/Late dates (and, from
      // some versions, as Early/Late dates too)
      const res = pmDate(val(a, "RemainingEarlyStartDate")), ree = pmDate(val(a, "RemainingEarlyFinishDate"));
      const rls = pmDate(val(a, "RemainingLateStartDate")), rle = pmDate(val(a, "RemainingLateFinishDate"));
      T.TASK.push({
        task_id: id, proj_id: pid, wbs_id: wbs && wbsIds.has(wbs) ? wbs : node, clndr_id: val(a, "CalendarObjectId"),
        phys_complete_pct: pct(val(a, "PhysicalPercentComplete")),
        auto_compute_act_flag: yn(val(a, "AutoComputeActuals")),
        complete_pct_type: PCT_TYPE[val(a, "PercentCompleteType")] || "",
        task_type: TASK_TYPE[val(a, "Type")] || "TT_Task",
        duration_type: DURATION_TYPE[val(a, "DurationType")] || "",
        status_code: STATUS[val(a, "Status")] || "TK_NotStart",
        task_code: val(a, "Id"), task_name: val(a, "Name"),
        rsrc_id: val(a, "PrimaryResourceObjectId"),
        total_float_hr_cnt: n(val(a, "TotalFloat")), free_float_hr_cnt: n(val(a, "FreeFloat")),
        remain_drtn_hr_cnt: n(val(a, "RemainingDuration")),
        act_work_qty: n(val(a, "ActualLaborUnits")), remain_work_qty: n(val(a, "RemainingLaborUnits")), target_work_qty: n(val(a, "PlannedLaborUnits")),
        target_drtn_hr_cnt: n(val(a, "PlannedDuration")),
        target_equip_qty: n(val(a, "PlannedNonLaborUnits")), act_equip_qty: n(val(a, "ActualNonLaborUnits")), remain_equip_qty: n(val(a, "RemainingNonLaborUnits")),
        cstr_date: pmDate(val(a, "PrimaryConstraintDate")),
        act_start_date: pmDate(val(a, "ActualStartDate")), act_end_date: pmDate(val(a, "ActualFinishDate")),
        late_start_date: pmDate(val(a, "LateStartDate")) || rls, late_end_date: pmDate(val(a, "LateFinishDate")) || rle,
        expect_end_date: pmDate(val(a, "ExpectedFinishDate")),
        early_start_date: pmDate(val(a, "EarlyStartDate")) || res, early_end_date: pmDate(val(a, "EarlyFinishDate")) || ree,
        restart_date: res, reend_date: ree,
        target_start_date: pmDate(val(a, "PlannedStartDate")), target_end_date: pmDate(val(a, "PlannedFinishDate")),
        rem_late_start_date: rls, rem_late_end_date: rle,
        cstr_type: CONSTRAINT[val(a, "PrimaryConstraintType")] || "",
        priority_type: PRIORITY[val(a, "LevelingPriority")] || "",
        suspend_date: pmDate(val(a, "SuspendDate")), resume_date: pmDate(val(a, "ResumeDate")),
        float_path: val(a, "FloatPath"), float_path_order: val(a, "FloatPathOrder"),
        guid: val(a, "GUID"),
        cstr_date2: pmDate(val(a, "SecondaryConstraintDate")), cstr_type2: CONSTRAINT[val(a, "SecondaryConstraintType")] || "",
        driving_path_flag: yn(val(a, "IsLongestPath")) || "N",
        external_early_start_date: pmDate(val(a, "ExternalEarlyStartDate")), external_late_end_date: pmDate(val(a, "ExternalLateFinishDate")),
        est_wt: n(val(a, "EstimatedWeight")),
        create_date: pmDate(val(a, "CreateDate")), update_date: pmDate(val(a, "LastUpdateDate")),
      });
      for (const c of kids(a, "Code")) T.TASKACTV.push({ task_id: id, actv_code_type_id: val(c, "TypeObjectId"), actv_code_id: val(c, "ValueObjectId"), proj_id: pid });
      udfValues(a, "TASK", id, pid);
    }

    for (const r of kids(p, "Relationship")) {
      pred++;
      T.TASKPRED.push({
        task_pred_id: val(r, "ObjectId") || `r${pred}`, task_id: val(r, "SuccessorActivityObjectId"), pred_task_id: val(r, "PredecessorActivityObjectId"),
        proj_id: val(r, "SuccessorProjectObjectId") || pid, pred_proj_id: val(r, "PredecessorProjectObjectId") || pid,
        pred_type: LINK[val(r, "Type")] || "PR_FS", lag_hr_cnt: n(val(r, "Lag")) || "0", comments: val(r, "Comments"),
      });
    }

    for (const r of kids(p, "ResourceAssignment")) {
      T.TASKRSRC.push({
        taskrsrc_id: val(r, "ObjectId"), task_id: val(r, "ActivityObjectId"), proj_id: pid, rsrc_id: val(r, "ResourceObjectId"),
        role_id: val(r, "RoleObjectId"), acct_id: val(r, "CostAccountObjectId"),
        remain_qty: n(val(r, "RemainingUnits")), target_qty: n(val(r, "PlannedUnits")),
        remain_qty_per_hr: n(val(r, "RemainingUnitsPerTime")), target_qty_per_hr: n(val(r, "PlannedUnitsPerTime")),
        target_lag_drtn_hr_cnt: n(val(r, "PlannedLag")), relag_drtn_hr_cnt: n(val(r, "RemainingLag")),
        target_drtn_hr_cnt: n(val(r, "PlannedDuration")), remain_drtn_hr_cnt: n(val(r, "RemainingDuration")),
        act_reg_qty: n(val(r, "ActualRegularUnits")), act_ot_qty: n(val(r, "ActualOvertimeUnits")),
        act_reg_cost: n(val(r, "ActualRegularCost")), act_ot_cost: n(val(r, "ActualOvertimeCost")),
        target_cost: n(val(r, "PlannedCost")), remain_cost: n(val(r, "RemainingCost")),
        cost_per_qty: n(val(r, "PricePerUnit")), rate_type: val(r, "RateType"),
        rsrc_type: RSRC_TYPE[val(r, "ResourceType")] || "",
        act_start_date: pmDate(val(r, "ActualStartDate")), act_end_date: pmDate(val(r, "ActualFinishDate")),
        restart_date: pmDate(val(r, "RemainingStartDate")), reend_date: pmDate(val(r, "RemainingFinishDate")),
        target_start_date: pmDate(val(r, "PlannedStartDate")), target_end_date: pmDate(val(r, "PlannedFinishDate")),
        curv_id: val(r, "ResourceCurveObjectId"), guid: val(r, "GUID"),
      });
    }

    for (const m of kids(p, "ActivityNote")) {
      T.TASKMEMO.push({ memo_id: val(m, "ObjectId"), task_id: val(m, "ActivityObjectId"), memo_type_id: val(m, "NotebookTopicObjectId"), proj_id: pid, task_memo: val(m, "Note") });
    }
  }

  // empty tables are left out, as an XER that lacks them reads
  const tables = {};
  for (const [k, rows] of Object.entries(T)) if (rows.length) tables[k] = rows;
  const noFloat = T.TASK.length && !T.TASK.some((t) => t.total_float_hr_cnt !== "");
  if (noFloat) warnings.push("P6 XML stores no total float, so the stored-float check has nothing to compare (float is recomputed from the logic)");
  return { version: ver ? ver[1] : null, exportDate: null, currency: null, tables, warnings, format: "pmxml" };
}
