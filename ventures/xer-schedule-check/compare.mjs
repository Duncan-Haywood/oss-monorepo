// Update-to-update comparison of two P6 XER exports of the same project: the
// review an owner's rep does on every monthly schedule update before the pay
// application is approved. What moved, what progress was claimed, which logic,
// durations, constraints and calendars were changed, how much float was used,
// and how the critical path changed.
//
// compare(prevXer, curXer, { prevProjId, curProjId }) -> report (plain JSON)
//
// Activities are matched by activity ID (task_code), relationships by
// predecessor ID, successor ID and type: task_id is a database key that
// changes when a project is copied or re-imported, the activity ID is what the
// scheduler and the contract name.
//
// The half-step ("bifurcated") run: the previous update's logic, durations and
// constraints with only the current update's progress (status, actual dates,
// remaining duration, data date) applied, recomputed. Its finish splits the
// movement of the forecast finish into the part progress caused (half-step
// minus previous) and the part the revisions caused (current minus half-step),
// in the manner of AACE RP 29R-03 MIP 3.4. It uses this tool's CPM engine, not
// P6, so read it with the engine's agreement figures (README).

import { schedule, drivingPath } from "./cpm.mjs";
import { parseDate, formatDate, num } from "./xer.mjs";

const PROGRESS_FIELDS = ["status_code", "act_start_date", "act_end_date", "remain_drtn_hr_cnt", "phys_complete_pct", "remain_work_qty", "act_work_qty"];
const STATUS = new Map([["TK_NotStart", "not started"], ["TK_Active", "in progress"], ["TK_Complete", "complete"]]);
const STATUS_RANK = new Map([["TK_NotStart", 0], ["TK_Active", 1], ["TK_Complete", 2]]);
const CSTR = new Map([
  ["CS_MSO", "start on"], ["CS_MEO", "finish on"], ["CS_MSOA", "start on or after"], ["CS_MEOA", "finish on or after"],
  ["CS_MSOB", "start on or before"], ["CS_MEOB", "finish on or before"], ["CS_ALAP", "as late as possible"],
  ["CS_MANDSTART", "mandatory start"], ["CS_MANDFIN", "mandatory finish"],
]);
const RELTYPE = new Map([["PR_FS", "FS"], ["PR_SS", "SS"], ["PR_FF", "FF"], ["PR_SF", "SF"]]);

export function pickProject(xer, model, projId) {
  if (projId && model.projects.has(projId)) return model.projects.get(projId);
  const counts = new Map();
  for (const t of model.tasks.values()) if (t.status !== "TK_Complete") counts.set(t.proj, (counts.get(t.proj) || 0) + 1);
  let best = null;
  for (const p of model.projects.values()) if (!best || (counts.get(p.id) || 0) > (counts.get(best.id) || 0)) best = p;
  return best;
}

// The previous update's tables with the current update's progress laid on
// the activities both files hold, and the current data date.
export function halfStepXer(prevXer, curXer, prevProjId, curProjId) {
  const curByCode = new Map();
  for (const r of curXer.tables.TASK || []) if (r.proj_id === curProjId) curByCode.set(r.task_code, r);
  const curProj = (curXer.tables.PROJECT || []).find((p) => p.proj_id === curProjId) || {};
  const tables = { ...prevXer.tables };
  tables.TASK = (prevXer.tables.TASK || []).map((r) => {
    if (r.proj_id !== prevProjId) return r;
    const c = curByCode.get(r.task_code);
    if (!c) return r;
    const out = { ...r };
    // an activity still not started has had no progress: a new remaining
    // duration on it is a revision (a re-estimate), so it keeps the previous
    // update's
    const fields = c.status_code === "TK_NotStart" && r.status_code === "TK_NotStart" ? PROGRESS_FIELDS.filter((f) => f !== "remain_drtn_hr_cnt" && f !== "remain_work_qty") : PROGRESS_FIELDS;
    for (const f of fields) if (f in c) out[f] = c[f];
    return out;
  });
  tables.PROJECT = (prevXer.tables.PROJECT || []).map((p) => (p.proj_id === prevProjId && curProj.last_recalc_date ? { ...p, last_recalc_date: curProj.last_recalc_date } : p));
  return { ...prevXer, tables };
}

