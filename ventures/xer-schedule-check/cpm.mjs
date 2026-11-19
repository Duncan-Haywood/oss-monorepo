// Critical path method on a P6 schedule, the way P6 computes it: durations
// and lags in working hours on each activity's own calendar, FS/SS/FF/SF
// relationships, the project's lag-calendar and float settings, progress at
// the data date (retained logic or progress override), the primary and
// secondary constraints, and a must-finish-by date.
//
// schedule(xer, opts) -> {
//   tasks: Map(task_id -> { es, ef, ls, lf, tf, ff, ... }),  minutes / hours
//   projects: Map(proj_id -> { dataDate, finish, mustFinish, ... }),
//   loops: [[task_id...]], warnings: [string]
// }
// Times are wall-clock minutes (xer.mjs parseDate); tf and ff are hours.
//
// Not modelled: resource levelling, expected finish dates, out-of-sequence
// progress beyond retained logic / progress override, resource-dependent
// activity dates (a TT_Rsrc activity is scheduled on its own calendar), level
// of effort and WBS summary dates (they span their neighbours and drive
// nothing; they are reported but left out of the network).

import { Calendar } from "./calendar.mjs";
import { parseDate, formatDate, num } from "./xer.mjs";

const SPAN_TYPES = new Set(["TT_LOE", "TT_WBS"]);
const HARD = new Set(["CS_MSO", "CS_MEO", "CS_MSOB", "CS_MEOB", "CS_MANDSTART", "CS_MANDFIN"]);
export const hardConstraint = (t) => HARD.has(t);

function finishSnap(cal, t) {
  // earliest instant >= t at which work can end
  return cal.prevEnd(t) === t ? t : cal.nextStart(t);
}
function startSnapBack(cal, t) {
  // latest instant <= t at which work can start
  return cal.nextStart(t) === t ? t : cal.prevEnd(t);
}

