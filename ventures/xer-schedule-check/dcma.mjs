// The DCMA 14-point schedule assessment on a P6 XER file, plus the checks a
// scheduler runs next to it (logic loops, links into a started activity,
// stored float that no longer matches the logic).
//
// assess(xer, { projId }) -> {
//   project: { code, name, dataDate, finish, mustFinish, activities, ... },
//   checks: [{ id, name, value, unit, threshold, pass, count, total, items, note }],
//   recompute: { compared, matched },
//   drivingPath: [task codes],
// }
//
// Population (as in the DCMA guide): activities that are not complete,
// leaving out level of effort and WBS summary activities. Durations and
// float are in working days of each activity's own calendar
// (hours / the calendar's hours per day). Thresholds are the DCMA's
// published ones (44 working days for high float and high duration, 5% for
// most counts, 0 for leads, negative float and invalid dates, 0.95 for CPLI
// and BEI).
//
// What the file cannot say: there is no baseline in a single XER unless the
// project was exported with one, so missed tasks and BEI use P6's planned
// dates (target_start/end_date), which P6 keeps as the baseline when the
// project is set to use its own planned dates.

import { schedule, drivingPath, hardConstraint } from "./cpm.mjs";
import { parseDate, formatDate, num } from "./xer.mjs";

const DAYS_44 = 44;

const pct = (n, d) => (d ? (100 * n) / d : 0);

function pickProject(model, projId) {
  if (projId && model.projects.has(projId)) return model.projects.get(projId);
  // the project with the most open activities
  const counts = new Map();
  for (const t of model.tasks.values()) if (t.status !== "TK_Complete") counts.set(t.proj, (counts.get(t.proj) || 0) + 1);
  let best = null;
  for (const p of model.projects.values()) if (!best || (counts.get(p.id) || 0) > (counts.get(best.id) || 0)) best = p;
  return best;
}