function side(xer, projId) {
  const result = schedule(xer);
  const p0 = pickProject(xer, result.model, projId);
  if (!p0) throw new Error("a file has no PROJECT table");
  const p = result.projects.get(p0.id);
  const byCode = new Map();
  for (const t of result.model.tasks.values()) if (t.proj === p.id) byCode.set(t.code, t);
  const codeOf = (id) => result.model.tasks.get(id)?.code ?? null;
  const rels = new Map();
  for (const r of result.model.rels) {
    const s = result.model.tasks.get(r.succId);
    if (!s || s.proj !== p.id) continue;
    const pc = codeOf(r.predId);
    if (pc === null) continue;
    rels.set(`${pc}\t${s.code}\t${r.type}`, { pred: pc, succ: s.code, type: r.type, lag: r.lag });
  }
  const path = drivingPath(result, p.id).map(codeOf);
  const projRow = (xer.tables.PROJECT || []).find((r) => r.proj_id === p.id) || {};
  // How far to trust the recomputed dates for this file: the share of open
  // activities whose recomputed early finish equals the one P6 stored.
  const notes = [];
  if (!projRow.last_recalc_date) notes.push("no data date stored (last_recalc_date); the planned start was used");
  const taskFields = new Set(Object.keys((xer.tables.TASK || [])[0] || {}));
  if (!taskFields.has("remain_drtn_hr_cnt")) notes.push("no remaining duration column (remain_drtn_hr_cnt), so durations read as zero");
  if ((xer.tables.CALENDAR || []).every((c) => !c.clndr_data)) notes.push("no calendar data (clndr_data); a default calendar was used");
  let compared = 0, matched = 0;
  for (const t of byCode.values()) {
    if (t.span || t.status === "TK_Complete") continue;
    const se = parseDate(t.row.early_end_date);
    const r = result.tasks.get(t.id);
    if (se === null || !r) continue;
    compared++;
    if (r.ef === se) matched++;
  }
  if (compared && matched / compared < 0.9) notes.push(`recomputed early finishes agree with the stored ones on only ${matched} of ${compared} open activities, so the recomputed dates, float and half-step are approximate`);
  return { xer, result, p, byCode, rels, path, notes, agreement: { compared, matched }, name: projRow.proj_short_name || p.code || "", version: xer.version };
}

// The previous file's project that matches the current one: the same project
// ID (proj_short_name), else the same database key. In a file holding several
// projects, falling back to "the one with the most open work" can compare the
// chosen project against a different one.
export function matchingProject(xer, name, projId) {
  const rows = xer.tables.PROJECT || [];
  const byName = name ? rows.filter((r) => r.proj_short_name === name) : [];
  if (byName.length === 1) return byName[0].proj_id;
  return rows.some((r) => r.proj_id === projId) ? projId : undefined;
}

