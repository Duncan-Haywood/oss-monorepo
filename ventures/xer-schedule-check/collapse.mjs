// Collapsed as-built ("but-for") delay analysis: the retrospective method of
// AACE International Recommended Practice 29R-03, MIP 3.8 (modelled /
// subtractive / single simulation) and MIP 3.9 (the same, one delay group at
// a time). Where a time impact analysis (tia.mjs) adds a delay to the
// schedule in force before it happened, this works backwards from what did
// happen: it builds a CPM model that reproduces the as-built dates, takes the
// delays out, and recomputes. The earlier finish is the date the project
// would have finished "but for" those delays.
//
// 1. The as-built model. Every activity of the project gets the duration it
//    actually took (actual start to actual finish, working time on its own
//    calendar; for work still open, its actual or forecast start to its
//    forecast finish from the file's own schedule run). Every relationship
//    keeps its type. Where an activity started later than its logic needed,
//    the extra waiting time (the "as-built gap", time the logic does not
//    explain) is added to every lag into it, so the predecessor that drove
//    it stays tight and the others keep their slack; where it started
//    earlier than its logic allowed (out of sequence), the driving lag is
//    shortened to fit. An activity with no predecessor gets a start-on-or-
//    after constraint at its actual start. Constraints, expected finish
//    dates and progress are removed: the model starts at the project's first
//    actual start with nothing done. Scheduled by the same engine that
//    matches P6's dates on 19,820 of 19,822 activities, it lands every
//    activity on its as-built dates; how many it does is reported, since the
//    subtraction means nothing on a model that does not.
//
// 2. The delays. A small table names what to take out:
//      activity ID   an activity of the schedule
//      days          working days to take out of it; blank takes the whole
//                    activity (its duration becomes 0)
//      what          "activity" (default) or "gap": take the days out of the
//                    as-built gap before the activity (a wait for a permit,
//                    an approval, a crew) instead of its duration
//      party         who is responsible (owner, contractor, ...) (optional)
//      event         a name grouping rows into one delay event (optional)
//
// 3. The collapse. The model is recomputed with all the delays out, with
//    each party's delays out, and with each event's delays out. Each run
//    reports how much earlier the finish is, in working days of the project
//    calendar: the delay "but for" which the project would have finished
//    then. A party's collapse answers "when would the job have finished had
//    this party caused no delay": owner delays collapsed give the
//    contractor's own completion date, contractor delays collapsed the
//    owner's. When the parties alone add up to more than all together, the
//    difference is delay both caused at once (concurrent).
//
// collapsedAsBuilt(xer, delays, { projId }) -> { project, asBuilt: { start,
//   finish, modelFinish, activities, reproduced, gaps, outOfSequence,
//   drivingPath }, all, byParty, byEvent, rows, overlapDays, warnings,
//   asBuiltXer, collapsedXer }
//
// asBuiltXer (the model) and collapsedXer (all delays out) are XERs that P6
// opens and schedules, so the dates can be checked there before anyone
// relies on them. It measures; it does not decide who caused a delay or what
// the contract allows for it.

import { schedule, buildModel, drivingPath, lagCalendar } from "./cpm.mjs";
import { pickProject } from "./compare.mjs";
import { splitRows } from "./constraints.mjs";
import { formatDate } from "./xer.mjs";
import { cloneXer } from "./status.mjs";

const r1 = (x) => Math.round(x * 10) / 10;
const START_HOLDS = new Set(["CS_MSO", "CS_MSOA", "CS_MANDSTART"]);
const hrs = (m) => String(Math.round((m / 60) * 1000) / 1000);

const COLUMNS = {
  code: /^(activity( id| code)?|task( id| code)?|id|code)$/,
  days: /^(days|duration|working days|days out|remove|delay( days)?)$/,
  what: /^(what|kind|type|remove from|from)$/,
  party: /^(party|responsible|responsibility|cause|caused by|by|owner\/contractor)$/,
  event: /^(event|delay event|issue|name)$/,
};

