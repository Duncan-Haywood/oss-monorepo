// The DCMA 14-point schedule assessment on a P6 XER file, plus the checks a
// scheduler runs next to it (logic loops, links into a started activity,
// stored float that no longer matches the logic).
//
// assess(xer, { projId, baseline }) -> {
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
// Missed tasks (11) and BEI (14) need a baseline. Given one (`baseline`, the
// parsed XER of the baseline project), each activity is matched to it by
// activity ID and its baseline finish is used. Without one they fall back on
// P6's planned dates (target_end_date), which stand in for the baseline only
// on started or finished work: P6 resets a not-started activity's planned
// dates to its early dates every time it schedules, so overdue work that has
// not started is never due and never missed. The note on each point says
// which was used.

import { schedule, drivingPath, hardConstraint, lagCalendar } from "./cpm.mjs";
import { longestPath } from "./floatpaths.mjs";
import { relationshipLags } from "./reldates.mjs";
import { parseDate, formatDate, num } from "./xer.mjs";

const DAYS_44 = 44;

const pct = (n, d) => (d ? (100 * n) / d : 0);

// Each activity's baseline finish in a baseline schedule, by activity ID
// (task_code): its actual finish when it had one, else its stored early
// finish (the dates P6 gave it when the baseline was set), else its planned
// finish. Level of effort and WBS summary activities are left out, as in
// the population. Returns { finish: Map(code -> minutes|null), rows }.
export function baselineFinishes(bx) {
  const rows = (bx?.tables?.TASK || []).filter((r) => r.task_type !== "TT_LOE" && r.task_type !== "TT_WBS");
  const finish = new Map(rows.map((r) => [r.task_code, parseDate(r.act_end_date) ?? parseDate(r.early_end_date) ?? parseDate(r.target_end_date)]));
  return { finish, rows };
}

// the predecessor date a link's lag is counted from, as the file stores it
function fromLabel(pr, rel) {
  const fin = rel.type === "PR_FS" || rel.type === "PR_FF";
  if (pr.status === "TK_Complete") return `${fin ? "finished" : "started"} ${formatDate(fin ? pr.actEnd : pr.actStart)}`;
  return `${fin ? "early finish" : "early start"} ${fin ? pr.row.early_end_date : pr.row.early_start_date}`;
}

function pickProject(model, projId) {
  if (projId && model.projects.has(projId)) return model.projects.get(projId);
  // the project with the most open activities
  const counts = new Map();
  for (const t of model.tasks.values()) if (t.status !== "TK_Complete") counts.set(t.proj, (counts.get(t.proj) || 0) + 1);
  let best = null;
  for (const p of model.projects.values()) if (!best || (counts.get(p.id) || 0) > (counts.get(best.id) || 0)) best = p;
  return best;
}

// Links the stored dates break: for each unstarted activity in `open` (but
// not those in `skip`), every link whose lag is longer than the working time
// the stored dates leave between the predecessor's date it counts from (its
// actual date when finished, else its stored early date) and the successor's
// stored early start (FS, SS) or finish (FF, SF). P6 meets every link when it
// schedules, so one it breaks was lengthened or added after that run.
// Returns [{ t, pr, rel, room }], room in minutes of the lag calendar
// (negative: the stored dates break the link even with no lag).
export function brokenLinks(model, open, skip = new Set(), stats = null) {
  const out = [];
  for (const t of open) {
    if (t.status !== "TK_NotStart" || skip.has(t.id)) continue;
    const sES = parseDate(t.row.early_start_date), sEF = parseDate(t.row.early_end_date);
    if (sES === null || sEF === null) continue;
    for (const rel of t.preds) {
      const pr = model.tasks.get(rel.predId);
      if (!pr || pr.span || rel.external) continue;
      const fromFinish = rel.type === "PR_FS" || rel.type === "PR_FF";
      let anchor;
      if (pr.status === "TK_Complete") anchor = fromFinish ? pr.actEnd : pr.actStart;
      else if (fromFinish) anchor = parseDate(pr.row.early_end_date);
      else if (pr.status === "TK_NotStart") anchor = parseDate(pr.row.early_start_date);
      else continue; // an in-progress predecessor's start link: its lag is partly spent
      if (anchor === null || anchor === undefined) continue;
      const target = rel.type === "PR_FS" || rel.type === "PR_SS" ? sES : sEF;
      const lc = lagCalendar(model, rel);
      const gap = (a, b) => (b >= a ? lc.workBetween(a, b) : -lc.workBetween(b, a));
      let room = gap(anchor, target), side = "early";
      // the backward pass meets it too: the predecessor's stored late date
      // is at least the lag before the successor's (a lengthened lag that
      // moves no early date still eats the predecessor's float)
      if (pr.status !== "TK_Complete" && !(pr.status === "TK_Active" && !fromFinish)) {
        const pL = parseDate(fromFinish ? pr.row.late_end_date : pr.row.late_start_date);
        const sL = parseDate(rel.type === "PR_FS" || rel.type === "PR_SS" ? t.row.late_start_date : t.row.late_end_date);
        if (pL !== null && sL !== null) { const r2 = gap(pL, sL); if (r2 < room) { room = r2; side = "late"; } }
      }
      if (stats) stats.checked = (stats.checked || 0) + 1;
      if (room < rel.lag - 1) out.push({ t, pr, rel, room, side });
    }
  }
  return out;
}