export function assess(xer, opts = {}) {
  const result = opts.result || schedule(xer);
  const { model } = result;
  const base = pickProject(model, opts.projId);
  const p = base && result.projects.get(base.id);
  if (!p) throw new Error("the file has no PROJECT table");
  const projRow = (xer.tables.PROJECT || []).find((r) => r.proj_id === p.id) || {};
  const all = [...model.tasks.values()].filter((t) => t.proj === p.id);
  const open = all.filter((t) => !t.span && t.status !== "TK_Complete");
  const normal = open.filter((t) => t.type !== "TT_Mile" && t.type !== "TT_FinMile");
  const hpd = (t) => t.cal.hoursPerDay || 8;
  const days = (t, hours) => hours / hpd(t);
  const dd = p.dataDate;
  const res = result.tasks;
  const stored = (t) => num(t.row.total_float_hr_cnt);
  // float as the file reports it, falling back to the recomputed value
  const floatH = (t) => (stored(t) !== null ? stored(t) : res.get(t.id)?.tf ?? null);
  const label = (t) => `${t.code} ${t.name}`.trim();
  const checks = [];
  const add = (c) => checks.push({ items: [], note: "", ...c });

  // relationships whose successor is in the population
  const openIds = new Set(open.map((t) => t.id));
  const rels = model.rels.filter((r) => openIds.has(r.succId));

  // 1 Logic
  {
    const bad = [];
    for (const t of open) {
      const preds = t.preds.filter((r) => !model.tasks.get(r.predId).span);
      const succs = t.succs.filter((r) => !model.tasks.get(r.succId).span);
      const noPred = preds.length === 0 && !(t.type === "TT_Mile");
      const noSucc = succs.length === 0 && !(t.type === "TT_FinMile");
      if (noPred || noSucc) bad.push({ code: t.code, name: t.name, why: noPred && noSucc ? "no predecessor or successor" : noPred ? "no predecessor" : "no successor" });
    }
    add({ id: 1, name: "Logic", value: pct(bad.length, open.length), unit: "%", threshold: "<= 5%", pass: pct(bad.length, open.length) <= 5, count: bad.length, total: open.length, items: bad,
      note: "Open activities missing a predecessor or a successor. A start milestone may have no predecessor and a finish milestone no successor." });
  }
  // 2 Leads
  {
    const bad = rels.filter((r) => r.lag < 0);
    add({ id: 2, name: "Leads", value: bad.length, unit: "", threshold: "0", pass: bad.length === 0, count: bad.length, total: rels.length, items: bad.map((r) => relItem(model, r)),
      note: "Relationships with negative lag. A lead lets a successor start before its predecessor's logic says it can, and hides the critical path." });
  }
  // 3 Lags
  {
    const bad = rels.filter((r) => r.lag > 0);
    add({ id: 3, name: "Lags", value: pct(bad.length, rels.length), unit: "%", threshold: "<= 5%", pass: pct(bad.length, rels.length) <= 5, count: bad.length, total: rels.length, items: bad.map((r) => relItem(model, r)),
      note: "Relationships with positive lag. A long lag is often an activity (cure, approval, delivery) that should be shown as one." });
  }
  // 4 Relationship types
  {
    const fs = rels.filter((r) => r.type === "PR_FS").length;
    const other = rels.filter((r) => r.type !== "PR_FS");
    add({ id: 4, name: "Relationship types", value: pct(fs, rels.length), unit: "% FS", threshold: ">= 90% FS", pass: rels.length === 0 || pct(fs, rels.length) >= 90, count: other.length, total: rels.length, items: other.map((r) => relItem(model, r)),
      note: `Finish-to-start ${fs}, start-to-start ${rels.filter((r) => r.type === "PR_SS").length}, finish-to-finish ${rels.filter((r) => r.type === "PR_FF").length}, start-to-finish ${rels.filter((r) => r.type === "PR_SF").length}.` });
  }
  // 5 Hard constraints
  {
    const bad = open.filter((t) => t.cstr.some((c) => hardConstraint(c.type)));
    add({ id: 5, name: "Hard constraints", value: pct(bad.length, open.length), unit: "%", threshold: "<= 5%", pass: pct(bad.length, open.length) <= 5, count: bad.length, total: open.length,
      items: bad.map((t) => ({ code: t.code, name: t.name, why: t.cstr.filter((c) => hardConstraint(c.type)).map((c) => `${Object.hasOwn(CSTR, c.type) ? CSTR[c.type] : c.type} ${formatDate(c.date)}`).join("; ") })),
      note: "Start on, finish on, start on or before, finish on or before and mandatory constraints stop the logic from moving dates." });
  }
  // 6 High float
  {
    const bad = open.filter((t) => floatH(t) !== null && days(t, floatH(t)) > DAYS_44);
    add({ id: 6, name: "High float", value: pct(bad.length, open.length), unit: "%", threshold: "<= 5%", pass: pct(bad.length, open.length) <= 5, count: bad.length, total: open.length,
      items: bad.map((t) => ({ code: t.code, name: t.name, why: `${round1(days(t, floatH(t)))} days total float` })),
      note: "Open activities with more than 44 working days of total float, usually a sign of missing successors." });
  }
  // 7 Negative float
  {
    const bad = open.filter((t) => floatH(t) !== null && floatH(t) < -1e-9);
    add({ id: 7, name: "Negative float", value: pct(bad.length, open.length), unit: "%", threshold: "0%", pass: bad.length === 0, count: bad.length, total: open.length,
      items: bad.map((t) => ({ code: t.code, name: t.name, why: `${round1(days(t, floatH(t)))} days total float` })),
      note: "Negative float means a constraint or a must-finish-by date cannot be met with the current logic and durations." });
  }
  // 8 High duration (planned duration of normal activities)
  {
    const dur = (t) => (t.status === "TK_Active" ? t.remain : t.orig) / 60;
    const bad = normal.filter((t) => days(t, dur(t)) > DAYS_44);
    add({ id: 8, name: "High duration", value: pct(bad.length, normal.length), unit: "%", threshold: "<= 5%", pass: pct(bad.length, normal.length) <= 5, count: bad.length, total: normal.length,
      items: bad.map((t) => ({ code: t.code, name: t.name, why: `${round1(days(t, dur(t)))} days` })),
      note: "Open activities (not milestones) longer than 44 working days: planned duration, or remaining duration once started. Long activities are hard to status and hide logic." });
  }
  // 9 Invalid dates
  {
    const bad = [];
    for (const t of all) {
      if (t.span) continue;
      if (dd !== null && t.actStart !== null && t.actStart > dd) bad.push({ code: t.code, name: t.name, why: `actual start ${formatDate(t.actStart)} after the data date` });
      if (dd !== null && t.actEnd !== null && t.actEnd > dd) bad.push({ code: t.code, name: t.name, why: `actual finish ${formatDate(t.actEnd)} after the data date` });
      if (t.status !== "TK_Complete" && dd !== null) {
        const ef = parseDate(t.row.early_end_date);
        const es = parseDate(t.status === "TK_Active" ? "" : t.row.early_start_date);
        if (es !== null && es < dd) bad.push({ code: t.code, name: t.name, why: `forecast start ${formatDate(es)} before the data date` });
        if (ef !== null && ef < dd) bad.push({ code: t.code, name: t.name, why: `forecast finish ${formatDate(ef)} before the data date` });
      }
    }
    add({ id: 9, name: "Invalid dates", value: bad.length, unit: "", threshold: "0", pass: bad.length === 0, count: bad.length, total: all.filter((t) => !t.span).length, items: bad,
      note: "Actual dates after the data date, or forecast dates before it, as stored in the file." });
  }
  // 10 Resources
  {
    const withRes = new Set((xer.tables.TASKRSRC || []).map((r) => r.task_id));
    const loaded = (xer.tables.TASKRSRC || []).length > 0;
    const bad = normal.filter((t) => (t.status === "TK_Active" ? t.remain : t.orig) > 0 && !withRes.has(t.id));
    add({ id: 10, name: "Resources", value: pct(bad.length, normal.length), unit: "%", threshold: "0%", pass: bad.length === 0, count: bad.length, total: normal.length,
      items: bad.map((t) => ({ code: t.code, name: t.name, why: "no resource or cost assignment" })),
      note: loaded ? "Open activities with duration and no resource or cost assignment." : "The file has no resource assignments at all; skip this check if the schedule is not meant to be resource loaded." });
  }
  // 11 Missed tasks and 14 BEI (planned finish as the baseline)
  {
    const due = all.filter((t) => !t.span && t.type !== "TT_Mile" && t.type !== "TT_FinMile" && dd !== null && parseDate(t.row.target_end_date) !== null && parseDate(t.row.target_end_date) <= dd);
    const missed = due.filter((t) => t.actEnd === null || t.actEnd > parseDate(t.row.target_end_date));
    add({ id: 11, name: "Missed tasks", value: pct(missed.length, due.length), unit: "%", threshold: "<= 5%", pass: pct(missed.length, due.length) <= 5, count: missed.length, total: due.length,
      items: missed.map((t) => ({ code: t.code, name: t.name, why: t.actEnd === null ? `planned to finish ${t.row.target_end_date}, not finished` : `planned ${t.row.target_end_date}, finished ${formatDate(t.actEnd)}` })),
      note: "Activities planned to finish by the data date that finished late or have not finished. Planned dates stand in for the baseline only on started or finished activities: P6 resets a not-started activity's planned dates to its early dates when it schedules, so late work not yet started is not counted." });
    const finished = due.filter((t) => t.actEnd !== null).length;
    const doneAll = all.filter((t) => !t.span && t.type !== "TT_Mile" && t.type !== "TT_FinMile" && t.status === "TK_Complete").length;
    const bei = due.length ? doneAll / due.length : null;
    checks.bei = { value: bei, due: due.length, finished: doneAll, finishedOfDue: finished };
  }
  // 12 Critical path test
  {
    const path = drivingPath(result, p.id);
    const cand = path.map((id) => model.tasks.get(id)).find((t) => t && t.status !== "TK_Complete" && t.type !== "TT_FinMile" && t.type !== "TT_Mile") || path.map((id) => model.tasks.get(id))[0];
    let pass = false, why = "no open activity on the driving path";
    let value = null;
    if (cand && p.finish !== null) {
      const delayDays = 600;
      const minutes = Math.round(delayDays * hpd(cand) * 60);
      const after = schedule(xer, { model, delay: { taskId: cand.id, minutes } });
      const newFinish = after.projects.get(p.id).finish;
      const moved = cand.cal.workBetween(p.finish, newFinish) / 60 / hpd(cand);
      value = round1(moved);
      // at least the delay: a little more is calendars along the path that
      // work fewer days than the delayed activity's (holidays, 5 vs 6 days)
      pass = moved >= delayDays - 1;
      why = `${cand.code} delayed ${delayDays} working days moved the project finish ${round1(moved)} days`;
    }
    add({ id: 12, name: "Critical path test", value, unit: "days moved of 600", threshold: "finish moves the same", pass, count: pass ? 0 : 1, total: 1, items: cand ? [{ code: cand.code, name: cand.name, why }] : [],
      note: "An open activity on the longest path is delayed 600 working days and the schedule recomputed: the project finish should move by at least that much (a little more where later activities work fewer days). If it does not, the path is broken by a constraint, a lag or missing logic." });
  }
  // 13 CPLI
  {
    let cpli = null, note = "";
    if (p.finish !== null && dd !== null) {
      const cal = p.cal;
      const cpl = cal.workBetween(cal.nextStart(dd), p.finish) / 60 / (cal.hoursPerDay || 8);
      const target = p.mustFinish;
      const tf = target !== null ? cal.workBetween(p.finish, cal.prevEnd(target)) / 60 / (cal.hoursPerDay || 8) : 0;
      cpli = cpl > 0 ? (cpl + tf) / cpl : null;
      note = target !== null
        ? `Critical path length ${round1(cpl)} days from the data date to the forecast finish ${formatDate(p.finish)}; ${round1(tf)} days to the must-finish-by date ${formatDate(target)}.`
        : "The project has no must-finish-by date, so its critical path has no float to measure against (CPLI = 1).";
    }
    add({ id: 13, name: "Critical path length index (CPLI)", value: cpli === null ? null : round3(cpli), unit: "", threshold: ">= 0.95", pass: cpli !== null && cpli >= 0.95, count: 0, total: 0, note });
  }
  // 14 BEI
  {
    const b = checks.bei;
    delete checks.bei;
    add({ id: 14, name: "Baseline execution index (BEI)", value: b.value === null ? null : round3(b.value), unit: "", threshold: ">= 0.95", pass: b.value === null ? true : b.value >= 0.95, count: b.finished, total: b.due,
      note: b.due ? `${b.finished} activities finished of ${b.due} planned to finish by the data date (planned dates as the baseline).` : "No activity was planned to finish by the data date, so there is nothing to measure yet." });
  }

  // ---- beyond the 14 points
  const extra = [];
  {
    extra.push({ id: "loops", name: "Logic loops", count: result.loops.length, pass: result.loops.length === 0,
      items: result.loops.map((l) => ({ code: l.map((id) => model.tasks.get(id).code).join(" -> "), name: "", why: `${l.length} activities` })),
      note: "Activities that depend on themselves through a chain of links. P6 refuses to schedule a loop." });
    const oos = [];
    for (const t of all) {
      if (t.span || t.actStart === null) continue;
      for (const r of t.preds) {
        const pr = model.tasks.get(r.predId);
        if (pr.span) continue;
        if (r.type === "PR_FS" && pr.actEnd === null) oos.push({ code: t.code, name: t.name, why: `started ${formatDate(t.actStart)} before ${pr.code} finished` });
        else if (r.type === "PR_SS" && pr.actStart === null) oos.push({ code: t.code, name: t.name, why: `started ${formatDate(t.actStart)} before ${pr.code} started` });
      }
    }
    extra.push({ id: "out-of-sequence", name: "Out-of-sequence progress", count: oos.length, pass: oos.length === 0, items: oos,
      note: "Started activities whose finish-to-start predecessor has not finished (or start-to-start predecessor has not started). Retained logic and progress override give different dates for these." });
    const ssOnly = open.filter((t) => {
      const succs = t.succs.filter((r) => !model.tasks.get(r.succId).span);
      return succs.length > 0 && succs.every((r) => r.type === "PR_SS" || r.type === "PR_SF") && t.type !== "TT_Mile";
    });
    extra.push({ id: "open-finish", name: "Open finishes (start-to-start successors only)", count: ssOnly.length, pass: ssOnly.length === 0,
      items: ssOnly.map((t) => ({ code: t.code, name: t.name, why: "nothing depends on its finish" })),
      note: "An activity whose successors all hang off its start can run long without moving anything: its finish is open-ended even though DCMA point 1 passes." });
  }

  // agreement between the file's stored dates and the recomputed ones
  let compared = 0, matched = 0;
  const stale = [];
  for (const t of open) {
    const r = res.get(t.id);
    if (!r || r.lf === undefined || !t.row.early_end_date) continue;
    compared++;
    const ok = parseDate(t.row.early_end_date) === r.ef && parseDate(t.row.late_end_date) === r.lf && stored(t) !== null && Math.abs(stored(t) - r.tf) < 0.01;
    if (ok) matched++;
    else stale.push({ code: t.code, name: t.name, why: `file: finish ${t.row.early_end_date}, float ${round1(stored(t) ?? NaN)} h; recomputed: finish ${formatDate(r.ef)}, float ${round1(r.tf)} h` });
  }

  // every open activity as recomputed, with what the file stores beside it
  const fmtH = (h) => (h === null || h === undefined || Number.isNaN(h) ? null : Math.round(h * 100) / 100);
  const activities = [];
  for (const t of open) {
    const r = res.get(t.id);
    if (!r || r.lf === undefined) continue;
    const sTF = stored(t), sFF = num(t.row.free_float_hr_cnt);
    activities.push({
      code: t.code, name: t.name, status: t.status, hoursPerDay: t.cal.hoursPerDay || 8,
      start: formatDate(r.remES ?? r.es), finish: formatDate(r.ef), lateStart: formatDate(r.remLS ?? r.ls), lateFinish: formatDate(r.lf),
      totalFloatH: fmtH(r.tf), freeFloatH: fmtH(r.ff),
      storedFinish: t.row.early_end_date || null, storedTotalFloatH: fmtH(sTF), storedFreeFloatH: fmtH(sFF),
    });
  }

  const path = drivingPath(result, p.id).map((id) => model.tasks.get(id));
  return {
    project: {
      id: p.id, code: p.code, name: projRow.proj_short_name || p.code,
      dataDate: formatDate(dd), finish: formatDate(p.finish), storedFinish: formatDate(p.storedFinish), mustFinish: formatDate(p.mustFinish),
      activities: all.filter((t) => !t.span).length, open: open.length, relationships: model.rels.filter((r) => model.tasks.get(r.succId)?.proj === p.id).length,
      version: xer.version, calendars: model.cals.size, projects: model.projects.size,
      settings: { floatType: p.floatType, lagCalendar: p.lagCal, retainedLogic: p.retainedLogic, progressOverride: p.progressOverride },
    },
    checks,
    extra,
    recompute: { compared, matched, items: stale },
    activities,
    drivingPath: path.map((t) => {
      const r = res.get(t.id);
      return { code: t.code, name: t.name, start: formatDate(r.remES ?? r.es), finish: formatDate(r.ef), float: r.tf === undefined ? null : round1(r.tf / (t.cal.hoursPerDay || 8)) };
    }),
    warnings: result.warnings,
    passed: checks.filter((c) => c.pass).length,
  };
}