export function buildModel(xer) {
  // a Microsoft Project file's reader notes (manual tasks, summary links,
  // deadlines) belong with the schedule's own warnings
  const warnings = xer.format === "mspdi" ? [...xer.warnings] : [];
  // A TASK row with no task_id cannot be linked or reported (a hand-made
  // table headed Task_ID, say): it is left out, and said so.
  const noId = (xer.tables.TASK || []).filter((r) => !r.task_id).length;
  const T = noId ? { ...xer.tables, TASK: xer.tables.TASK.filter((r) => r.task_id) } : xer.tables;
  if (noId) warnings.push(`${noId} TASK ${noId === 1 ? "row has" : "rows have"} no task_id and ${noId === 1 ? "was" : "were"} left out`);
  const cals = new Map();
  for (const row of T.CALENDAR || []) {
    if (!(row.clndr_data || "").trim()) {
      // no work pattern stored (hand-made files, some converters): a
      // Monday-to-Friday week of the calendar's hours per day, said aloud
      // The week's hours over the day's say how many days it works: 48 over
      // 8 is Monday to Saturday, 168 over 24 every day. Only a whole 5, 6 or
      // 7 is used; anything else (42 over 8, 24 over 12) keeps Monday to Friday.
      const h = num(row.day_hr_cnt), w = num(row.week_hr_cnt);
      const hours = h !== null && h > 0 && h <= 24 ? h : 8;
      const ratio = h !== null && w !== null && h > 0 ? w / h : null;
      const days = ratio !== null && [6, 7].includes(Math.round(ratio)) && Math.abs(ratio - Math.round(ratio)) < 1e-6 ? Math.round(ratio) : 5;
      const cal = Calendar.weekdays(hours, row.clndr_id, row.clndr_name || "", days);
      cals.set(row.clndr_id, cal);
      const span = hours >= 24 ? "all day" : `${cal.hoursPerDay} h a day from 08:00`;
      const week = days === 7 ? "every day" : days === 6 ? `Monday to Saturday (${w} h a week)` : "Monday to Friday";
      warnings.push(`calendar ${row.clndr_id} (${row.clndr_name || "no name"}) stores no work pattern; assumed ${week}, ${span}`);
      continue;
    }
    try {
      cals.set(row.clndr_id, Calendar.fromXer(row));
    } catch (e) {
      warnings.push(`calendar ${row.clndr_id} (${row.clndr_name}): ${e.message}`);
    }
  }
  const defaultCal = [...(T.CALENDAR || [])].find((c) => c.default_flag === "Y" && cals.has(c.clndr_id));
  const fallback = defaultCal ? cals.get(defaultCal.clndr_id) : cals.values().next().value || Calendar.allDay();
  const opts = new Map();
  for (const o of T.SCHEDOPTIONS || []) opts.set(o.proj_id, o);
  const firstOpt = (T.SCHEDOPTIONS || [])[0] || {};
  const projects = new Map();
  const projRows = [...(T.PROJECT || [])];
  // activities whose project is not in the PROJECT table (or a file with no
  // PROJECT table) still get a project, so the file can be assessed
  const known = new Set(projRows.map((p) => p.proj_id));
  for (const r of T.TASK || []) {
    if (known.has(r.proj_id)) continue;
    known.add(r.proj_id);
    projRows.push({ proj_id: r.proj_id, proj_short_name: r.proj_id ? `project ${r.proj_id}` : "(no project)" });
    warnings.push(`activities name project ${r.proj_id || "(none)"}, which the file's PROJECT table does not list; assessed as their own project`);
  }
  for (const p of projRows) {
    const o = opts.get(p.proj_id) || firstOpt;
    projects.set(p.proj_id, {
      id: p.proj_id,
      code: p.proj_short_name,
      dataDate: parseDate(p.last_recalc_date) ?? parseDate(p.plan_start_date),
      // nothing that has not started may start before the project's planned start
      plannedStart: parseDate(p.plan_start_date),
      mustFinish: parseDate(p.plan_end_date),
      storedFinish: parseDate(p.scd_end_date),
      cal: cals.get(p.clndr_id) || fallback,
      floatType: o.sched_float_type || "FT_FF",
      lagCal: o.sched_calendar_on_relationship_lag || "rcal_Predecessor",
      retainedLogic: (o.sched_retained_logic || "Y") === "Y",
      progressOverride: (o.sched_progress_override || "N") === "Y",
      openCritical: o.sched_open_critical_flag === "Y",
      useProjectEndForFloat: (o.sched_use_project_end_date_for_float || "Y") === "Y",
      criticalHours: num(p.critical_drtn_hr_cnt) ?? 0,
      criticalType: p.critical_path_type || "CT_TotFloat",
    });
  }
  // A file with no data date (hand-made, or written by another tool) would
  // leave an activity with no predecessor nothing to start from: count from
  // the earliest date the file stores instead, and say so.
  let anchor = null;
  for (const p of T.PROJECT || []) for (const k of ["last_recalc_date", "plan_start_date"]) {
    const d = parseDate(p[k]);
    if (d !== null && (anchor === null || d < anchor)) anchor = d;
  }
  for (const r of T.TASK || []) for (const k of ["act_start_date", "restart_date", "early_start_date", "target_start_date"]) {
    const d = parseDate(r[k]);
    if (d !== null && (anchor === null || d < anchor)) anchor = d;
  }
  if (anchor === null) anchor = Date.UTC(2000, 0, 3) / 60000; // a Monday, when the file stores no date at all
  for (const p of projects.values()) {
    if (p.dataDate !== null && p.dataDate !== undefined) continue;
    p.dataDate = anchor;
    warnings.push(`project ${p.code || p.id}: no data date or planned start in the file, so dates are counted from ${formatDate(anchor)}`);
  }
  const tasks = new Map();
  // Activities that name no calendar, or one the file does not hold, take
  // their project's calendar (else the file's default) and are reported
  // once per missing calendar, not once per activity.
  const missingCal = new Map();
  // Number fields that are filled in but do not read as a number ("NaN",
  // "inf", text) are read as 0 and reported once per field.
  const unreadable = new Map();
  const readHours = (row, field, what) => {
    const v = num(row[field]);
    if (v === null && row[field] !== undefined && String(row[field]).trim() !== "") {
      if (!unreadable.has(field)) unreadable.set(field, { what, codes: [] });
      unreadable.get(field).codes.push(`${what === "lag" ? `link ${row.task_pred_id ?? "?"}` : row.task_code} (${JSON.stringify(String(row[field]).slice(0, 20))})`);
    }
    return v ?? 0;
  };
  for (const r of T.TASK || []) {
    let cal = cals.get(r.clndr_id);
    if (!cal) {
      const pc = projects.get(r.proj_id);
      cal = (pc && pc.cal) || fallback;
      const key = r.clndr_id ? `calendar ${r.clndr_id} is not in the file` : "no calendar is named";
      if (!missingCal.has(key)) missingCal.set(key, { cal, codes: [] });
      missingCal.get(key).codes.push(r.task_code);
    }
    const cstr = [];
    if (r.cstr_type) cstr.push({ type: r.cstr_type, date: parseDate(r.cstr_date) });
    if (r.cstr_type2) cstr.push({ type: r.cstr_type2, date: parseDate(r.cstr_date2) });
    tasks.set(r.task_id, {
      id: r.task_id,
      code: r.task_code,
      name: r.task_name,
      proj: r.proj_id,
      wbs: r.wbs_id,
      cal,
      type: r.task_type,
      status: r.status_code,
      span: SPAN_TYPES.has(r.task_type),
      remain: Math.round(readHours(r, "remain_drtn_hr_cnt", "remaining duration") * 60),
      orig: Math.round(readHours(r, "target_drtn_hr_cnt", "original duration") * 60),
      actStart: parseDate(r.act_start_date),
      actEnd: parseDate(r.act_end_date),
      cstr,
      extES: parseDate(r.external_early_start_date),
      extLF: parseDate(r.external_late_end_date),
      preds: [],
      succs: [],
      row: r,
    });
  }
  const rels = [];
  for (const r of T.TASKPRED || []) {
    const succ = tasks.get(r.task_id);
    const pred = tasks.get(r.pred_task_id);
    const rel = { id: r.task_pred_id, succId: r.task_id, predId: r.pred_task_id, type: r.pred_type, lag: Math.round(readHours(r, "lag_hr_cnt", "lag") * 60), external: !succ || !pred };
    // a per-link lag calendar (not in P6; mspdi.mjs sets it for Project's elapsed lags)
    if (r.lag_calendar === "24h") rel.lagCal = "rcal_24Hour";
    rels.push(rel);
    if (!succ || !pred) continue;
    succ.preds.push(rel);
    pred.succs.push(rel);
  }
  const some = (codes) => `${codes.slice(0, 5).join(", ")}${codes.length > 5 ? ` and ${codes.length - 5} more` : ""}`;
  for (const [key, { cal, codes }] of missingCal) {
    warnings.push(`${codes.length} ${codes.length === 1 ? "activity" : "activities"}: ${key} (${some(codes)}); used ${cal.name || "the default calendar"}`);
  }
  for (const { what, codes } of unreadable.values()) {
    warnings.push(`${codes.length} ${what} ${codes.length === 1 ? "value does" : "values do"} not read as a number and ${codes.length === 1 ? "was" : "were"} taken as 0: ${some(codes)}`);
  }
  // A resource assignment can keep remaining work after its activity's
  // remaining duration is zero (units left on a labour row): P6 rolls the
  // assignment's late dates up, so the activity's late start sits that much
  // work before its late finish. Its length is restart to reend on the
  // activity's calendar.
  for (const a of T.TASKRSRC || []) {
    const t = tasks.get(a.task_id);
    if (!t || t.span) continue;
    const s = parseDate(a.restart_date), e = parseDate(a.reend_date);
    if (s === null || e === null || e <= s) continue;
    const w = t.cal.workBetween(s, e);
    if (w > (t.rsrcRemain || 0)) t.rsrcRemain = w;
  }
  return { tasks, projects, rels, cals, fallback, warnings, anchor };
}