export function parseDelays(text) {
  const rows = splitRows(text);
  const warnings = [];
  if (!rows.length) return { rows: [], warnings: ["the delay list is empty"] };
  const head = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const col = {};
  for (const [k, re] of Object.entries(COLUMNS)) col[k] = head.findIndex((h) => re.test(h));
  let body = rows.slice(1);
  if (col.code < 0) {
    // no header: activity IDs one per line (or ID, days)
    col.code = 0; col.days = rows[0].length > 1 ? 1 : -1; body = rows;
  }
  const out = [];
  body.forEach((r, i) => {
    const code = (r[col.code] || "").trim();
    if (!code) return;
    const rawDays = col.days >= 0 ? (r[col.days] || "").trim() : "";
    let days = null;
    if (rawDays !== "") {
      const d = Number(rawDays.replace(/^[-+]/, "").replace(/\s*d(ays?)?$/i, ""));
      if (!Number.isFinite(d) || d < 0) { warnings.push(`row ${i + 2}: "${rawDays}" is not a number of days; the whole of ${code} is taken out`); }
      else days = d;
    }
    const w = col.what >= 0 ? (r[col.what] || "").toLowerCase() : "";
    const what = /gap|wait|before|lag/.test(w) ? "gap" : "activity";
    out.push({ row: col.code === 0 && body === rows ? i + 1 : i + 2, code, days, what, party: col.party >= 0 ? (r[col.party] || "").trim() : "", event: col.event >= 0 ? (r[col.event] || "").trim() : "" });
  });
  return { rows: out, warnings };
}

