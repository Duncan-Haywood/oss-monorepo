// Critical path drag: how much later the project finishes because of each
// critical activity (and each critical lag), and what that time costs.
//
// Drag is Stephen Devaux's measure (Total Project Control, 1999; "Measuring
// critical path drag", PM World Journal, 2012): the amount of time an
// activity on the critical path adds to the project's duration. It is the
// most the finish can come in by shortening that one activity, so it ranks
// acceleration candidates in a way total float cannot (every critical
// activity has the same float). Primavera P6 and Microsoft Project do not
// compute it.
//
// Method: for each candidate the schedule is recomputed by this tool's P6
// engine (cpm.mjs) with that activity's remaining duration set to zero (a
// lag set to zero, for lag drag), every other input unchanged, and the drag
// is the forecast finish then minus the forecast finish now. Recomputing
// rather than using Devaux's float formula keeps calendars, lag calendars,
// SS/FF/SF links, constraints, progress and retained logic exactly as the
// rest of the tool schedules them, and it shows "reverse drag": an
// activity the critical path enters at its finish (FF) and leaves at its
// start (SS), where shortening it moves the finish later.
//
// Drag cost is the drag in calendar days times a cost per day of finish
// (liquidated damages, extended general conditions, or the value of an
// earlier opening) that the user types. It is that activity's share of the
// cost of the current finish date, not a quote for accelerating it.
//
// dragAnalysis(xer, { projId, costPerDay, maxRuns, lags, expectedFinish }) ->
//   { project, finish, costPerDay, activities: [...], lags: [...], runs, ms, warnings }
import { buildModel, schedule } from "./cpm.mjs";
import { pickProject } from "./compare.mjs";
import { longestPath } from "./floatpaths.mjs";
import { formatDate } from "./xer.mjs";

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
export const MAX_RUNS = 800;