function lagCalendar(model, rel) {
  const pred = model.tasks.get(rel.predId);
  const succ = model.tasks.get(rel.succId);
  const proj = model.projects.get(succ.proj);
  switch (rel.lagCal || (proj ? proj.lagCal : "rcal_Predecessor")) {
    case "rcal_Successor": return succ.cal;
    case "rcal_24Hour": return Calendar.allDay();
    case "rcal_ProjDefault": return proj.cal;
    default: return pred.cal;
  }
}

// Kahn's algorithm over the activities in the network; whatever is left
// sits on or behind a loop.
function topoOrder(model, inNet) {
  const indeg = new Map();
  for (const t of model.tasks.values()) if (inNet(t)) indeg.set(t.id, 0);
  for (const t of model.tasks.values()) {
    if (!inNet(t)) continue;
    for (const r of t.preds) if (indeg.has(r.predId)) indeg.set(t.id, indeg.get(t.id) + 1);
  }
  const queue = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  const order = [];
  for (let k = 0; k < queue.length; k++) {
    const id = queue[k];
    order.push(id);
    for (const r of model.tasks.get(id).succs) {
      if (!indeg.has(r.succId)) continue;
      const d = indeg.get(r.succId) - 1;
      indeg.set(r.succId, d);
      if (d === 0) queue.push(r.succId);
    }
  }
  const stuck = [...indeg.keys()].filter((id) => indeg.get(id) > 0);
  return { order, stuck };
}