// The as-built model: tables of a not-started schedule whose forward pass
// lands every activity on its as-built dates.
export function asBuiltModel(xer, { projId = null } = {}) {
  const run = schedule(xer, { expectedFinish: true });
  const model = run.model;
  const p = pickProject(xer, model, projId);
  if (!p) throw new Error("no project in the file");
  const warnings = [];
  const inProj = (t) => t && t.proj === p.id && !t.span;
  const when = new Map(); // task_id -> { s, f, actual }
  let open = 0;
  for (const t of model.tasks.values()) {
    if (!inProj(t)) continue;
    const r = run.tasks.get(t.id);
    let s = t.actStart, f = t.actEnd;
    const actual = Number.isFinite(s) && Number.isFinite(f);
    if (!Number.isFinite(s)) s = r ? (r.remES ?? r.es) : null;
    if (!Number.isFinite(f)) f = r ? r.ef : null;
    if (!Number.isFinite(s) || !Number.isFinite(f)) continue;
    if (f < s) f = s;
    if (!actual) open++;
    when.set(t.id, { s, f, actual });
  }
  if (!when.size) throw new Error("the project has no activities with dates");
  if (open) warnings.push(`${open} ${open === 1 ? "activity is" : "activities are"} not finished, so ${open === 1 ? "its" : "their"} forecast dates from the file's own schedule run stand in for as-built dates; a collapsed as-built is normally run on the final update`);
  let start = Infinity, finish = -Infinity;
  for (const w of when.values()) { start = Math.min(start, w.s); finish = Math.max(finish, w.f); }

  const x = cloneXer(xer);
  const proj = (x.tables.PROJECT || []).find((r) => r.proj_id === p.id);
  if (proj) {
    proj.last_recalc_date = formatDate(start);
    proj.plan_start_date = formatDate(start);
    // a must-finish date would only change late dates; drop it so float in
    // the model is measured to the as-built finish
    proj.plan_end_date = "";
    proj.scd_end_date = "";
  }
  for (const o of x.tables.SCHEDOPTIONS || []) if (o.proj_id === p.id) { o.sched_use_expect_end_flag = "N"; }
  const rowOf = new Map((x.tables.TASK || []).map((r) => [r.task_id, r]));
  const durOf = new Map();
  // as late as possible: placed by its successors, not its predecessors (P6
  // puts it at its late dates), so the model keeps the constraint and adds no
  // as-built gap before it; moving its successors earlier moves it too
  const alap = new Set();
  for (const id of when.keys()) { const t = model.tasks.get(id); if (t.cstr.some((c) => c.type === "CS_ALAP")) alap.add(id); }
  for (const [id, w] of when) {
    const t = model.tasks.get(id), row = rowOf.get(id);
    const isMile = t.type === "TT_Mile" || t.type === "TT_FinMile";
    const d = isMile ? 0 : Math.max(0, t.cal.workBetween(w.s, w.f));
    durOf.set(id, d);
    Object.assign(row, {
      status_code: "TK_NotStart", act_start_date: "", act_end_date: "", restart_date: "", reend_date: "",
      remain_drtn_hr_cnt: hrs(d), target_drtn_hr_cnt: hrs(d), phys_complete_pct: "0",
      cstr_type: "", cstr_date: "", cstr_type2: "", cstr_date2: "", expect_end_date: "",
      external_early_start_date: "", external_late_end_date: "",
    });
    if (alap.has(id)) row.cstr_type = "CS_ALAP";
  }
  // relationships: the as-built gap of each successor, added to its lags
  const relRow = new Map((x.tables.TASKPRED || []).map((r) => [r.task_pred_id, r]));
  const gaps = [];
  let outOfSequence = 0;
  const noPred = [];
  const pinned = new Map(); // task_id -> wait over its logic, held by its constraint date
  const finishHeld = [];
  const relInfo = new Map(); // succ task_id -> [{ rel, row, lagCal, gap, lag }]
  // where the forward pass has each activity: its as-built dates, except an
  // as-late-as-possible one, whose successors are scheduled from its early
  // dates (before it is slid late), worked out here in logic order
  const fwd = new Map();
  const inOrder = new Set(run.order || []);
  const seq = [...(run.order || []).filter((id) => when.has(id)), ...[...when.keys()].filter((id) => !inOrder.has(id))];
  for (const id of seq) {
    const w = when.get(id);
    const t = model.tasks.get(id);
    const ins = [];
    for (const rel of t.preds) {
      const pr = model.tasks.get(rel.predId);
      if (!inProj(pr) || !when.has(pr.id)) continue;
      const pw = fwd.get(pr.id) || when.get(pr.id);
      const lc = lagCalendar(model, rel);
      const from = rel.type === "PR_FS" || rel.type === "PR_FF" ? pw.f : pw.s;
      const to = rel.type === "PR_FS" || rel.type === "PR_SS" ? w.s : w.f;
      let gap = lc.workBetween(from, to);
      if ((rel.type === "PR_FS" || rel.type === "PR_SS") && gap > rel.lag) {
        // the smallest lag that still lands the start where it was: lag time
        // the successor's calendar cannot work (a Saturday between a
        // six-day predecessor and a Sunday-to-Thursday successor) snaps
        // forward to its next working start anyway, so it is no wait
        const x0 = lc.addWork(from, rel.lag);
        const snap = t.cal.nextStart(x0);
        if (snap >= to) gap = rel.lag;
        else { const T = t.cal.prevEnd(to); if (T > x0) gap = rel.lag + lc.workBetween(x0, T); }
      }
      ins.push({ rel, row: relRow.get(rel.id), lc, gap, lag: rel.lag });
    }
    if (!ins.length) {
      if (w.s > start && !alap.has(id)) noPred.push(id);
      fwd.set(id, alap.has(id) ? { s: start, f: t.cal.addWork(t.cal.nextStart(start), durOf.get(id)) } : w);
      continue;
    }
    let extra = Math.min(...ins.map((i) => i.gap - i.lag));
    if (alap.has(id) && extra > 0) extra = 0;
    relInfo.set(id, { ins, extra });
    if (extra < 0) outOfSequence++;
    if (alap.has(id)) {
      // its early dates: the latest its links allow, with the model's lags
      let es = t.cal.nextStart(start);
      const d = durOf.get(id);
      for (const i of ins) {
        const pw = fwd.get(i.rel.predId) || when.get(i.rel.predId);
        const from = i.rel.type === "PR_FS" || i.rel.type === "PR_FF" ? pw.f : pw.s;
        const at = i.lc.addWork(from, i.lag + extra);
        const s0 = i.rel.type === "PR_FS" || i.rel.type === "PR_SS" ? t.cal.nextStart(at) : t.cal.nextStart(t.cal.subWork(at, d));
        if (s0 > es) es = s0;
      }
      fwd.set(id, { s: es, f: d ? t.cal.addWork(es, d) : es });
    } else fwd.set(id, w);
    // a finish held by a finish-to-finish (or start-to-finish) link: the
    // activity ran longer than planned because it could not finish before
    // that predecessor, so the wait is in its as-built duration. It keeps its
    // planned duration and the link holds the finish, as P6's forward pass
    // does; taking the delay out of the predecessor then frees it
    const d0 = durOf.get(id);
    // (only when a start link also holds its start, else the shorter
    // duration would let the start drift later than it was)
    const tightAt = (types) => ins.some((i) => types.includes(i.rel.type) && i.gap - i.lag - extra <= 0);
    if (t.orig > 0 && t.orig < d0 && tightAt(["PR_FF", "PR_SF"]) && tightAt(["PR_FS", "PR_SS"])) {
      durOf.set(id, t.orig);
      const row = rowOf.get(id);
      row.remain_drtn_hr_cnt = hrs(t.orig); row.target_drtn_hr_cnt = hrs(t.orig);
      finishHeld.push(id);
    }
    // a wait the file's own start constraint explains (an inspection booked
    // for a date, a site released on one): the date held it, not the time
    // since its predecessors, so the model keeps the date and the links
    // their own lags. Taking out work before it then frees nothing unless
    // the date goes too ("gap" moves the date back)
    const held = extra > 0 && !alap.has(id) && t.cstr.some((c) => START_HOLDS.has(c.type) && c.date !== null && Math.abs(t.cal.nextStart(c.date) - t.cal.nextStart(w.s)) <= 1);
    if (held) pinned.set(id, extra);
    for (const i of ins) if (i.row) i.row.lag_hr_cnt = hrs(i.lag + (held ? 0 : extra));
    const hpd = (t.cal.hoursPerDay || 8) * 60;
    const driver = ins.find((i) => i.gap - i.lag === extra) || ins[0];
    if (extra > 0) gaps.push({ id, code: t.code, name: t.name, days: r1(extra / hpd), after: model.tasks.get(driver.rel.predId)?.code ?? "", minutes: extra, constraint: t.cstr.map((c) => c.type.replace(/^CS_/, "")).join(" ") });
  }
  // a start date the file's own constraint set, on or before the actual
  // start, is kept as start-on-or-after: it did not hold the activity as
  // built, but with delays taken out before it, it would have (an
  // inspection booked for a date stays booked)
  let keptDates = 0;
  for (const [id, w] of when) {
    if (alap.has(id)) continue;
    const t = model.tasks.get(id);
    const c = t.cstr.find((c) => START_HOLDS.has(c.type) && c.date !== null && t.cal.nextStart(c.date) <= t.cal.nextStart(w.s) + 1);
    if (!c) continue;
    const row = rowOf.get(id);
    row.cstr_type = "CS_MSOA"; row.cstr_date = formatDate(c.date);
    keptDates++;
  }
  for (const id of [...noPred, ...pinned.keys()]) {
    const row = rowOf.get(id);
    row.cstr_type = "CS_MSOA"; row.cstr_date = formatDate(when.get(id).s);
  }
  if (keptDates) warnings.push(`${keptDates} start ${keptDates === 1 ? "date" : "dates"} set by the file's own constraints ${keptDates === 1 ? "is" : "are"} kept in the model as start-on-or-after, so taking delays out cannot move that work before ${keptDates === 1 ? "it" : "them"}`);
  const ab = schedule(x, { expectedFinish: false });
  // how many activities the model lands on their as-built dates (to the minute,
  // after snapping to working time on the activity's calendar)
  let reproduced = 0, total = 0;
  const misses = [];
  for (const [id, w] of when) {
    const t = model.tasks.get(id), r = ab.tasks.get(id);
    if (!r) continue;
    total++;
    // the same working instant: no working time between them on the
    // activity's calendar (a finish at 17:00 and the next midnight are one)
    const same = (a, b) => Math.abs(a - b) <= 1 || t.cal.workBetween(Math.min(a, b), Math.max(a, b)) === 0;
    const s1 = r.remES ?? r.es, f1 = r.ef;
    const sameStart = same(s1, w.s);
    const sameFin = same(f1, w.f);
    if (sameStart && sameFin) reproduced++;
    else misses.push({ code: t.code, start: formatDate(w.s), finish: formatDate(w.f), modelStart: formatDate(s1), modelFinish: formatDate(f1) });
  }
  if (ab.loops.length) warnings.push(`the schedule's logic has ${ab.loops.length} loop${ab.loops.length === 1 ? "" : "s"}; activities on ${ab.loops.length === 1 ? "it" : "them"} are left out of the model`);
  gaps.sort((a, b) => b.minutes - a.minutes);
  if (pinned.size) warnings.push(`${pinned.size} ${pinned.size === 1 ? "activity" : "activities"} waited for a start date set by ${pinned.size === 1 ? "its" : "their"} own constraint in the file (${[...pinned.keys()].slice(0, 5).map((i) => model.tasks.get(i).code).join(", ")}${pinned.size > 5 ? ` and ${pinned.size - 5} more` : ""}): the model keeps the date, so work taken out before ${pinned.size === 1 ? "it" : "them"} frees nothing past it; write "gap" on ${pinned.size === 1 ? "its" : "their"} row to move the date`);
  if (finishHeld.length) warnings.push(`${finishHeld.length} ${finishHeld.length === 1 ? "activity" : "activities"} ran longer than planned because a finish-to-finish link held ${finishHeld.length === 1 ? "its" : "their"} finish (${finishHeld.slice(0, 5).map((i) => model.tasks.get(i).code).join(", ")}${finishHeld.length > 5 ? ` and ${finishHeld.length - 5} more` : ""}): the model keeps ${finishHeld.length === 1 ? "its" : "their"} planned duration and lets the link hold the finish`);
  if (alap.size) warnings.push(`${alap.size} ${alap.size === 1 ? "activity is" : "activities are"} as late as possible in the file; the model keeps ${alap.size === 1 ? "it" : "them"} there, so ${alap.size === 1 ? "it moves" : "they move"} with ${alap.size === 1 ? "its" : "their"} successors rather than holding a gap`);
  return { p, model, run, when, durOf, relInfo, noPred, pinned, alap, finishHeld, x, ab, start, finish, reproduced, total, misses, gaps, outOfSequence, warnings };
}