export function dragAnalysis(xer, { projId = null, costPerDay = null, maxRuns = MAX_RUNS, lags = true, expectedFinish = true, model: model0 = null } = {}) {
  const t0 = Date.now();
  const model = model0 || buildModel(xer);
  const ex = expectedFinish === false ? { expectedFinish: false } : {};
  const base = schedule(null, { model, ...ex });
  const p = pickProject(xer, model, projId);
  if (!p) throw new Error("no project in the file");
  const bp = base.projects.get(p.id);
  if (!bp || bp.finish === null || !Number.isFinite(bp.finish)) throw new Error("the project has no forecast finish (is every activity complete?)");
  const F0 = bp.finish;
  const pcal = p.cal;
  const hpd = pcal.hoursPerDay || 8;
  const warnings = [];
  if (base.loops.length) warnings.push(`${base.loops.length} logic loop(s): activities on a loop are left out of the network and get no drag`);
  const cost = costPerDay !== null && costPerDay !== undefined && Number.isFinite(Number(costPerDay)) && Number(costPerDay) > 0 ? Number(costPerDay) : null;

  // signed working hours on the project calendar from finish f to F0 (positive:
  // f is earlier, so the activity was holding the finish back by that much)
  const workDrag = (f) => (f <= F0 ? pcal.workBetween(f, F0) : -pcal.workBetween(F0, f)) / 60;
  const measure = (f) => {
    const hours = workDrag(f);
    const calDays = r2((F0 - f) / 1440);
    return { minutes: Math.round(hours * 60), hours: r1(hours), days: r2(hours / hpd), calendarDays: calDays, cost: cost === null ? null : Math.round(calDays * cost) };
  };

  const open = (t) => t.proj === p.id && !t.span && t.status !== "TK_Complete" && base.tasks.has(t.id);
  // Candidates: the longest path (every driving chain into the activities
  // that finish on the forecast finish, floatpaths.mjs longestPath). Total
  // float does not pick them: a must-finish date or a constraint gives
  // unrelated activities less float than the longest path (CCA: longest path
  // at +72 h, 5 activities at -664 h), and P6's float threshold misses a
  // longest path with positive float.
  const lp = longestPath(base, p.id);
  const cands = [...lp].map((id) => model.tasks.get(id)).filter((t) => t && open(t))
    .sort((x, y) => base.tasks.get(x.id).remES - base.tasks.get(y.id).remES || String(x.code).localeCompare(String(y.code)));
  let runs = 0;
  const budget = Math.max(1, maxRuns);
  const actCands = cands.filter((t) => (base.tasks.get(t.id).rem ?? t.remain) > 0);
  if (actCands.length > budget) warnings.push(`${actCands.length} longest-path activities with remaining duration; the first ${budget} (by start) were tested (raise maxRuns for the rest)`);

  // the parallel path that takes over: the earliest-starting activity on
  // the zero run's longest path that is not on the base one
  const firstNew = (res) => {
    let best = null;
    for (const id of longestPath(res, p.id)) {
      if (lp.has(id)) continue;
      const r = res.tasks.get(id);
      if (r && (!best || r.remES < best.at)) best = { at: r.remES, code: model.tasks.get(id)?.code ?? id };
    }
    return best ? best.code : null;
  };
  const activities = [];
  for (const t of actCands.slice(0, budget)) {
    const r = base.tasks.get(t.id);
    const rem = r.rem ?? t.remain;
    const res = schedule(null, { model, ...ex, forwardOnly: true, durations: new Map([[t.id, 0]]) });
    runs++;
    const f = res.projects.get(p.id).finish;
    const m = measure(f);
    const remH = rem / 60;
    const notes = [];
    if (t.cstr.some((c) => ["CS_MANDFIN", "CS_MANDSTART", "CS_MEO", "CS_MSO"].includes(c.type))) notes.push("mandatory constraint");
    // with "use expected finish dates" on, the expected finish overrides any
    // shorter remaining duration: only taking no time at all (or moving the
    // expected finish) gains the drag
    if (expectedFinish !== false && p.useExpectedFinish && t.expEnd !== null && t.expEnd !== undefined) notes.push("its expected finish sets the duration: move that date to gain the drag");
    if (m.hours < 0) notes.push("reverse drag: shortening it moves the finish later");
    else if (m.hours > 0 && m.hours < remH - 0.05) {
      const lim = firstNew(res);
      if (lim) notes.push(`limited by the parallel path through ${lim}`);
    }
    // The least shortening (working hours on the activity's own calendar)
    // that wins the whole drag. Often the drag itself, but not always: a
    // finish that snaps to a day boundary, or a lag on another calendar, makes
    // the gain a staircase (CCA T12CO04403C0: 14.7 h of drag, 8 h won by
    // shortening 14.7 h, all of it from 24 h). Bisection on 6-minute steps,
    // taking the gain as non-decreasing in the shortening.
    let shortenFor = null;
    const expHeld = notes.some((n) => n.startsWith("its expected finish"));
    if (m.minutes > 0 && !expHeld) {
      const gain = (x) => { runs++; return Math.round(workDrag(schedule(null, { model, ...ex, forwardOnly: true, durations: new Map([[t.id, rem - x]]) }).projects.get(p.id).finish) * 60); };
      let lo = 0, hi = rem; // gain(hi) = drag
      const first = Math.min(rem, m.minutes);
      if (gain(first) >= m.minutes) hi = first; else lo = first;
      while (hi - lo > 6) { const mid = Math.round((lo + hi) / 2); if (gain(mid) >= m.minutes) hi = mid; else lo = mid; }
      shortenFor = r1(hi / 60);
      if (hi - m.minutes > 6 && t.cal === pcal) notes.push(`takes ${shortenFor} h of shortening to win its ${m.hours} h (the gain comes in steps)`);
    }
    activities.push({
      id: t.id, code: t.code, name: t.name, status: t.status, shortenForHours: shortenFor,
      remainingHours: r1(remH), remainingDays: r2(remH / (t.cal.hoursPerDay || hpd)), totalFloat: r1(r.tf ?? 0),
      start: formatDate(r.remES), finish: formatDate(r.ef),
      drag: m, finishIfZero: formatDate(f),
      dragPerRemainingDay: remH > 0 ? r2(m.hours / remH) : null,
      notes,
    });
  }

  const lagRows = [];
  if (lags) {
    const ids = new Set(cands.map((t) => t.id));
    const rels = [];
    for (const t of cands) for (const rel of t.preds) if (ids.has(rel.predId) && rel.lag > 0) rels.push(rel);
    for (const rel of rels) {
      if (runs >= budget) { warnings.push(`lag drag: ${rels.length - lagRows.length} lags not tested (run budget)`); break; }
      const keep = rel.lag;
      let f;
      try {
        rel.lag = 0;
        f = schedule(null, { model, ...ex, forwardOnly: true }).projects.get(p.id).finish;
      } finally { rel.lag = keep; }
      runs++;
      const pr = model.tasks.get(rel.predId), su = model.tasks.get(rel.succId);
      lagRows.push({ id: rel.id, pred: pr.code, succ: su.code, type: rel.type.replace("PR_", ""), lagHours: r1(keep / 60), drag: measure(f), finishIfZero: formatDate(f) });
    }
  }
  const byDrag = (a, b) => b.drag.hours - a.drag.hours || a.code?.localeCompare?.(b.code ?? "") || 0;
  activities.sort(byDrag);
  lagRows.sort((a, b) => b.drag.hours - a.drag.hours);
  const pos = activities.filter((a) => a.drag.hours > 0);
  return {
    project: { id: p.id, code: p.code, dataDate: formatDate(p.dataDate) },
    finish: formatDate(F0), hoursPerDay: hpd, costPerDay: cost,
    activities, lags: lagRows,
    summary: {
      tested: activities.length, withDrag: pos.length,
      reverse: activities.filter((a) => a.drag.hours < 0).length,
      limitedByParallel: activities.filter((a) => a.notes.some((n) => n.startsWith("limited by"))).length,
      largest: pos[0] ? { code: pos[0].code, days: pos[0].drag.days, cost: pos[0].drag.cost } : null,
      lagsWithDrag: lagRows.filter((l) => l.drag.hours > 0).length,
    },
    runs, ms: Date.now() - t0, warnings: [...warnings, ...base.warnings],
  };
}