// Split the stuck activities into loops (strongly connected components with
// more than one member, or a self-link) for the report.
function findLoops(model, ids) {
  const set = new Set(ids);
  let index = 0;
  const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = [];
  function strong(v) {
    // iterative Tarjan
    const work = [[v, 0]];
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    while (work.length) {
      const top = work[work.length - 1];
      const [u, i] = top;
      const succs = model.tasks.get(u).succs.filter((r) => set.has(r.succId));
      if (i < succs.length) {
        top[1]++;
        const w = succs[i].succId;
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++; stack.push(w); on.add(w);
          work.push([w, 0]);
        } else if (on.has(w)) low.set(u, Math.min(low.get(u), idx.get(w)));
      } else {
        work.pop();
        if (work.length) {
          const p = work[work.length - 1][0];
          low.set(p, Math.min(low.get(p), low.get(u)));
        }
        if (low.get(u) === idx.get(u)) {
          const comp = [];
          let w;
          do { w = stack.pop(); on.delete(w); comp.push(w); } while (w !== u);
          const self = comp.length === 1 && model.tasks.get(u).succs.some((r) => r.succId === u);
          if (comp.length > 1 || self) out.push(comp);
        }
      }
    }
  }
  for (const v of ids) if (!idx.has(v)) strong(v);
  return out;
}