// take a set of delay rows out of the as-built model's tables
function collapseXer(m, rows, warnings) {
  const x = cloneXer(m.x);
  const rowOf = new Map((x.tables.TASK || []).map((r) => [r.task_id, r]));
  const relRow = new Map((x.tables.TASKPRED || []).map((r) => [r.task_pred_id, r]));
  const byCode = new Map();
  for (const id of m.when.keys()) byCode.set(String(m.model.tasks.get(id).code), id);
  const taken = [];
  for (const d of rows) {
    const id = byCode.get(d.code);
    if (id === undefined) { warnings?.push(`row ${d.row}: activity ${d.code} is not in project ${m.p.code || m.p.id}; skipped`); continue; }
    const t = m.model.tasks.get(id);
    const hpd = (t.cal.hoursPerDay || 8) * 60;
    if (d.what === "gap") {
      const info = m.relInfo.get(id);
      if (m.noPred.includes(id)) {
        // no predecessor: the gap is from the project start to its constraint
        const row = rowOf.get(id);
        const have = t.cal.workBetween(m.start, m.when.get(id).s);
        const out = d.days === null ? have : Math.min(have, d.days * hpd);
        row.cstr_date = formatDate(t.cal.subWork(t.cal.nextStart(m.when.get(id).s), out));
        if (!out) row.cstr_type = "";
        taken.push({ ...d, minutes: out, of: have });
        continue;
      }
      if (m.pinned.has(id)) {
        // held by its own start constraint: move the date back
        const row = rowOf.get(id);
        const have = m.pinned.get(id);
        const out = d.days === null ? have : Math.min(have, d.days * hpd);
        if (d.days !== null && d.days * hpd > have + 1 && warnings) warnings.push(`row ${d.row}: the gap before ${d.code} is ${r1(have / hpd)} days, so ${r1(have / hpd)} were taken out, not ${d.days}`);
        row.cstr_date = formatDate(t.cal.subWork(t.cal.nextStart(m.when.get(id).s), out));
        taken.push({ ...d, minutes: out, of: have });
        continue;
      }
      const have = info ? Math.max(0, info.extra) : 0;
      if (!have) { warnings?.push(`row ${d.row}: ${d.code} has no as-built gap before it (it started as soon as its logic allowed), so nothing was taken out`); taken.push({ ...d, minutes: 0, of: 0 }); continue; }
      const out = d.days === null ? have : Math.min(have, d.days * hpd);
      if (d.days !== null && d.days * hpd > have + 1 && warnings) warnings.push(`row ${d.row}: the gap before ${d.code} is ${r1(have / hpd)} days, so ${r1(have / hpd)} were taken out, not ${d.days}`);
      for (const i of info.ins) {
        const rr = relRow.get(i.rel.id);
        if (rr) rr.lag_hr_cnt = hrs(Number(rr.lag_hr_cnt) * 60 - out);
      }
      taken.push({ ...d, minutes: out, of: have });
    } else {
      const row = rowOf.get(id);
      const have = Math.round(Number(row.remain_drtn_hr_cnt) * 60);
      if (!have && warnings) warnings.push(`row ${d.row}: ${d.code} has no duration in the as-built (a milestone, or done in no working time), so nothing was taken out; to remove a wait before it, write "gap"`);
      const out = d.days === null ? have : Math.min(have, d.days * hpd);
      if (d.days !== null && d.days * hpd > have + 1 && warnings) warnings.push(`row ${d.row}: ${d.code} took ${r1(have / hpd)} days as built, so ${r1(have / hpd)} were taken out, not ${d.days}`);
      row.remain_drtn_hr_cnt = hrs(have - out);
      row.target_drtn_hr_cnt = hrs(have - out);
      taken.push({ ...d, minutes: out, of: have });
    }
  }
  return { x, taken };
}