const CSTR = {
  CS_MSO: "Start on", CS_MEO: "Finish on", CS_MSOB: "Start on or before", CS_MEOB: "Finish on or before",
  CS_MANDSTART: "Mandatory start", CS_MANDFIN: "Mandatory finish", CS_MSOA: "Start on or after", CS_MEOA: "Finish on or after", CS_ALAP: "As late as possible",
};
const TYPE = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };

function relItem(model, r) {
  const a = model.tasks.get(r.predId), b = model.tasks.get(r.succId);
  const h = b ? b.cal.hoursPerDay || 8 : 8;
  return { code: `${a ? a.code : r.predId} -> ${b ? b.code : r.succId}`, name: b ? b.name : "", why: `${Object.hasOwn(TYPE, r.type) ? TYPE[r.type] : r.type} lag ${round1(r.lag / 60 / h)} days` };
}

const round1 = (x) => Math.round(x * 10) / 10;
const round3 = (x) => Math.round(x * 1000) / 1000;

const csvEsc = (v) => {
  let s = String(v ?? "");
  // a cell a spreadsheet would read as a formula is written as text
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// One row per open activity: the recomputed early and late dates, total and
// free float (in working days of the activity's calendar and in hours), and
// the values the file stores, so a reader without P6 can sort by free float
// or see where the stored numbers no longer follow the logic.
export function scheduleCsv(report) {
  const days = (h, hpd) => (h === null ? "" : Math.round((h / hpd) * 100) / 100);
  const rows = [["activity", "name", "status", "early start", "early finish", "late start", "late finish",
    "total float (days)", "free float (days)", "total float (h)", "free float (h)",
    "stored early finish", "stored total float (h)", "stored free float (h)", "stored agrees"]];
  for (const a of report.activities || []) {
    const agrees = a.storedTotalFloatH === null ? "" :
      (Math.abs(a.storedTotalFloatH - a.totalFloatH) < 0.01 && (a.storedFreeFloatH === null || Math.abs(a.storedFreeFloatH - a.freeFloatH) < 0.01) ? "yes" : "no");
    rows.push([a.code, a.name, a.status.replace(/^TK_/, ""), a.start, a.finish, a.lateStart, a.lateFinish,
      days(a.totalFloatH, a.hoursPerDay), days(a.freeFloatH, a.hoursPerDay), a.totalFloatH ?? "", a.freeFloatH ?? "",
      a.storedFinish ?? "", a.storedTotalFloatH ?? "", a.storedFreeFloatH ?? "", agrees]);
  }
  return rows.map((r) => r.map(csvEsc).join(",")).join("\n") + "\n";
}

// Flat rows for a CSV download: one per finding.
export function findingsCsv(report) {
  const esc = (v) => {
    let s = String(v ?? "");
    // a cell a spreadsheet would read as a formula is written as text
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["check", "activity", "name", "detail"]];
  for (const c of [...report.checks, ...report.extra]) for (const it of c.items) rows.push([c.name, it.code, it.name, it.why]);
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