export function assess(xer, opts = {}) {
  const result = opts.result || schedule(xer);
  const { model } = result;
  const base = pickProject(model, opts.projId);
  const p = base && result.projects.get(base.id);
  if (!p) {
    const withId = (xer.tables.TASK || []).filter((r) => r.task_id).length;
    throw new Error(withId ? "the file has no PROJECT table" : "the file has no PROJECT table and no activities with a task_id: is it an XER export from P6?");
  }
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

  let popDue = [];
  let baseInfo = null;
  const baseWarnings = [];
  // 1 Logic
  {
    const bad = [];
    for (const t of open) {
      const preds = t.preds.filter((r) => !model.tasks.get(r.predId).span);
      const succs = t.succs.filter((r) => !model.tasks.get(r.succId).span);
      const noPred = preds.length === 0 && !(t.type === "TT_Mile");
      const noSucc = succs.length === 0 && !(t.type === "TT_FinMile");
      if (noPred || noSucc) bad.push({ tid: t.id, code: t.code, name: t.name, why: noPred && noSucc ? "no predecessor or successor" : noPred ? "no predecessor" : "no successor" });
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
      items: bad.map((t) => ({ tid: t.id, code: t.code, name: t.name, why: t.cstr.filter((c) => hardConstraint(c.type)).map((c) => `${Object.hasOwn(CSTR, c.type) ? CSTR[c.type] : c.type} ${formatDate(c.date)}`).join("; ") })),
      note: "Start on, finish on, start on or before, finish on or before and mandatory constraints stop the logic from moving dates." });
  }
  // 6 High float
  {
    const bad = open.filter((t) => floatH(t) !== null && days(t, floatH(t)) > DAYS_44);
    add({ id: 6, name: "High float", value: pct(bad.length, open.length), unit: "%", threshold: "<= 5%", pass: pct(bad.length, open.length) <= 5, count: bad.length, total: open.length,
      items: bad.map((t) => ({ tid: t.id, code: t.code, name: t.name, why: `${round1(days(t, floatH(t)))} days total float` })),
      note: "Open activities with more than 44 working days of total float, usually a sign of missing successors." });
  }
  // 7 Negative float
  {
    const bad = open.filter((t) => floatH(t) !== null && floatH(t) < -1e-9);
    add({ id: 7, name: "Negative float", value: pct(bad.length, open.length), unit: "%", threshold: "0%", pass: bad.length === 0, count: bad.length, total: open.length,
      items: bad.map((t) => ({ tid: t.id, code: t.code, name: t.name, why: `${round1(days(t, floatH(t)))} days total float` })),
      note: "Negative float means a constraint or a must-finish-by date cannot be met with the current logic and durations." });
  }
  // 8 High duration (planned duration of normal activities)
  {
    const dur = (t) => (t.status === "TK_Active" ? t.remain : t.orig) / 60;
    const bad = normal.filter((t) => days(t, dur(t)) > DAYS_44);
    add({ id: 8, name: "High duration", value: pct(bad.length, normal.length), unit: "%", threshold: "<= 5%", pass: pct(bad.length, normal.length) <= 5, count: bad.length, total: normal.length,
      items: bad.map((t) => ({ tid: t.id, code: t.code, name: t.name, why: `${round1(days(t, dur(t)))} days` })),
      note: "Open activities (not milestones) longer than 44 working days: planned duration, or remaining duration once started. Long activities are hard to status and hide logic." });
  }
  // 9 Invalid dates
  {
    const bad = [];
    for (const t of all) {
      if (t.span) continue;
      if (dd !== null && t.actStart !== null && t.actStart > dd) bad.push({ tid: t.id, code: t.code, name: t.name, why: `actual start ${formatDate(t.actStart)} after the data date` });
      if (dd !== null && t.actEnd !== null && t.actEnd > dd) bad.push({ tid: t.id, code: t.code, name: t.name, why: `actual finish ${formatDate(t.actEnd)} after the data date` });
      if (t.status !== "TK_Complete" && dd !== null) {
        const ef = parseDate(t.row.early_end_date);
        const es = parseDate(t.status === "TK_Active" ? "" : t.row.early_start_date);
        if (es !== null && es < dd) bad.push({ tid: t.id, code: t.code, name: t.name, why: `forecast start ${formatDate(es)} before the data date` });
        if (ef !== null && ef < dd) bad.push({ tid: t.id, code: t.code, name: t.name, why: `forecast finish ${formatDate(ef)} before the data date` });
      }
    }
    add({ id: 9, name: "Invalid dates", value: bad.length, unit: "", threshold: "0", pass: bad.length === 0, count: bad.length, total: all.filter((t) => !t.span).length, items: bad,
      note: "Actual dates after the data date, or forecast dates before it, as stored in the file." });
  }
  // 10 Resources
  {
    // a resource assignment or an expense (PROJCOST) loads an activity, as
    // earned value counts both (evm.mjs)
    const loads = [...(xer.tables.TASKRSRC || []), ...(xer.tables.PROJCOST || [])];
    const withRes = new Set(loads.map((r) => r.task_id));
    const loaded = loads.length > 0;
    const bad = normal.filter((t) => (t.status === "TK_Active" ? t.remain : t.orig) > 0 && !withRes.has(t.id));
    add({ id: 10, name: "Resources", value: pct(bad.length, normal.length), unit: "%", threshold: "0%", pass: bad.length === 0, count: bad.length, total: normal.length,
      items: bad.map((t) => ({ tid: t.id, code: t.code, name: t.name, why: "no resource assignment or expense" })),
      note: loaded ? "Open activities with duration and no resource assignment or expense." : "The file has no resource assignments or expenses at all; skip this check if the schedule is not meant to be resource or cost loaded." });
  }
  // 11 Missed tasks and 14 BEI: against the baseline file when one is given,
  // else the planned finish stands in (see the header)
  {
    const isMile = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
    const bl = opts.baseline ? baselineFinishes(opts.baseline) : null;
    const useBl = !!(bl && bl.rows.length);
    if (bl && !useBl) baseWarnings.push("The baseline file has no activities, so missed tasks and BEI use the planned dates in this file instead.");
    const counted = all.filter((t) => !t.span && !isMile(t) && (!useBl || bl.finish.has(t.code)));
    const bFin = useBl ? (t) => bl.finish.get(t.code) : (t) => parseDate(t.row.target_end_date);
    const word = useBl ? "baseline finish" : "planned to finish";
    const due = counted.filter((t) => dd !== null && bFin(t) !== null && bFin(t) <= dd);
    const missed = due.filter((t) => t.actEnd === null || t.actEnd > bFin(t));
    popDue = due.map((t) => t.id);
    const matched = useBl ? all.filter((t) => !t.span && bl.finish.has(t.code)).length : null;
    const ofAll = all.filter((t) => !t.span).length;
    baseInfo = useBl ? { source: "file", matched, activities: ofAll, due: due.length } : { source: "planned dates", matched: null, activities: ofAll, due: due.length };
    add({ id: 11, name: "Missed tasks", value: pct(missed.length, due.length), unit: "%", threshold: "<= 5%", pass: pct(missed.length, due.length) <= 5, count: missed.length, total: due.length,
      items: missed.map((t) => ({ tid: t.id, code: t.code, name: t.name, why: t.actEnd === null ? `${word} ${formatDate(bFin(t))}, not finished` : `${useBl ? "baseline finish" : "planned"} ${formatDate(bFin(t))}, finished ${formatDate(t.actEnd)}` })),
      note: useBl
        ? `Activities whose baseline finish is on or before the data date that finished late or have not finished, against the baseline file (${matched} of ${ofAll} activities matched by activity ID; activities added since the baseline are not counted).`
        : "Activities planned to finish by the data date that finished late or have not finished. No baseline file given, so planned dates stand in for the baseline; that holds only on started or finished activities: P6 resets a not-started activity's planned dates to its early dates when it schedules, so late work not yet started is not counted. Open the baseline project's XER to count it." });
    // DCMA's BEI: activities finished to date over those the baseline had due by now
    const doneAll = counted.filter((t) => t.status === "TK_Complete").length;
    const bei = due.length ? doneAll / due.length : null;
    checks.bei = { value: bei, due: due.length, finished: doneAll, useBl };
  }
  // 12 Critical path test
  {
    const path = drivingPath(result, p.id);
    const cand = path.map((id) => model.tasks.get(id)).find((t) => t && t.status !== "TK_Complete" && t.type !== "TT_FinMile" && t.type !== "TT_Mile") || path.map((id) => model.tasks.get(id))[0];
    let pass = false, why = "no open activity on the driving path";
    let value = null;
    const mile = cand && (cand.type === "TT_Mile" || cand.type === "TT_FinMile");
    if (mile) {
      // Adding duration to a milestone moves nothing, so a 0-day result here
      // is not a broken path: the path holds no open activity to delay.
      why = `the driving path holds no open activity with a duration, only the milestone ${cand.code}${cand.row?.cstr_type ? ` (constraint ${cand.row.cstr_type.replace("CS_", "")})` : ""}: nothing drives the finish, so the test cannot run`;
    } else if (cand && p.finish !== null) {
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
      note: b.due ? `${b.finished} activities finished of ${b.due} ${b.useBl ? "due by the data date on the baseline file" : "planned to finish by the data date (planned dates as the baseline: no baseline file given)"}.` : `No activity was ${b.useBl ? "due by the data date on the baseline file" : "planned to finish by the data date"}, so there is nothing to measure yet.` });
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
        if (r.type === "PR_FS" && pr.actEnd === null) oos.push({ tid: t.id, code: t.code, name: t.name, why: `started ${formatDate(t.actStart)} before ${pr.code} finished` });
        else if (r.type === "PR_SS" && pr.actStart === null) oos.push({ tid: t.id, code: t.code, name: t.name, why: `started ${formatDate(t.actStart)} before ${pr.code} started` });
      }
    }
    extra.push({ id: "out-of-sequence", name: "Out-of-sequence progress", count: oos.length, pass: oos.length === 0, items: oos,
      note: "Started activities whose finish-to-start predecessor has not finished (or start-to-start predecessor has not started). Retained logic and progress override give different dates for these." });
    const ssOnly = open.filter((t) => {
      const succs = t.succs.filter((r) => !model.tasks.get(r.succId).span);
      return succs.length > 0 && succs.every((r) => r.type === "PR_SS" || r.type === "PR_SF") && t.type !== "TT_Mile";
    });
    extra.push({ id: "open-finish", name: "Open finishes (start-to-start successors only)", count: ssOnly.length, pass: ssOnly.length === 0,
      items: ssOnly.map((t) => ({ tid: t.id, code: t.code, name: t.name, why: "nothing depends on its finish" })),
      note: "An activity whose successors all hang off its start can run long without moving anything: its finish is open-ended even though DCMA point 1 passes." });
  }

  // expected finish dates: with "use expected end dates" on, the activity's
  // remaining duration is whatever is left to the date typed in, so it
  // finishes there however late its predecessors run (delay is absorbed, not
  // passed on), and a date already behind the remaining start is ignored
  if (p.useExpectedFinish) {
    const items = [];
    for (const t of open) {
      if (t.expEnd === null || t.expEnd === undefined || t.type === "TT_Mile" || t.type === "TT_FinMile") continue;
      const r = res.get(t.id);
      if (!r) continue;
      const start = r.remES ?? r.es;
      const d = (min) => round1(min / 60 / hpd(t));
      if (t.expEnd <= start) {
        items.push({ code: t.code, name: t.name, kind: "ignored", why: `expected finish ${formatDate(t.expEnd)} is ${dd !== null && t.expEnd < dd ? `before the data date ${formatDate(dd)}` : `not after where its remaining work starts, ${formatDate(start)}`}, so it is ignored and the remaining ${d(r.rem ?? t.remain)} d stands: update or clear it` });
        continue;
      }
      let why = `finishes on its expected finish ${formatDate(t.expEnd)}: remaining duration set to ${d(r.rem ?? t.remain)} d (original ${d(t.orig)} d); up to that much delay to its predecessors is absorbed instead of passed on`;
      // the rate it has gone at so far, where the file says how far along it is
      const pct = num(t.row.phys_complete_pct);
      if (t.status === "TK_Active" && t.actStart !== null && dd !== null && dd > t.actStart && pct !== null && pct < 100) {
        const spent = t.cal.workBetween(t.actStart, dd) / 60 / hpd(t);
        if (spent >= 1) {
          if (pct > 0) {
            const atRate = (spent * (100 - pct)) / pct;
            if (atRate > (r.rem ?? t.remain) / 60 / hpd(t) * 1.5) why += `; ${round1(pct)}% done in ${round1(spent)} d, so ${round1(atRate)} d left at the rate so far`;
          } else if (spent >= 5) why += `; 0% done after ${round1(spent)} d`;
        }
      }
      items.push({ code: t.code, name: t.name, kind: "set", why });
    }
    extra.push({ id: "expected-finish", name: "Expected finish dates setting durations", count: items.length, pass: items.length === 0, items,
      note: "The project schedules with \"use expected end dates\": each activity listed takes the remaining duration that ends it on a date someone typed, not one estimated from the work left. A late predecessor shortens it instead of moving its successors, so delay can be hidden; dates already passed are ignored and should be cleared." });
  }

  // agreement between the file's stored dates and the recomputed ones
  let compared = 0, matched = 0;
  const stale = [];
  // Microsoft Project writes a late finish bounded by a successor's start as
  // that start (08:00 the next working day) where P6 writes 17:00 the day
  // before: for its files, two dates with no working time between them agree
  const sameDate = xer.format === "mspdi"
    ? (t, a, b) => a === b || (a !== null && b !== null && t.cal.workBetween(Math.min(a, b), Math.max(a, b)) === 0)
    : (t, a, b) => a === b;
  for (const t of open) {
    const r = res.get(t.id);
    if (!r || r.lf === undefined || !t.row.early_end_date) continue;
    compared++;
    const ok = sameDate(t, parseDate(t.row.early_end_date), r.ef) && sameDate(t, parseDate(t.row.late_end_date), r.lf) && stored(t) !== null && Math.abs(stored(t) - r.tf) < 0.01;
    if (ok) matched++;
    else stale.push({ id: t.id, code: t.code, name: t.name, why: `file: finish ${t.row.early_end_date}, float ${stored(t) === null ? "not stored" : `${round1(stored(t))} h`}; recomputed: finish ${formatDate(r.ef)}, float ${round1(r.tf)} h` });
  }

  // Durations edited after the last schedule run. P6 writes an unstarted
  // activity's early start and finish with its remaining duration between
  // them; when the work between the stored dates is not the duration the file
  // now holds, someone changed the duration and exported without rescheduling.
  // Harbour Pointe (P6 17.12): 8 such activities explain all 25 of its 113
  // open activities that differ; none on the six files P6 had just scheduled
  // (eval/edited-durations-2026-11-19.md). Rescheduling with the durations
  // the stored dates imply says how many differences the edits account for.
  const edited = [];
  if (stale.length && xer.format !== "mspdi") {
    for (const t of normal) {
      // an expected finish sets the duration itself when the project uses them
      if (t.status !== "TK_NotStart" || (p.useExpectedFinish && t.expEnd !== null)) continue;
      const s = parseDate(t.row.early_start_date), f = parseDate(t.row.early_end_date), d = num(t.row.remain_drtn_hr_cnt);
      if (s === null || f === null || d === null || f < s) continue;
      const spanH = t.cal.workBetween(s, f) / 60;
      if (Math.abs(spanH - d) > 0.01) edited.push({ t, spanH, d });
    }
  }
  let explained = null;
  if (edited.length && !opts.result) {
    const implied = new Map(edited.map((e) => [e.t.id, e.spanH]));
    const TASK = (xer.tables.TASK || []).map((r) => (implied.has(r.task_id) ? { ...r, remain_drtn_hr_cnt: String(implied.get(r.task_id)) } : r));
    const again = schedule({ ...xer, tables: { ...xer.tables, TASK } }).tasks;
    explained = 0;
    for (const s of stale) {
      const t = model.tasks.get(s.id), r = again.get(s.id);
      if (!r || r.lf === undefined) continue;
      if (sameDate(t, parseDate(t.row.early_end_date), r.ef) && sameDate(t, parseDate(t.row.late_end_date), r.lf) && stored(t) !== null && Math.abs(stored(t) - r.tf) < 0.01) {
        explained++;
        s.why += "; agrees once the edited durations are put back";
      }
    }
  }
  if (edited.length) {
    const items = edited.map(({ t, spanH, d }) => ({ code: t.code, name: t.name, why: `remaining duration ${round1(days(t, d))} d; the stored dates ${t.row.early_start_date} to ${t.row.early_end_date} span ${round1(days(t, spanH))} d` }));
    extra.push({ id: "edited-durations", name: "Durations edited after the last schedule run", count: items.length, pass: false, items, explained, differ: stale.length,
      note: `The stored early dates of each activity listed span a different amount of work than its remaining duration, so the duration was changed after P6 last scheduled and the file was exported without rescheduling.${explained === null ? "" : ` Rescheduled with the durations the stored dates imply, ${explained} of the ${stale.length} activities whose stored dates disagree with the logic agree.`}` });
  }

  // Lags edited after the last schedule run (or links added since). P6 leaves
  // every link it scheduled met by the dates it stores: an unstarted
  // successor's stored early start (finish, for FF and SF links) is at least
  // the lag after the predecessor's actual date, or its stored early date if
  // it is unfinished. A link the stored dates break was lengthened or added
  // after that run. CCA (P6 6.0): one 608 h lag where the stored dates leave
  // exactly 440 h (55 days of 8 h) explains both of its open activities that
  // differ; none of the other links on six P6 files breaks its dates
  // (eval/edited-lags-2026-11-19.md). That link's own relationship date shows
  // P6 used 608 h at that run, so the gap is P6's forward pass, and the item
  // says so (eval/relationship-dates-2026-11-20.md).
  const editedLags = stale.length && xer.format !== "mspdi" ? brokenLinks(model, open, new Set(edited.map((e) => e.t.id))) : [];
  // P6's own relationship dates (TASKPRED aref/arls) carry the lag it used
  // at that run, so a lag changed since (longer or shorter) is listed with
  // its old value, and a link with no relationship dates was added since
  // (reldates.mjs; eval/relationship-dates-2026-11-20.md: 40,476 of 40,476
  // links on six P6 files decode exactly, 360 of 360 planted edits recovered).
  // Links with a started end carry only the lag unspent at the data date
  // (eval/relationship-dates-started-2026-11-24.md); where none was left the
  // old lag is only bounded by the work already spent (atMost).
  const relDates = xer.format !== "mspdi" ? relationshipLags(model) : { links: [], added: [] };
  const inOpen = new Set(open.map((t) => t.id));
  const started = relDates.started || relDates.finished;
  const wasLag = new Map([...relDates.links, ...(started?.was || [])].map((l) => [l.rel.id, l.was]));
  const atMostLag = new Map((started?.atMost || []).map((l) => [l.rel.id, l.atMost]));
  const sameLag = started?.agree || new Set();
  const addedRel = new Set(relDates.added.map((l) => l.rel.id));
  for (const l of [...relDates.links, ...(started?.was || []), ...(started?.atMost || []), ...relDates.added]) {
    if (!inOpen.has(l.succ.id) || editedLags.some((e) => e.rel.id === l.rel.id)) continue;
    editedLags.push({ t: l.succ, pr: l.pred, rel: l.rel, room: null, side: "rel" });
  }
  let lagsExplained = null, lagsNear = 0;
  // two dates with no working time between them on the activity's calendar
  const near = (t, a, b) => a === b || (a !== null && b !== null && t.cal.workBetween(Math.min(a, b), Math.max(a, b)) === 0);
  if (editedLags.length && stale.length && !opts.result) {
    // the lag P6's relationship dates name where there is one, else the
    // room the stored dates leave; a link added since the run comes out
    const implied = new Map(editedLags.filter((e) => !addedRel.has(e.rel.id)).map((e) => [e.rel.id, (wasLag.has(e.rel.id) ? wasLag.get(e.rel.id) : atMostLag.has(e.rel.id) ? atMostLag.get(e.rel.id) : e.room) / 60]));
    const TASKPRED = (xer.tables.TASKPRED || []).filter((r) => !addedRel.has(r.task_pred_id)).map((r) => (implied.has(r.task_pred_id) ? { ...r, lag_hr_cnt: String(implied.get(r.task_pred_id)) } : r));
    const again = schedule({ ...xer, tables: { ...xer.tables, TASKPRED } }).tasks;
    lagsExplained = 0;
    for (const s of stale) {
      const t = model.tasks.get(s.id), r = again.get(s.id);
      if (!r || r.lf === undefined) continue;
      if (sameDate(t, parseDate(t.row.early_end_date), r.ef) && sameDate(t, parseDate(t.row.late_end_date), r.lf) && stored(t) !== null && Math.abs(stored(t) - r.tf) < 0.01) {
        lagsExplained++;
        s.why += "; agrees once the edited lags are put back";
      } else if (near(t, parseDate(t.row.early_end_date), r.ef) && near(t, parseDate(t.row.late_end_date), r.lf) && stored(t) !== null && Math.abs(stored(t) - r.tf) < 0.01) {
        lagsNear++;
        s.why += "; once the edited lags are put back, agrees but for a gap with no working time in it (P6 wrote the next working start)";
      }
    }
  }
  if (editedLags.length) {
    const kind = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
    const items = editedLags.map(({ t, pr, rel, room, side }) => {
      const k = kind[rel.type] || rel.type;
      const lagTxt = `${k} link from ${pr.code}, lag ${round1(rel.lag / 60)} h (${round1(days(t, rel.lag / 60))} d)`;
      const fromS = rel.type === "PR_FS" || rel.type === "PR_FF" ? "finish" : "start", toS = rel.type === "PR_FS" || rel.type === "PR_SS" ? "start" : "finish";
      const between = side === "late"
        ? `between ${pr.code}'s stored late ${fromS} ${fromS === "finish" ? pr.row.late_end_date : pr.row.late_start_date} and this activity's stored late ${toS}`
        : `after ${pr.code} ${fromLabel(pr, rel)}`;
      const was = wasLag.has(rel.id) ? wasLag.get(rel.id) / 60 : null;
      const most = atMostLag.has(rel.id) ? atMostLag.get(rel.id) / 60 : null;
      const p6 = was !== null ? `; P6's own relationship dates for this link were written with a lag of ${round1(was)} h (${round1(days(t, was))} d) at the last schedule run`
        : most !== null ? `; P6's own relationship date for this link was written with none of the lag left at the data date, so at the last schedule run the lag was at most ${round1(most)} h (${round1(days(t, most))} d), the working time already spent since ${pr.code}'s actual ${rel.type === "PR_SS" ? "start" : "finish"}`
        : sameLag.has(rel.id) ? `; but P6's own relationship date for this link (arls) was written with this same lag, so the lag was not changed: P6's forward pass at its last run left this gap itself` : "";
      if (addedRel.has(rel.id)) return { code: t.code, name: t.name, pred: pr.code, why: `${lagTxt}: added after the last schedule run (P6 wrote relationship dates for every other link, none for this one)` };
      if (room === null) return { code: t.code, name: t.name, pred: pr.code, lagWas: was, ...(most !== null ? { lagWasAtMost: most } : {}), why: `${lagTxt}${p6}, so the lag was changed after that run` };
      return { code: t.code, name: t.name, pred: pr.code, lagWas: was, ...(most !== null ? { lagWasAtMost: most } : {}), why: (room < 0
        ? `${lagTxt}: the stored dates break it even with no lag (${round1(-room / 60)} h short ${between}), so the link was added or changed after the last schedule run`
        : `${lagTxt}; the stored dates leave ${round1(room / 60)} h (${round1(days(t, room / 60))} d) ${between}`) + p6 };
    });
    extra.push({ id: "edited-lags", name: "Lags edited after the last schedule run", count: items.length, pass: false, items, explained: lagsExplained, near: lagsNear, differ: stale.length,
      note: `Each link listed is either broken by the dates the file stores (the successor's stored date is closer to its predecessor than the lag allows; P6 meets every link when it schedules) or has relationship dates that P6 wrote with another lag (TASKPRED aref and arls, which P6 writes for every link at each schedule run). Either way the lag was changed, the link added, or the predecessor's actual date moved after the last schedule run, and the file was exported without rescheduling${editedLags.some((e) => sameLag.has(e.rel.id)) ? " (except where an item says P6's relationship date carries the current lag: there P6's own forward pass left the gap, and putting back means giving the link the lag the stored dates leave room for)" : ""}.${lagsExplained === null ? "" : ` Rescheduled with the lags the stored dates leave room for, ${lagsExplained} of the ${stale.length} activities whose stored dates disagree with the logic agree${lagsNear ? `, and ${lagsNear} more but for a gap with no working time in it` : ""}.`}` });
  }

  for (const s of stale) delete s.id;

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
  // every driving branch into the finish, against the longest path P6 itself
  // flagged at its last run (TASK.driving_path_flag), open activities only
  const lp = longestPath(result, p.id);
  const flagged = new Set(open.filter((t) => t.row.driving_path_flag === "Y").map((t) => t.id));
  const codes = (ids) => ids.map((id) => model.tasks.get(id).code);
  const longest = {
    count: lp.size, p6Flagged: flagged.size, agree: [...lp].filter((id) => flagged.has(id)).length,
    onlyP6: codes([...flagged].filter((id) => !lp.has(id))), onlyHere: codes([...lp].filter((id) => !flagged.has(id))),
  };
  const report = {
    project: {
      id: p.id, code: p.code, name: projRow.proj_short_name || p.code,
      dataDate: formatDate(dd), finish: formatDate(p.finish), storedFinish: formatDate(p.storedFinish), mustFinish: formatDate(p.mustFinish),
      activities: all.filter((t) => !t.span).length, open: open.length, relationships: model.rels.filter((r) => model.tasks.get(r.succId)?.proj === p.id).length,
      version: xer.version, calendars: model.cals.size, projects: model.projects.size,
      settings: { floatType: p.floatType, lagCalendar: p.lagCal, retainedLogic: p.retainedLogic, progressOverride: p.progressOverride, expectedFinish: !!p.useExpectedFinish },
    },
    checks,
    extra,
    recompute: { compared, matched, items: stale },
    activities,
    drivingPath: path.map((t) => {
      const r = res.get(t.id);
      return { code: t.code, name: t.name, start: formatDate(r.remES ?? r.es), finish: formatDate(r.ef), float: r.tf === undefined ? null : round1(r.tf / (t.cal.hoursPerDay || 8)) };
    }),
    longestPath: longest,
    baseline: baseInfo,
    warnings: [...result.warnings, ...baseWarnings],
    passed: checks.filter((c) => c.pass).length,
  };
  // the activities each check counts over (relationship checks: each
  // relationship's successor), for a breakdown by WBS or activity code
  // (ribbon.mjs). Not enumerable, so JSON output is unchanged.
  const ids = (ts) => ts.map((t) => t.id);
  const relIds = (rs) => rs.map((r) => r.succId);
  Object.defineProperty(report, "populations", { enumerable: false, value: {
    1: ids(open), 2: relIds(rels), 3: relIds(rels), 4: relIds(rels), 5: ids(open), 6: ids(open), 7: ids(open),
    8: ids(normal), 9: ids(all.filter((t) => !t.span)), 10: ids(normal), 11: popDue,
  } });
  return report;
}