export function compare(prevXer, curXer, opts = {}) {
  const B = side(curXer, opts.curProjId);
  const A = side(prevXer, opts.prevProjId ?? matchingProject(prevXer, B.name, B.p.id));
  const warnings = [];
  for (const n of A.notes) warnings.push(`Previous file: ${n}.`);
  for (const n of B.notes) warnings.push(`Current file: ${n}.`);
  if (A.p.dataDate !== null && B.p.dataDate !== null && B.p.dataDate < A.p.dataDate) warnings.push("The 'current' file's data date is earlier than the 'previous' file's: the two files may be the wrong way round.");
  if (A.p.dataDate !== null && A.p.dataDate === B.p.dataDate) warnings.push("Both files have the same data date: no progress period between them.");
  if (A.name && B.name && A.name !== B.name) warnings.push(`Project IDs differ (${A.name} and ${B.name}); activities are matched by activity ID anyway.`);

  const cal = B.p.cal;
  const hpd = cal.hoursPerDay || 8;
  // signed working days between two instants on the current project calendar
  const wd = (a, b) => (a === null || b === null || a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) ? null : round1(cal.workBetween(a, b) / 60 / hpd));
  const tDays = (t, hours) => (hours === null || hours === undefined ? null : round1(hours / (t.cal.hoursPerDay || 8)));
  const label = (t) => ({ code: t.code, name: t.name });
  const open = (t) => !t.span && t.status !== "TK_Complete";
  const storedTF = (t) => num(t.row.total_float_hr_cnt);

  // ---- activities added and deleted
  const added = [], deleted = [], common = [];
  for (const [code, t] of B.byCode) (A.byCode.has(code) ? common.push([A.byCode.get(code), t]) : added.push({ ...label(t), status: STATUS.get(t.status) || t.status, duration: tDays(t, t.orig / 60) }));
  for (const [code, t] of A.byCode) if (!B.byCode.has(code)) deleted.push({ ...label(t), status: STATUS.get(t.status) || t.status, duration: tDays(t, t.orig / 60), wasCritical: A.path.includes(code) });

  // ---- progress claimed this period
  const ddA = A.p.dataDate, ddB = B.p.dataDate;
  const started = [], finished = [], reversed = [], actualsEdited = [], plannedNotFinished = [], plannedNotStarted = [], futureActuals = [];
  const remainingUp = [], origChanged = [], cstrChanged = [], calChanged = [], renamed = [], typeChanged = [];
  for (const [a, b] of common) {
    const ra = A.result.tasks.get(a.id), rb = B.result.tasks.get(b.id);
    if (a.status === "TK_NotStart" && b.status !== "TK_NotStart") started.push({ ...label(b), actualStart: formatDate(b.actStart) });
    if (a.status !== "TK_Complete" && b.status === "TK_Complete") finished.push({ ...label(b), actualFinish: formatDate(b.actEnd), plannedFinish: ra ? formatDate(ra.ef) : "", daysLate: ra ? wd(ra.ef, b.actEnd) : null });
    if ((STATUS_RANK.get(b.status) ?? 0) < (STATUS_RANK.get(a.status) ?? 0)) reversed.push({ ...label(b), was: STATUS.get(a.status), now: STATUS.get(b.status) });
    for (const [k, fa, fb] of [["actual start", a.actStart, b.actStart], ["actual finish", a.actEnd, b.actEnd]]) {
      if (fa !== null && fb !== null && fa !== fb) actualsEdited.push({ ...label(b), field: k, was: formatDate(fa), now: formatDate(fb), days: wd(fa, fb) });
    }
    for (const [k, f] of [["actual start", b.actStart], ["actual finish", b.actEnd]]) {
      if (f !== null && ddB !== null && f > ddB) futureActuals.push({ ...label(b), field: k, date: formatDate(f) });
    }
    // the previous update forecast this to be done (or started) by the new data date
    if (ra && ddB !== null && !a.span) {
      if (a.status !== "TK_Complete" && b.status !== "TK_Complete" && ra.ef <= ddB) plannedNotFinished.push({ ...label(b), forecastFinish: formatDate(ra.ef), status: STATUS.get(b.status) });
      if (a.status === "TK_NotStart" && b.status === "TK_NotStart" && (ra.remES ?? ra.es) < ddB) plannedNotStarted.push({ ...label(b), forecastStart: formatDate(ra.remES ?? ra.es) });
    }
    // remaining duration grew on work already under way in both updates
    if (a.status === "TK_Active" && b.status === "TK_Active" && b.remain > a.remain) remainingUp.push({ ...label(b), was: tDays(a, a.remain / 60), now: tDays(b, b.remain / 60) });
    // original duration changed on work not yet started (a revision, not progress)
    if (a.status === "TK_NotStart" && b.orig !== a.orig) origChanged.push({ ...label(b), was: tDays(a, a.orig / 60), now: tDays(b, b.orig / 60), critical: B.path.includes(b.code) || A.path.includes(a.code) });
    const cs = (t) => t.cstr.map((c) => `${CSTR.get(c.type) || c.type}${c.date !== null ? " " + formatDate(c.date) : ""}`).join("; ");
    if (cs(a) !== cs(b)) cstrChanged.push({ ...label(b), was: cs(a) || "none", now: cs(b) || "none" });
    if ((a.cal.name || a.cal.id) !== (b.cal.name || b.cal.id)) calChanged.push({ ...label(b), was: a.cal.name || String(a.cal.id), now: b.cal.name || String(b.cal.id) });
    if (a.name !== b.name) renamed.push({ code: b.code, was: a.name, now: b.name });
    if (a.type !== b.type) typeChanged.push({ code: b.code, name: b.name, was: a.type, now: b.type });
  }

  // ---- logic
  const relsAdded = [], relsDeleted = [], lagChanged = [];
  const relItem = (r) => ({ pred: r.pred, succ: r.succ, type: RELTYPE.get(r.type) || r.type, lagDays: round1(r.lag / 60 / hpd) });
  for (const [k, r] of B.rels) {
    const old = A.rels.get(k);
    if (!old) relsAdded.push(relItem(r));
    else if (old.lag !== r.lag) lagChanged.push({ ...relItem(r), wasLagDays: round1(old.lag / 60 / hpd) });
  }
  for (const [k, r] of A.rels) if (!B.rels.has(k)) relsDeleted.push(relItem(r));
  // a deleted and an added link between the same pair is a type change
  const typeChangedRels = [];
  for (let i = relsDeleted.length - 1; i >= 0; i--) {
    const d = relsDeleted[i];
    const j = relsAdded.findIndex((x) => x.pred === d.pred && x.succ === d.succ);
    if (j >= 0) {
      typeChangedRels.push({ pred: d.pred, succ: d.succ, was: `${d.type}${lagStr(d.lagDays)}`, now: `${relsAdded[j].type}${lagStr(relsAdded[j].lagDays)}` });
      relsAdded.splice(j, 1);
      relsDeleted.splice(i, 1);
    }
  }
  // deleted links between activities both files hold, on either critical path
  const onPath = new Set([...A.path, ...B.path]);
  for (const r of relsDeleted) r.critical = onPath.has(r.pred) || onPath.has(r.succ);
  for (const r of relsDeleted) r.bothRemain = B.byCode.has(r.pred) && B.byCode.has(r.succ);

  // ---- float and dates on open work
  const floatRows = [];
  let newlyCritical = 0;
  for (const [a, b] of common) {
    if (!open(b) || !open(a)) continue;
    const ra = A.result.tasks.get(a.id), rb = B.result.tasks.get(b.id);
    if (!ra || !rb) continue;
    const fa = storedTF(a) ?? ra.tf, fb = storedTF(b) ?? rb.tf;
    const row = { ...label(b), floatWas: tDays(a, fa), floatNow: tDays(b, fb), floatUsed: round1(tDays(a, fa) - tDays(b, fb)), finishWas: formatDate(ra.ef), finishNow: formatDate(rb.ef), finishMoved: wd(ra.ef, rb.ef), inProgress: b.status === "TK_Active" };
    if (fa > 0 && fb <= 0) { row.becameCritical = true; newlyCritical++; }
    floatRows.push(row);
  }
  floatRows.sort((x, y) => y.floatUsed - x.floatUsed);

  // ---- critical (driving) path
  const pathA = new Set(A.path), pathB = new Set(B.path);
  const joined = B.path.filter((c) => !pathA.has(c)).map((c) => ({ code: c, name: B.byCode.get(c)?.name || "", isNew: !A.byCode.has(c) }));
  const left = A.path.filter((c) => !pathB.has(c)).map((c) => {
    const bt = B.byCode.get(c);
    return { code: c, name: A.byCode.get(c)?.name || "", now: !bt ? "deleted" : bt.status === "TK_Complete" ? "complete" : "off the path" };
  });
  // how much each activity on the current driving path moved
  const trail = B.path.map((c) => {
    const a = A.byCode.get(c), b = B.byCode.get(c);
    const ra = a ? A.result.tasks.get(a.id) : null, rb = B.result.tasks.get(b.id);
    return { code: c, name: b.name, finishWas: ra ? formatDate(ra.ef) : "", finishNow: formatDate(rb.ef), moved: ra ? wd(ra.ef, rb.ef) : null, isNew: !a };
  });

  // ---- half-step
  let half = null, halfPath = [];
  try {
    const hx = halfStepXer(prevXer, curXer, A.p.id, B.p.id);
    const hr = schedule(hx);
    const hp = hr.projects.get(A.p.id);
    if (hp && hp.finish !== null) half = hp.finish;
    // the driving path once this period's progress is in and before the
    // revisions: the path the revisions act on
    halfPath = drivingPath(hr, A.p.id).map((id) => hr.model.tasks.get(id)?.code).filter((c) => c !== undefined);
  } catch (e) {
    warnings.push(`half-step run failed: ${e.message}`);
  }
  const moved = wd(A.p.finish, B.p.finish);
  const progressEffect = half !== null ? wd(A.p.finish, half) : null;
  const revisionEffect = half !== null ? wd(half, B.p.finish) : null;
  const storedMoved = wd(A.p.storedFinish, B.p.storedFinish);

  // ---- what a reviewer usually asks about, most serious first
  const flags = [];
  const flag = (severity, text, count) => { if (count) flags.push({ severity, text, count }); };
  flag("high", "Actual dates changed after they were reported in the previous update", actualsEdited.length);
  flag("high", "Actual dates after the data date", futureActuals.length);
  flag("high", "Progress reversed (an activity went back from complete or in progress)", reversed.length);
  flag("high", "Relationships deleted on the critical path", relsDeleted.filter((r) => r.critical && r.bothRemain).length);
  flag("high", "Original durations shortened on critical activities", origChanged.filter((r) => r.critical && r.now < r.was).length);
  flag("medium", "Constraints added, removed or changed", cstrChanged.length);
  flag("medium", "Relationships deleted between activities that are still in the schedule", relsDeleted.filter((r) => r.bothRemain).length);
  flag("medium", "Original durations changed on activities not yet started", origChanged.length);
  flag("medium", "Lags changed", lagChanged.length);
  flag("medium", "Relationship types changed", typeChangedRels.length);
  flag("medium", "Activity calendars changed", calChanged.length);
  flag("medium", "Remaining duration grew on work in progress", remainingUp.length);
  flag("low", "Activities forecast to finish by this data date that did not", plannedNotFinished.length);
  flag("low", "Activities forecast to start by this data date that did not", plannedNotStarted.length);
  flag("low", "Activities deleted", deleted.length);
  flag("low", "Activities added", added.length);
  flag("low", "Activities that became critical", newlyCritical);

  return {
    previous: { name: A.name, version: A.version, dataDate: formatDate(ddA), finish: formatDate(A.p.finish), storedFinish: formatDate(A.p.storedFinish), mustFinish: formatDate(A.p.mustFinish), activities: A.byCode.size, relationships: A.rels.size, agreement: A.agreement },
    current: { name: B.name, version: B.version, dataDate: formatDate(ddB), finish: formatDate(B.p.finish), storedFinish: formatDate(B.p.storedFinish), mustFinish: formatDate(B.p.mustFinish), activities: B.byCode.size, relationships: B.rels.size, agreement: B.agreement },
    period: { workingDays: wd(ddA, ddB) },
    // working days from the must-finish date (plan_end_date) to the forecast
    // finish, on the current project calendar: positive = after it (late)
    finish: { moved, storedMoved, halfStep: formatDate(half), progressEffect, revisionEffect,
      vsMustFinish: B.p.mustFinish !== null ? wd(B.p.mustFinish, B.p.finish) : null,
      prevVsMustFinish: A.p.mustFinish !== null ? wd(A.p.mustFinish, A.p.finish) : null },
    flags,
    progress: { started, finished, reversed, actualsEdited, futureActuals, plannedNotFinished, plannedNotStarted, remainingUp,
      planned: plannedNotFinished.length + finished.filter((f) => f.plannedFinish && parseDate(f.plannedFinish) <= ddB).length },
    activities: { added, deleted, renamed, typeChanged },
    durations: { origChanged },
    logic: { added: relsAdded, deleted: relsDeleted, lagChanged, typeChanged: typeChangedRels },
    constraints: cstrChanged,
    calendars: calChanged,
    float: { rows: floatRows, newlyCritical },
    criticalPath: { previous: A.path, current: B.path, halfStep: halfPath, joined, left, trail },
    warnings,
  };
}