export function schedule(xer, options = {}) {
  const model = options.model || buildModel(xer);
  const { tasks } = model;
  // per-run copy: a what-if run (options.delay) must not move the base finish
  const projects = new Map([...model.projects].map(([k, v]) => [k, { ...v }]));
  const inNet = (t) => !t.span;
  const { order, stuck } = topoOrder(model, inNet);
  const loops = stuck.length ? findLoops(model, stuck) : [];
  const res = new Map();
  const proj = (t) => projects.get(t.proj) || { dataDate: model.anchor ?? null, retainedLogic: true, progressOverride: false, floatType: "FT_FF" };
  const done = (t) => t.status === "TK_Complete";
  const active = (t) => t.status === "TK_Active";
  const V = { doneNode: true, ssFromRem: false, activeSSRem: true, bwActiveSS: "rem", lagFromDone: false, ssActivePred: "maxleft", ssDoneNode: true, bwSSActivePred: "rem", bwDoneNode: true, bwDoneSS: "nolag", bwDoneFS: "nolag", bwDoneSuccLag: ["PR_FS"], bwRsrcRemain: "zero", bwDoneSSLeft: true, alapActive: true, activeSSLeft: "future", ffOpenEnd: "early", ffDoneSucc: true, ffSSActivePred: true, ffFloor: true, ...(options.variant || {}) };
  const delay = options.delay || null; // { taskId, minutes }: added remaining duration (critical path test)
  // options.durations: Map(task id -> remaining minutes) in place of the file's
  // (risk.mjs's sampled durations); options.forwardOnly: stop after the
  // forward pass and the project finish (early dates only, ~half the time)
  const durs = options.durations || null;
  const remainOf = (t) => (durs && durs.has(t.id) ? durs.get(t.id) : t.remain);
  // options.levelStart: Map(task id -> minute) a not-started activity may not
  // start before (level.mjs's resource-levelled starts; like a start-on-or-
  // after constraint, so logic, calendars and other constraints still apply)
  const levelStart = options.levelStart || null;

  // ---- forward pass
  for (const id of order) {
    const t = tasks.get(id);
    const p = proj(t);
    const cal = t.cal;
    const remain = remainOf(t) + (delay && delay.taskId === id ? delay.minutes : 0);
    const dd = p.dataDate ?? -Infinity;
    const starts = [dd];
    if (!active(t) && p.plannedStart !== null && p.plannedStart !== undefined) starts.push(p.plannedStart);
    const fins = [];
    const ignorePreds = active(t) && p.progressOverride;
    if (!ignorePreds) for (const r of t.preds) {
      const pr = tasks.get(r.predId);
      if (pr.span) continue;
      const pv = res.get(r.predId);
      if (!pv) continue; // predecessor on a loop
      if ((active(t) || done(t)) && (r.type === "PR_SS" || r.type === "PR_SF")) {
        // Started: the start link is met, but with retained logic the rest of
        // the work waits for an unfinished predecessor's remaining work to
        // start (an in-progress predecessor's lag is already spent; a not-started one's still runs).
        if (V.ssDoneNode && r.type === "PR_SS" && pv.done) starts.push(pv.ef);
        if (V.activeSSRem && r.type === "PR_SS" && !pv.done) {
          const pr2 = tasks.get(r.predId);
          starts.push(active(pr2) ? pv.remES : lagCalendar(model, r).addWork(pv.remES, r.lag));
          // a started predecessor's lag is spent only as far as the data
          // date: one whose actual start is later (CCA GV10GL10904R2) still
          // has lag to run, from where its remaining work starts
          if (V.activeSSLeft && active(pr2) && r.lag && p.dataDate !== null && p.dataDate !== undefined) {
            const lc = lagCalendar(model, r);
            const as = pr2.actStart ?? dd;
            const left = r.lag - (as < dd ? lc.workBetween(as, dd) : 0);
            if (left > 0 && (V.activeSSLeft === "all" || as > dd)) starts.push(lc.addWork(pv.remES, left));
          }
        }
        continue;
      }
      if (pv.done) {
        // A finished predecessor passes on its node (past the data date only
        // where unfinished work pushed it) and, to an unfinished successor,
        // its lag counted from the actual dates (a cure time still runs).
        const lc0 = lagCalendar(model, r);
        const aS = tasks.get(r.predId).actStart, aF = tasks.get(r.predId).actEnd;
        if (r.type === "PR_FS" || r.type === "PR_FF") {
          const list = r.type === "PR_FS" ? starts : fins;
          list.push(pv.ef);
          if (!done(t) && aF !== null && r.lag) list.push(lc0.addWork(aF, r.lag));
        } else {
          if (r.type === "PR_SS" && V.ssDoneNode) starts.push(pv.ef);
          if (!done(t) && aS !== null && r.lag) (r.type === "PR_SS" ? starts : fins).push(lc0.addWork(aS, r.lag));
        }
        continue;
      }
      const lc = lagCalendar(model, r);
      // an in-progress predecessor's start, for SS/SF links, is where its
      // remaining work starts (P6 "lag from early start")
      const pS = V.ssFromRem ? pv.remES : pv.es;
      const pF = pv.ef;
      if (r.type === "PR_FS") starts.push(lc.addWork(pF, r.lag));
      else if (r.type === "PR_SS" && active(tasks.get(r.predId)) && V.ssActivePred !== "es") {
        if (V.ssActivePred === "rem") starts.push(pv.remES);
        else {
          starts.push(Math.max(pv.remES, lc.addWork(pS, r.lag)));
          // the part of the lag not yet spent at the data date still runs,
          // from where the predecessor's remaining work starts
          if (V.ssActivePred === "maxleft" && r.lag && p.dataDate !== null) {
            const left = r.lag - lc.workBetween(tasks.get(r.predId).actStart ?? dd, dd);
            if (left > 0) starts.push(lc.addWork(pv.remES, left));
          }
        }
      }
      else if (r.type === "PR_SS") starts.push(lc.addWork(pS, r.lag));
      else if (r.type === "PR_FF") fins.push(lc.addWork(pF, r.lag));
      else if (r.type === "PR_SF") fins.push(lc.addWork(pS, r.lag));
    }
    if (t.extES !== null) starts.push(t.extES);
    if (levelStart && !active(t) && !done(t) && levelStart.has(id)) starts.push(levelStart.get(id));
    let mandStart = null, mandFin = null;
    if (!active(t)) for (const c of t.cstr) {
      if (c.date === null) continue;
      if (c.type === "CS_MSOA" || c.type === "CS_MSO") starts.push(c.date);
      else if (c.type === "CS_MEOA" || c.type === "CS_MEO") fins.push(c.date);
      else if (c.type === "CS_MANDSTART") mandStart = c.date;
      else if (c.type === "CS_MANDFIN") mandFin = c.date;
    }
    let es, ef;
    const sMax = Math.max(...starts);
    const fMax = fins.length ? Math.max(...fins) : -Infinity;
    if (done(t)) {
      // A completed activity stays in the network as a zero-length node at
      // the data date (or later, when unfinished predecessors push it), so
      // logic still flows through it to its successors, as in P6.
      const v = Math.max(sMax, fMax);
      res.set(id, { es: t.actStart, ef: V.doneNode ? v : t.actEnd, remES: V.doneNode ? v : t.actStart, done: true });
      continue;
    }
    if (t.type === "TT_FinMile") {
      let v = Math.max(sMax, fMax);
      if (mandFin !== null) v = mandFin;
      es = ef = finishSnap(cal, v);
    } else if (t.type === "TT_Mile" || remain === 0) {
      let v = Math.max(sMax, fMax);
      if (mandStart !== null) v = mandStart;
      es = ef = cal.nextStart(v);
    } else {
      es = cal.nextStart(mandStart ?? sMax);
      ef = cal.addWork(es, remain);
      if (mandFin !== null) {
        ef = mandFin;
        es = cal.subWork(ef, remain);
      } else if (fMax > ef) {
        ef = finishSnap(cal, fMax);
        es = cal.subWork(ef, remain);
      }
    }
    const r = { es, ef, remES: es };
    if (active(t)) r.es = t.actStart ?? es; // the activity's start is its actual start
    res.set(id, r);
  }

  // ---- project finish
  for (const p of projects.values()) p.finish = -Infinity;
  for (const id of order) {
    const t = tasks.get(id);
    const p = projects.get(t.proj);
    if (p && !done(t)) p.finish = Math.max(p.finish, res.get(id).ef);
  }
  for (const p of projects.values()) {
    if (p.finish === -Infinity) p.finish = null;
    p.lateEnd = p.mustFinish !== null && p.useProjectEndForFloat ? p.mustFinish : p.finish;
  }
  if (options.forwardOnly) return { model, tasks: res, projects, loops, order, warnings: model.warnings };

  // ---- backward pass
  for (let k = order.length - 1; k >= 0; k--) {
    const id = order[k];
    const t = tasks.get(id);
    const r = res.get(id);
    if (done(t) && !V.bwDoneNode) continue;
    const p = proj(t);
    const cal = t.cal;
    let remain = remainOf(t) + (delay && delay.taskId === id ? delay.minutes : 0);
    if (V.bwRsrcRemain && t.rsrcRemain && (V.bwRsrcRemain === "all" || (t.remain === 0 && active(t))) && t.rsrcRemain > remain) remain = t.rsrcRemain;
    const fins = [];
    const starts = [];
    if (p.lateEnd !== null && p.lateEnd !== undefined) fins.push(p.lateEnd);
    for (const rel of t.succs) {
      const s = tasks.get(rel.succId);
      if (s.span) continue;
      const sv = res.get(rel.succId);
      if (!sv || sv.lf === undefined) continue;
      if (done(s)) {
        if (!V.bwDoneNode) continue;
        // mirror of the forward node: a finished successor's late date
        // bounds this one, with no lag (its lag was spent)
        // An open predecessor's lag does reach the node (the forward pass
        // pushes it by pred + lag), so the backward mirror takes it off.
        const lagd = V.bwDoneSuccLag && !done(t) ? lagCalendar(model, rel) : null;
        const back = (v, types) => lagd && rel.lag && (types.includes(rel.type) || (rel.type === "PR_SS" && active(t) && V.bwDoneSuccLagSSActive)) ? lagd.subWork(v, rel.lag) : v;
        if (rel.type === "PR_FS") fins.push(back(sv.remLS, V.bwDoneSuccLag));
        else if (rel.type === "PR_SS") {
          starts.push(back(sv.remLS, V.bwDoneSuccLag));
          // mirror of rule "maxleft": a started predecessor's SS lag not yet
          // spent at the data date still runs, so its remaining work starts
          // that much before the finished node's late date
          if (V.bwDoneSSLeft && active(t) && rel.lag && p.dataDate !== null && p.dataDate !== undefined) {
            const lc = lagCalendar(model, rel);
            const left = rel.lag - lc.workBetween(t.actStart ?? p.dataDate, p.dataDate);
            if (left > 0) starts.push(lc.subWork(sv.remLS, left));
          }
        }
        else if (rel.type === "PR_FF") fins.push(back(sv.lf, V.bwDoneSuccLag));
        continue;
      }
      if (active(s)) {
        if (proj(s).progressOverride) continue;
        if (rel.type === "PR_SF") continue;
        if (rel.type === "PR_SS") {
          // mirror of the forward rule: the remaining work of a started
          // successor waits on this one's start
          const b = V.bwActiveSS;
          if (b === "rem") starts.push(active(t) || done(t) ? sv.remLS : lagCalendar(model, rel).subWork(sv.remLS, rel.lag));
          else if (b === "remnolag") starts.push(sv.remLS);
          else if (b === "lf") fins.push(sv.lf);
          continue;
        }
      }
      const lc = lagCalendar(model, rel);
      if (rel.type === "PR_FS" && V.bwDoneFS && done(t)) fins.push(V.bwDoneFS === "nolag" ? sv.remLS : lc.subWork(sv.remLS, rel.lag));
      else if (rel.type === "PR_FS") fins.push(lc.subWork(sv.remLS, rel.lag));
      else if (rel.type === "PR_SS" && V.bwDoneSS && done(t)) starts.push(V.bwDoneSS === "nolag" ? sv.remLS : Math.min(sv.remLS, lc.subWork(sv.remLS, rel.lag)));
      else if (rel.type === "PR_SS" && V.bwSSActivePred && active(t)) starts.push(V.bwSSActivePred === "rem" ? sv.remLS : Math.min(sv.remLS, lc.subWork(sv.remLS, rel.lag)));
      else if (rel.type === "PR_SS") starts.push(lc.subWork(sv.remLS, rel.lag));
      else if (rel.type === "PR_FF" && V.bwDoneFS && done(t)) fins.push(V.bwDoneFS === "nolag" ? sv.lf : lc.subWork(sv.lf, rel.lag));
      else if (rel.type === "PR_FF") fins.push(lc.subWork(sv.lf, rel.lag));
      else if (rel.type === "PR_SF" && V.bwDoneFS && done(t)) starts.push(V.bwDoneFS === "nolag" ? sv.lf : lc.subWork(sv.lf, rel.lag));
      else if (rel.type === "PR_SF") starts.push(lc.subWork(sv.lf, rel.lag));
    }
    if (done(t)) {
      // a finished activity is a zero-length node in the backward pass too
      const v = Math.min(fins.length ? Math.min(...fins) : Infinity, starts.length ? Math.min(...starts) : Infinity);
      r.lf = r.remLS = r.ls = Number.isFinite(v) ? v : r.ef;
      continue;
    }
    if (t.extLF !== null) fins.push(t.extLF);
    let mandStart = null, mandFin = null;
    if (!active(t)) for (const c of t.cstr) {
      if (c.date === null) continue;
      if (c.type === "CS_MSOB" || c.type === "CS_MSO") starts.push(c.date);
      else if (c.type === "CS_MEOB" || c.type === "CS_MEO") fins.push(c.date);
      else if (c.type === "CS_MANDSTART") mandStart = c.date;
      else if (c.type === "CS_MANDFIN") mandFin = c.date;
    }
    const fMin = fins.length ? Math.min(...fins) : Infinity;
    const sMin = starts.length ? Math.min(...starts) : Infinity;
    let ls, lf;
    if (t.type === "TT_FinMile") {
      let v = Math.min(fMin, sMin);
      if (mandFin !== null) v = mandFin;
      if (!Number.isFinite(v)) v = r.ef;
      ls = lf = cal.prevEnd(v);
    } else if (t.type === "TT_Mile" || remain === 0) {
      let v = Math.min(fMin, sMin);
      if (mandStart !== null) v = mandStart;
      if (!Number.isFinite(v)) v = r.ef;
      // a start milestone may sit at a period's start; a zero-length task
      // finishes, so it snaps back to a period's end
      ls = lf = t.type === "TT_Mile" ? startSnapBack(cal, v) : cal.prevEnd(v);
    } else {
      lf = Number.isFinite(fMin) ? cal.prevEnd(fMin) : r.ef;
      if (mandFin !== null) lf = mandFin;
      if (mandStart !== null) lf = cal.addWork(cal.nextStart(mandStart), remain);
      else if (Number.isFinite(sMin)) {
        const viaStart = cal.addWork(startSnapBack(cal, sMin), remain);
        if (viaStart < lf) lf = viaStart;
      }
      ls = cal.subWork(lf, remain);
      // a late start at a period's end is the next period's start
      ls = cal.nextStart(ls);
    }
    r.lf = lf;
    r.remLS = ls;
    r.ls = active(t) ? ls : ls;
    // total float, in hours on the activity's calendar
    const finF = cal.workBetween(r.ef, lf);
    const startF = cal.workBetween(r.remES, ls);
    const ft = p.floatType;
    r.tf = (ft === "FT_SF" ? startF : ft === "FT_FF" ? finF : Math.min(startF, finF)) / 60;
  }

  // ---- free float: the working time this activity can slip before it
  // delays any successor's early dates (FS: successor early start - lag -
  // early finish, and so on), measured the way the forward pass links them.
  const freeFloat = (t, r) => {
    let best = Infinity;
    for (const rel of t.succs) {
      const s = tasks.get(rel.succId);
      if (s.span) continue;
      const sv = res.get(rel.succId);
      if (!sv) continue;
      if (done(s) && !V.ffDoneSucc) continue;
      const lc = lagCalendar(model, rel);
      let gap;
      if (done(s)) {
        // a finished successor is a zero-length node, reached with no lag:
        // this one may slip until it would push that node
        gap = rel.type === "PR_SF" ? Infinity
          : t.cal.workBetween(rel.type === "PR_SS" ? r.remES : r.ef, sv.ef);
      } else if (active(s) && (rel.type === "PR_SS" || rel.type === "PR_SF")) {
        // mirror of the forward rule for a started successor: an SF link is
        // met, and an SS link waits only for this one's remaining work to
        // start (its lag already spent once this one has started)
        if (rel.type === "PR_SF") continue;
        gap = t.cal.workBetween(r.remES, active(t) ? sv.remES : lc.subWork(sv.remES, rel.lag));
      } else if (rel.type === "PR_SS" && active(t) && V.ffSSActivePred) {
        // a started predecessor: the successor waits for the later of this
        // one's remaining start and its actual start plus the lag (forward
        // rule "maxleft"), so the lag already spent is not free float
        const p = proj(t);
        let v = Math.max(r.remES, lc.addWork(t.actStart ?? r.remES, rel.lag));
        if (rel.lag && p.dataDate !== null && p.dataDate !== undefined) {
          const left = rel.lag - lc.workBetween(t.actStart ?? p.dataDate, p.dataDate);
          if (left > 0) v = Math.max(v, lc.addWork(r.remES, left));
        }
        gap = t.cal.workBetween(v, sv.remES);
      } else if (rel.type === "PR_FS") gap = t.cal.workBetween(r.ef, lc.subWork(sv.remES, rel.lag));
      else if (rel.type === "PR_SS") gap = t.cal.workBetween(r.remES, lc.subWork(sv.remES, rel.lag));
      else if (rel.type === "PR_FF") gap = t.cal.workBetween(r.ef, lc.subWork(sv.ef, rel.lag));
      else gap = t.cal.workBetween(r.remES, lc.subWork(sv.ef, rel.lag));
      best = Math.min(best, gap);
    }
    if (best === Infinity) {
      const p = proj(t);
      // an open end's free float runs to the project's early finish, not
      // to a must-finish date (P6: 24.12 file, 34 open ends)
      const end = V.ffOpenEnd === "late" ? p.lateEnd : p.finish;
      best = end !== null && end !== undefined ? t.cal.workBetween(r.ef, end) : 0;
    }
    // P6's free float is the plain gap, not capped at a negative total
    // float, and never below zero (none of 20,127 stored values is)
    return (V.ffFloor ? Math.max(0, best) : best) / 60;
  };

  // ---- as late as possible (started activities too: their remaining work
  // moves, CCA UP3S305509C0): the early dates take up the free float, so the
  // activity finishes just in time for its successors (its total float
  // shrinks by the same amount and its free float becomes zero). Done from
  // the last activity back, so a chain of ALAP activities moves together.
  for (let k = order.length - 1; k >= 0; k--) {
    const id = order[k];
    const t = tasks.get(id);
    const r = res.get(id);
    if (done(t) || (active(t) && !V.alapActive) || r.lf === undefined) continue;
    if (!t.cstr.some((c) => c.type === "CS_ALAP")) continue;
    const ff = freeFloat(t, r);
    if (ff <= 0) continue;
    const shift = Math.round(ff * 60);
    if (t.type === "TT_FinMile" || t.type === "TT_Mile" || remainOf(t) === 0) {
      r.es = r.remES = r.ef = t.cal.addWork(r.ef, shift);
    } else {
      r.ef = t.cal.addWork(r.ef, shift);
      r.es = r.remES = t.cal.nextStart(t.cal.subWork(r.ef, remainOf(t)));
    }
    // a started activity's remaining work moves; its start stays the actual start
    if (active(t)) r.es = t.actStart ?? r.es;
    r.tf -= ff;
  }

  for (const id of order) {
    const t = tasks.get(id);
    const r = res.get(id);
    if (done(t) || r.lf === undefined) continue;
    r.ff = freeFloat(t, r);
  }

  return { model, tasks: res, projects, loops, order, warnings: model.warnings };
}