export function collapsedAsBuilt(xer, delays, { projId = null } = {}) {
  const parsed = typeof delays === "string" ? parseDelays(delays) : (delays || { rows: [], warnings: [] });
  const m = asBuiltModel(xer, { projId });
  const warnings = [...m.warnings, ...parsed.warnings];
  const p = m.p;
  const pcal = p.cal;
  const pday = (pcal.hoursPerDay || 8) * 60;
  const wd = (a, b) => (a === null || b === null || a === undefined || b === undefined ? null : r1((b >= a ? pcal.workBetween(a, b) : -pcal.workBetween(b, a)) / pday));
  const f0 = m.ab.projects.get(p.id)?.finish ?? null;
  if (f0 !== null && Math.abs(f0 - m.finish) > 1) warnings.push(`the as-built model finishes ${formatDate(f0)}, not on the last actual finish ${formatDate(m.finish)}; the collapse is measured from the model's finish`);
  if (m.reproduced < m.total) warnings.push(`the as-built model lands ${m.total - m.reproduced} of ${m.total} activities off their as-built dates (an actual date outside the activity's working time, or a finish-to-finish link that holds a finish later than its duration allows); they are listed`);

  const run = (rows, label, w) => {
    const c = collapseXer(m, rows, w);
    const r = schedule(c.x, { expectedFinish: false });
    const f1 = r.projects.get(p.id)?.finish ?? null;
    const loops = r.loops.length;
    return { label, finish: formatDate(f1), earlierDays: wd(f1, f0) ?? 0, taken: c.taken, res: r, x: c.x, loops };
  };
  const rows = parsed.rows;
  const all = run(rows, "all delays", warnings);
  // milestones in the all-out run
  const milestones = [];
  for (const [id, w] of m.when) {
    const t = m.model.tasks.get(id);
    if (t.type !== "TT_Mile" && t.type !== "TT_FinMile") continue;
    const a = m.ab.tasks.get(id), b = all.res.tasks.get(id);
    if (!a || !b) continue;
    const at0 = t.type === "TT_FinMile" ? a.ef : (a.remES ?? a.es), at1 = t.type === "TT_FinMile" ? b.ef : (b.remES ?? b.es);
    milestones.push({ code: t.code, name: t.name, asBuilt: formatDate(at0), butFor: formatDate(at1), earlierDays: wd(at1, at0) ?? 0 });
  }
  milestones.sort((a, b) => b.earlierDays - a.earlierDays || String(a.code).localeCompare(String(b.code)));
  const parties = [...new Set(rows.map((d) => d.party).filter(Boolean))];
  const byParty = parties.length > 1 || (parties.length === 1 && rows.some((d) => !d.party))
    ? parties.map((pt) => { const o = run(rows.filter((d) => d.party === pt), pt); return { party: pt, finish: o.finish, earlierDays: o.earlierDays, rows: o.taken.length }; })
    : [];
  const events = [...new Set(rows.map((d) => d.event || d.code))];
  const byEvent = events.length > 1
    ? events.map((e) => { const rs = rows.filter((d) => (d.event || d.code) === e); const o = run(rs, e); return { event: e, party: [...new Set(rs.map((d) => d.party).filter(Boolean))].join(", "), finish: o.finish, earlierDays: o.earlierDays }; }).sort((a, b) => b.earlierDays - a.earlierDays)
    : [];
  const sumParty = byParty.reduce((s, x) => s + x.earlierDays, 0);
  const abPath = drivingPath(m.ab, p.id);
  const pathSet = new Set(abPath);
  const codeOf = (id) => m.model.tasks.get(id)?.code ?? id;
  const byCode = new Map([...m.when.keys()].map((id) => [String(codeOf(id)), id]));
  const rowsOut = all.taken.map((d) => {
    const id = byCode.get(d.code), t = m.model.tasks.get(id);
    const hpd = (t?.cal.hoursPerDay || 8) * 60;
    return { code: d.code, name: t?.name ?? "", what: d.what, party: d.party, event: d.event, takenDays: r1(d.minutes / hpd), ofDays: r1(d.of / hpd), onAsBuiltPath: pathSet.has(id) };
  });
  return {
    project: { id: p.id, code: p.code },
    asBuilt: {
      start: formatDate(m.start),
      finish: formatDate(m.finish),
      modelFinish: formatDate(f0),
      activities: m.total,
      reproduced: m.reproduced,
      misses: m.misses,
      gaps: m.gaps.map((g) => ({ code: g.code, name: g.name, days: g.days, after: g.after, constraint: g.constraint, onPath: pathSet.has(g.id) })),
      outOfSequence: m.outOfSequence,
      drivingPath: abPath.map(codeOf),
    },
    all: { finish: all.finish, earlierDays: all.earlierDays, drivingPath: drivingPath(all.res, p.id).map(codeOf) },
    milestones,
    byParty,
    byEvent,
    // parties alone add up to more than together when their delays ran at
    // the same time on the same path (concurrent delay)
    concurrentDays: byParty.length > 1 ? r1(sumParty - all.earlierDays) : null,
    rows: rowsOut,
    warnings,
    asBuiltXer: m.x,
    collapsedXer: all.x,
  };
}