const CSTR = {
  CS_MSO: "Start on", CS_MEO: "Finish on", CS_MSOB: "Start on or before", CS_MEOB: "Finish on or before",
  CS_MANDSTART: "Mandatory start", CS_MANDFIN: "Mandatory finish", CS_MSOA: "Start on or after", CS_MEOA: "Finish on or after", CS_ALAP: "As late as possible",
};
const TYPE = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };

function relItem(model, r) {
  const a = model.tasks.get(r.predId), b = model.tasks.get(r.succId);
  const h = b ? b.cal.hoursPerDay || 8 : 8;
  return { tid: r.succId, code: `${a ? a.code : r.predId} -> ${b ? b.code : r.succId}`, name: b ? b.name : "", why: `${Object.hasOwn(TYPE, r.type) ? TYPE[r.type] : r.type} lag ${round1(r.lag / 60 / h)} days` };
}

const round1 = (x) => Math.round(x * 10) / 10;
const round3 = (x) => Math.round(x * 1000) / 1000;

const csvEsc = (v) => {
  let s = String(v ?? "");
  // a cell a spreadsheet would read as a formula is written as text
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["check", "activity", "name", "detail"]];
  for (const c of [...report.checks, ...report.extra]) for (const it of c.items) rows.push([c.name, it.code, it.name, it.why]);
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