const money = (n) => (n === null || n === undefined ? "" : n.toLocaleString("en-US"));

export function dragText(r, { limit = 20 } = {}) {
  const s = r.summary;
  const out = [];
  out.push(`${r.project.code}: critical path drag, forecast finish ${r.finish} (data date ${r.project.dataDate})`);
  out.push(`${s.tested} longest-path activities tested, ${s.withDrag} ${s.withDrag === 1 ? "holds" : "hold"} the finish back${s.reverse ? `, ${s.reverse} with reverse drag` : ""}${s.limitedByParallel ? `; ${s.limitedByParallel} limited by a parallel path` : ""} (${r.runs} reschedules, ${r.ms} ms)`);
  if (s.largest) out.push(`Largest: ${s.largest.code}, ${s.largest.days} working days${s.largest.cost !== null ? ` ($${money(s.largest.cost)} at $${money(r.costPerDay)}/day)` : ""}`);
  out.push("");
  out.push(`  drag (d)  remaining (d)  ${r.costPerDay ? "drag cost   " : ""}activity`);
  for (const a of r.activities.slice(0, limit)) {
    out.push(`  ${String(a.drag.days).padStart(8)}  ${String(a.remainingDays).padStart(13)}  ${r.costPerDay ? `${("$" + money(a.drag.cost)).padStart(10)}  ` : ""}${a.code}  ${a.name ?? ""}${a.notes.length ? `  [${a.notes.join("; ")}]` : ""}`);
  }
  if (r.activities.length > limit) out.push(`  ... ${r.activities.length - limit} more (--json or --csv for all)`);
  const lg = r.lags.filter((l) => l.drag.hours !== 0);
  if (lg.length) {
    out.push("", "Lags that hold the finish back:");
    for (const l of lg.slice(0, limit)) out.push(`  ${String(l.drag.days).padStart(8)} d  ${l.pred} -> ${l.succ} ${l.type} lag ${l.lagHours} h`);
  }
  if (r.warnings.length) out.push("", ...r.warnings.map((w) => `- ${w}`));
  out.push("", "Drag: how much earlier the forecast finish would be if that activity (or lag) took no time, everything else as is.");
  return out.join("\n") + "\n";
}

// spreadsheet formula guard: a name starting =, +, -, @, tab or CR is
// prefixed with an apostrophe (a negative number is left as a number)
const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function dragCsv(r) {
  const rows = [["kind", "activity_id", "name", "predecessor", "successor", "relationship", "remaining_days", "lag_hours", "total_float_hours", "drag_working_days", "drag_hours", "drag_calendar_days", "drag_cost", "shorten_for_hours", "finish_if_zero", "notes"]];
  for (const a of r.activities) rows.push(["activity", a.code, a.name, "", "", "", a.remainingDays, "", a.totalFloat, a.drag.days, a.drag.hours, a.drag.calendarDays, a.drag.cost ?? "", a.shortenForHours ?? "", a.finishIfZero, a.notes.join("; ")]);
  for (const l of r.lags) rows.push(["lag", "", "", l.pred, l.succ, l.type, "", l.lagHours, "", l.drag.days, l.drag.hours, l.drag.calendarDays, l.drag.cost ?? "", "", l.finishIfZero, ""]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// The table the page shows (no document wrapper).
export function dragTableHtml(r, { limit = 25 } = {}) {
  const c = r.costPerDay !== null;
  const rows = r.activities.slice(0, limit).map((a) => `<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td class="n">${esc(a.remainingDays)}</td><td class="n"><b>${esc(a.drag.days)}</b></td>${c ? `<td class="n">$${esc(money(a.drag.cost))}</td>` : ""}<td>${esc(a.finishIfZero.slice(0, 10))}</td><td>${esc(a.notes.join("; "))}</td></tr>`).join("");
  const lg = r.lags.filter((l) => l.drag.hours !== 0).slice(0, 10);
  return `<table><thead><tr><th>Activity</th><th>Name</th><th class="n">Remaining (d)</th><th class="n">Drag (d)</th>${c ? '<th class="n">Drag cost</th>' : ""}<th>Finish if it took no time</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>${lg.length ? `<p><b>Lags with drag:</b> ${lg.map((l) => `${esc(l.pred)} &rarr; ${esc(l.succ)} ${esc(l.type)} ${esc(l.lagHours)} h (${esc(l.drag.days)} d)`).join("; ")}</p>` : ""}`;
}