function lagStr(d) { return d ? ` ${d > 0 ? "+" : ""}${d}d` : ""; }
function round1(x) { return x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10; }

// One CSV row per change, for a spreadsheet or a letter to the contractor.
export function compareCsv(rep) {
  const rows = [["section", "activity", "name", "was", "now", "detail"]];
  const q = (v) => {
    let s = v === null || v === undefined ? "" : String(v);
    // activity names come from the contractor's file: a cell a spreadsheet
    // would read as a formula is written as text (CSV injection)
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const push = (...r) => rows.push(r);
  for (const x of rep.progress.actualsEdited) push("actual date edited", x.code, x.name, x.was, x.now, `${x.field}, ${x.days} working days`);
  for (const x of rep.progress.futureActuals) push("actual after data date", x.code, x.name, "", x.date, x.field);
  for (const x of rep.progress.reversed) push("progress reversed", x.code, x.name, x.was, x.now, "");
  for (const x of rep.progress.started) push("started", x.code, x.name, "", x.actualStart, "");
  for (const x of rep.progress.finished) push("finished", x.code, x.name, x.plannedFinish, x.actualFinish, x.daysLate === null ? "" : `${x.daysLate} working days vs forecast`);
  for (const x of rep.progress.plannedNotFinished) push("forecast finish missed", x.code, x.name, x.forecastFinish, x.status, "");
  for (const x of rep.progress.plannedNotStarted) push("forecast start missed", x.code, x.name, x.forecastStart, "not started", "");
  for (const x of rep.progress.remainingUp) push("remaining duration grew", x.code, x.name, x.was, x.now, "days");
  for (const x of rep.durations.origChanged) push("original duration changed", x.code, x.name, x.was, x.now, x.critical ? "days; critical" : "days");
  for (const x of rep.constraints) push("constraint changed", x.code, x.name, x.was, x.now, "");
  for (const x of rep.calendars) push("calendar changed", x.code, x.name, x.was, x.now, "");
  for (const x of rep.logic.deleted) push("relationship deleted", `${x.pred} -> ${x.succ}`, "", `${x.type}${lagStr(x.lagDays)}`, "", x.critical ? "critical path" : "");
  for (const x of rep.logic.added) push("relationship added", `${x.pred} -> ${x.succ}`, "", "", `${x.type}${lagStr(x.lagDays)}`, "");
  for (const x of rep.logic.typeChanged) push("relationship type changed", `${x.pred} -> ${x.succ}`, "", x.was, x.now, "");
  for (const x of rep.logic.lagChanged) push("lag changed", `${x.pred} -> ${x.succ}`, "", x.wasLagDays, x.lagDays, `${x.type}, days`);
  for (const x of rep.activities.added) push("activity added", x.code, x.name, "", x.status, x.duration === null ? "" : `${x.duration} days`);
  for (const x of rep.activities.deleted) push("activity deleted", x.code, x.name, x.status, "", x.wasCritical ? "was critical" : "");
  for (const x of rep.activities.renamed) push("renamed", x.code, x.now, x.was, x.now, "");
  for (const x of rep.float.rows) if (x.floatUsed) push("float", x.code, x.name, x.floatWas, x.floatNow, `${x.floatUsed} days used${x.becameCritical ? "; became critical" : ""}`);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

// The report as plain text, for a terminal or the body of an email.
export function compareText(rep, { limit = 15 } = {}) {
  const L = [];
  const a = rep.previous, b = rep.current, f = rep.finish;
  const sgn = (d) => (d === null ? "n/a" : `${d > 0 ? "+" : ""}${d} working days`);
  L.push(`${b.name}: update ${b.dataDate} against ${a.dataDate} (${rep.period.workingDays ?? "?"} working days)`);
  for (const w of rep.warnings) L.push(`WARNING: ${w}`);
  L.push(`Forecast finish (recomputed): ${a.finish} -> ${b.finish}  ${sgn(f.moved)}`);
  if (a.storedFinish && b.storedFinish) L.push(`Forecast finish (as stored by P6): ${a.storedFinish} -> ${b.storedFinish}  ${sgn(f.storedMoved)}`);
  if (f.halfStep) L.push(`Half-step (previous logic, current progress): ${f.halfStep}; progress ${sgn(f.progressEffect)}, revisions ${sgn(f.revisionEffect)}`);
  L.push(`Activities ${a.activities} -> ${b.activities}, relationships ${a.relationships} -> ${b.relationships}`);
  L.push("");
  L.push(rep.flags.length ? "To ask the contractor about:" : "Nothing to flag.");
  for (const x of rep.flags) L.push(`  [${x.severity}] ${x.text}: ${x.count}`);
  const sec = (title, rows, fmt) => {
    if (!rows.length) return;
    L.push("", `${title} (${rows.length})`);
    for (const r of rows.slice(0, limit)) L.push("  " + fmt(r));
    if (rows.length > limit) L.push(`  ... ${rows.length - limit} more (--json or --csv for all)`);
  };
  const P = rep.progress;
  sec("Actual dates edited after reporting", P.actualsEdited, (r) => `${r.code} ${r.name}: ${r.field} ${r.was} -> ${r.now}`);
  sec("Actual dates after the data date", P.futureActuals, (r) => `${r.code} ${r.name}: ${r.field} ${r.date}`);
  sec("Progress reversed", P.reversed, (r) => `${r.code} ${r.name}: ${r.was} -> ${r.now}`);
  sec("Started this period", P.started, (r) => `${r.code} ${r.name}: ${r.actualStart}`);
  sec("Finished this period", P.finished, (r) => `${r.code} ${r.name}: ${r.actualFinish}${r.daysLate ? ` (${sgn(r.daysLate)} vs forecast)` : ""}`);
  sec("Forecast to finish by this data date, not finished", P.plannedNotFinished, (r) => `${r.code} ${r.name}: forecast ${r.forecastFinish}, now ${r.status}`);
  sec("Forecast to start by this data date, not started", P.plannedNotStarted, (r) => `${r.code} ${r.name}: forecast ${r.forecastStart}`);
  sec("Remaining duration grew on work in progress", P.remainingUp, (r) => `${r.code} ${r.name}: ${r.was} -> ${r.now} days`);
  sec("Original duration changed (not started)", rep.durations.origChanged, (r) => `${r.code} ${r.name}: ${r.was} -> ${r.now} days${r.critical ? " (critical)" : ""}`);
  sec("Constraints changed", rep.constraints, (r) => `${r.code} ${r.name}: ${r.was} -> ${r.now}`);
  sec("Calendars changed", rep.calendars, (r) => `${r.code} ${r.name}: ${r.was} -> ${r.now}`);
  sec("Relationships deleted", rep.logic.deleted, (r) => `${r.pred} -> ${r.succ} ${r.type}${lagStr(r.lagDays)}${r.critical ? " (critical path)" : ""}${r.bothRemain ? "" : " (an activity was deleted)"}`);
  sec("Relationships added", rep.logic.added, (r) => `${r.pred} -> ${r.succ} ${r.type}${lagStr(r.lagDays)}`);
  sec("Relationship types changed", rep.logic.typeChanged, (r) => `${r.pred} -> ${r.succ}: ${r.was} -> ${r.now}`);
  sec("Lags changed", rep.logic.lagChanged, (r) => `${r.pred} -> ${r.succ} ${r.type}: ${r.wasLagDays} -> ${r.lagDays} days`);
  sec("Activities added", rep.activities.added, (r) => `${r.code} ${r.name} (${r.status})`);
  sec("Activities deleted", rep.activities.deleted, (r) => `${r.code} ${r.name} (${r.status})${r.wasCritical ? " (was critical)" : ""}`);
  sec("Renamed", rep.activities.renamed, (r) => `${r.code}: "${r.was}" -> "${r.now}"`);
  sec("Most float used", rep.float.rows.filter((r) => r.floatUsed > 0), (r) => `${r.code} ${r.name}: ${r.floatWas} -> ${r.floatNow} days${r.becameCritical ? " (now critical)" : ""}`);
  const cp = rep.criticalPath;
  sec("Joined the driving path", cp.joined, (r) => `${r.code} ${r.name}${r.isNew ? " (new activity)" : ""}`);
  sec("Left the driving path", cp.left, (r) => `${r.code} ${r.name} (${r.now})`);
  sec("Driving path now, and how far each finish moved", cp.trail, (r) => `${r.code} ${r.name}: ${r.finishNow}${r.isNew ? " (new)" : ` (${sgn(r.moved)})`}`);
  return L.join("\n") + "\n";
}