export function collapsedText(r, { limit = 12 } = {}) {
  const a = r.asBuilt;
  const L = [];
  L.push(`Collapsed as-built (AACE 29R-03 MIP 3.8/3.9), project ${r.project.code || r.project.id}`);
  L.push(`As built: ${a.start} to ${a.finish}; the model lands ${a.reproduced} of ${a.activities} activities on their as-built dates (model finish ${a.modelFinish})`);
  L.push(`As-built gaps (waits the logic does not explain): ${a.gaps.length}; out-of-sequence starts: ${a.outOfSequence}`);
  for (const g of a.gaps.slice(0, limit)) L.push(`  ${g.code}  ${g.days} d after ${g.after}${g.constraint ? ` (constraint ${g.constraint} in the file)` : ""}${g.onPath ? "  (as-built critical path)" : ""}  ${g.name}`);
  if (r.rows.length) {
    L.push(`All ${r.rows.length} delay rows out: finish ${r.all.finish}, ${r.all.earlierDays} working days earlier`);
    for (const p of r.byParty) L.push(`  but for ${p.party}: ${p.finish}, ${p.earlierDays} d earlier`);
    if (r.concurrentDays !== null) L.push(`  concurrent (parties alone minus all together): ${r.concurrentDays} d`);
    if (r.byEvent.length) { L.push("Each event alone:"); for (const e of r.byEvent.slice(0, limit)) L.push(`  ${e.event}${e.party ? ` (${e.party})` : ""}: ${e.earlierDays} d earlier`); }
    L.push("Rows:");
    for (const d of r.rows) L.push(`  ${d.code} ${d.what}: ${d.takenDays} of ${d.ofDays} d out${d.party ? `, ${d.party}` : ""}${d.onAsBuiltPath ? ", on the as-built critical path" : ""}`);
  } else L.push("No delay list given: the gaps above are where to look for delays to take out.");
  for (const w of r.warnings) L.push(`Note: ${w}`);
  return L.join("\n");
}