// The longest path: from the activity that finishes the project, walk back
// through the predecessors that drive each activity's early dates (the
// relationship with zero gap). Returns task ids from first to last.
export function drivingPath(result, projId) {
  const { model, tasks: res } = result;
  const p = result.projects.get(projId);
  if (!p || p.finish === null) return [];
  let last = null;
  for (const t of model.tasks.values()) {
    if (t.proj !== projId || t.span || t.status === "TK_Complete") continue;
    const r = res.get(t.id);
    if (r && r.ef === p.finish && (!last || t.succs.length === 0)) last = t;
  }
  const path = [];
  const seen = new Set();
  let cur = last;
  while (cur && !seen.has(cur.id)) {
    path.push(cur.id);
    seen.add(cur.id);
    const r = res.get(cur.id);
    let next = null;
    for (const rel of cur.preds) {
      const pr = model.tasks.get(rel.predId);
      if (pr.span || pr.status === "TK_Complete") continue;
      const pv = res.get(rel.predId);
      if (!pv) continue;
      const lc = lagCalendar(model, rel);
      const from = rel.type === "PR_FS" || rel.type === "PR_FF" ? pv.ef : pv.remES ?? pv.es;
      const target = rel.type === "PR_FS" || rel.type === "PR_SS" ? r.remES : r.ef;
      const reach = lc.addWork(from, rel.lag);
      if (cur.cal.workBetween(reach, target) === 0) { next = pr; break; }
    }
    cur = next;
  }
  return path.reverse();
}