const csvCell = (v) => {
  let s = String(v ?? "");
  // a cell a spreadsheet would run as a formula (an activity name "=HYPERLINK(...)") is written as text
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function collapsedCsv(r) {
  const L = [["section", "id", "name", "party", "what", "days", "of days", "finish", "working days earlier", "on as-built critical path"].join(",")];
  L.push(["collapse", "all", "all delays", "", "", "", "", r.all.finish, r.all.earlierDays, ""].map(csvCell).join(","));
  for (const p of r.byParty) L.push(["party", p.party, `but for ${p.party}`, p.party, "", "", "", p.finish, p.earlierDays, ""].map(csvCell).join(","));
  for (const e of r.byEvent) L.push(["event", e.event, e.event, e.party, "", "", "", e.finish, e.earlierDays, ""].map(csvCell).join(","));
  for (const d of r.rows) L.push(["row", d.code, d.name, d.party, d.what, d.takenDays, d.ofDays, "", "", d.onAsBuiltPath ? "yes" : ""].map(csvCell).join(","));
  for (const g of r.asBuilt.gaps) L.push(["gap", g.code, g.name, "", `after ${g.after}`, g.days, "", "", "", g.onPath ? "yes" : ""].map(csvCell).join(","));
  for (const m of r.milestones) L.push(["milestone", m.code, m.name, "", "", "", "", m.butFor, m.earlierDays, ""].map(csvCell).join(","));
  return L.join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function collapsedTableHtml(r, { limit = 25 } = {}) {
  const a = r.asBuilt;
  const parts = [];
  parts.push(`<p><b>As built:</b> ${esc(a.start)} to ${esc(a.finish)}. The as-built model lands <b>${esc(a.reproduced)} of ${esc(a.activities)}</b> activities on their as-built dates (model finish ${esc(a.modelFinish)}); ${esc(a.gaps.length)} as-built gaps, ${esc(a.outOfSequence)} out-of-sequence starts.</p>`);
  if (r.rows.length) {
    parts.push(`<p><b>All delays out:</b> finish ${esc(r.all.finish)}, <b>${esc(r.all.earlierDays)} working days earlier</b>.</p>`);
    if (r.byParty.length) parts.push(`<table><thead><tr><th>But for</th><th>Finish</th><th class="n">Working days earlier</th></tr></thead><tbody>${r.byParty.map((p) => `<tr><td>${esc(p.party)}</td><td>${esc(p.finish)}</td><td class="n">${esc(p.earlierDays)}</td></tr>`).join("")}</tbody></table>${r.concurrentDays ? `<p class="note">The parties alone add up to ${esc(r.concurrentDays)} working days more than all together: delay both caused at the same time on the same path (concurrent).</p>` : ""}`);
    if (r.byEvent.length) parts.push(`<table><thead><tr><th>Event alone</th><th>Party</th><th>Finish</th><th class="n">Working days earlier</th></tr></thead><tbody>${r.byEvent.slice(0, limit).map((e) => `<tr><td>${esc(e.event)}</td><td>${esc(e.party)}</td><td>${esc(e.finish)}</td><td class="n">${esc(e.earlierDays)}</td></tr>`).join("")}</tbody></table>`);
    parts.push(`<table><thead><tr><th>Activity</th><th>Name</th><th>From</th><th>Party</th><th class="n">Days out</th><th class="n">Of</th><th>As-built critical</th></tr></thead><tbody>${r.rows.map((d) => `<tr><td>${esc(d.code)}</td><td>${esc(d.name)}</td><td>${esc(d.what === "gap" ? "gap before" : "duration")}</td><td>${esc(d.party)}</td><td class="n">${esc(d.takenDays)}</td><td class="n">${esc(d.ofDays)}</td><td>${d.onAsBuiltPath ? "yes" : ""}</td></tr>`).join("")}</tbody></table>`);
  }
  if (a.gaps.length) parts.push(`<p><b>As-built gaps</b> (an activity started later than its logic needed; the wait is where an unrecorded delay usually sits):</p><table><thead><tr><th>Activity</th><th>Name</th><th>After</th><th class="n">Days waited</th><th>Constraint in the file</th><th>As-built critical</th></tr></thead><tbody>${a.gaps.slice(0, limit).map((g) => `<tr><td>${esc(g.code)}</td><td>${esc(g.name)}</td><td>${esc(g.after)}</td><td class="n">${esc(g.days)}</td><td>${esc(g.constraint)}</td><td>${g.onPath ? "yes" : ""}</td></tr>`).join("")}</tbody></table>`);
  if (r.warnings.length) parts.push(`<ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`);
  return parts.join("\n");
}

// a delay list for the example office fit-out (example.mjs): the wait for
// the city's in-wall inspection date (owner's permit) and slow level 2
// demolition (contractor)
export const EXAMPLE_DELAYS = "Activity ID,Days,What,Party,Event\nA1110,,gap,Owner,Inspection date set by the city\nA1060,5,activity,Contractor,Slow demolition L2\n";
