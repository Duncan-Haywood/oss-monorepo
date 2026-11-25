// Windows analysis across a series of P6 XER updates of one project: the
// contemporaneous-period ("windows") delay analysis a claims consultant or an
// owner's scheduler runs over a whole job's updates, built from the
// update-to-update comparison in compare.mjs.
//
// windows([{ xer, label }], { projectName }) -> report (plain JSON)
//
// The updates are put in data-date order. Each consecutive pair is one window.
// For each window the movement of the forecast finish is split by the
// half-step run (compare.mjs, in the manner of AACE RP 29R-03 MIP 3.4) into
// the part progress caused (work on the previous update's driving path that
// went slower than forecast, or faster) and the part the revisions caused
// (logic, durations, constraints and calendars changed by the scheduler). The
// windows add up: the sum of the windows' movements is the movement from the
// first update to the last, measured on one calendar.
//
// Each window also names the activities that can explain it: on the previous
// update's driving path (the critical path at the start of the window), the
// work forecast to finish or start by the new data date that did not, work that
// finished late, remaining durations that grew; and the revisions that touched
// that path. That names candidates; deciding which party is responsible for a
// delay is the analyst's job, not this tool's.

import { compare } from "./compare.mjs";
import { schedule } from "./cpm.mjs";
import { parseDate, formatDate } from "./xer.mjs";
import { pickProject, matchingProject } from "./compare.mjs";

const round1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

function headerOf(xer, projName) {
  const rows = xer.tables.PROJECT || [];
  let row = projName ? rows.find((r) => r.proj_short_name === projName) : null;
  if (!row) {
    const r0 = schedule(xer, { forwardOnly: true });
    const p = pickProject(xer, r0.model, null);
    row = rows.find((r) => r.proj_id === p?.id) || rows[0] || {};
  }
  return { projId: row.proj_id, name: row.proj_short_name || "", dataDate: parseDate(row.last_recalc_date) ?? parseDate(row.plan_start_date) };
}

// Activities on the previous update's driving path that the window's
// comparison links to the delay, progress side and revision side.
function drivers(c) {
  const onPrev = new Set(c.criticalPath.previous);
  // a revision is named when it touches the driving path at the start or end
  // of the window, or the half-step's path (progress in, revisions not yet):
  // progress can move the path within a window, and the revisions act on the
  // path progress left (found by eval/windows-kinds-check.mjs, 2026-11-24: a
  // deleted link that pulled the finish in 2.9 days was on neither end's path)
  const onEither = new Set([...c.criticalPath.previous, ...c.criticalPath.current, ...(c.criticalPath.halfStep || [])]);
  const progress = [], revisions = [];
  for (const r of c.progress.plannedNotFinished) if (onPrev.has(r.code)) progress.push({ code: r.code, name: r.name, what: `forecast to finish by ${r.forecastFinish.slice(0, 10)}, now ${r.status}` });
  for (const r of c.progress.plannedNotStarted) if (onPrev.has(r.code)) progress.push({ code: r.code, name: r.name, what: `forecast to start by ${r.forecastStart.slice(0, 10)}, not started` });
  for (const r of c.progress.finished) if (onPrev.has(r.code) && r.daysLate) progress.push({ code: r.code, name: r.name, what: `finished ${r.actualFinish.slice(0, 10)}, ${r.daysLate > 0 ? "+" : ""}${r.daysLate} working days against the forecast` });
  for (const r of c.progress.remainingUp) if (onPrev.has(r.code)) progress.push({ code: r.code, name: r.name, what: `remaining duration grew ${r.was} to ${r.now} days` });
  for (const r of c.progress.reversed) if (onPrev.has(r.code)) progress.push({ code: r.code, name: r.name, what: `progress reversed (${r.was} to ${r.now})` });
  for (const r of c.progress.actualsEdited) if (onPrev.has(r.code)) progress.push({ code: r.code, name: r.name, what: `${r.field} edited ${r.was.slice(0, 10)} to ${r.now.slice(0, 10)}` });
  // work under way on the path whose forecast finish moved later: started
  // late, or going slower than its remaining duration said
  const named = new Set(progress.map((x) => x.code));
  for (const r of c.float.rows) if (onPrev.has(r.code) && r.inProgress && r.finishMoved > 0 && !named.has(r.code)) progress.push({ code: r.code, name: r.name, what: `in progress, forecast finish ${r.finishWas.slice(0, 10)} to ${r.finishNow.slice(0, 10)} (+${r.finishMoved} working days)` });
  // and the gains: work under way on the path now forecast to finish earlier
  // than the last update said (going faster than its remaining duration).
  // A window that pulled the finish in names what pulled it, as a delay does.
  for (const r of c.float.rows) if (onPrev.has(r.code) && r.inProgress && r.finishMoved < 0 && !named.has(r.code)) progress.push({ code: r.code, name: r.name, gain: true, what: `in progress, forecast finish ${r.finishWas.slice(0, 10)} to ${r.finishNow.slice(0, 10)} (${r.finishMoved} working days, ahead of the forecast)` });
  for (const r of c.durations.origChanged) if (r.critical) revisions.push({ code: r.code, name: r.name, what: `original duration ${r.was} to ${r.now} days` });
  for (const r of c.constraints) if (onEither.has(r.code)) revisions.push({ code: r.code, name: r.name, what: `constraint ${r.was} to ${r.now}` });
  for (const r of c.calendars) if (onEither.has(r.code)) revisions.push({ code: r.code, name: r.name, what: `calendar ${r.was} to ${r.now}` });
  const relOn = (r) => onEither.has(r.pred) || onEither.has(r.succ);
  for (const r of c.logic.lagChanged) if (relOn(r)) revisions.push({ code: `${r.pred} -> ${r.succ}`, name: "", what: `${r.type} lag ${r.wasLagDays} to ${r.lagDays} days` });
  for (const r of c.logic.added) if (relOn(r)) revisions.push({ code: `${r.pred} -> ${r.succ}`, name: "", what: `${r.type} link added${r.lagDays ? ` (lag ${r.lagDays} days)` : ""}` });
  for (const r of c.logic.deleted) if (relOn(r) && r.bothRemain) revisions.push({ code: `${r.pred} -> ${r.succ}`, name: "", what: `${r.type} link deleted` });
  for (const r of c.logic.typeChanged) if (relOn(r)) revisions.push({ code: `${r.pred} -> ${r.succ}`, name: "", what: `type ${r.was} to ${r.now}` });
  for (const r of c.activities.added) if (onEither.has(r.code)) revisions.push({ code: r.code, name: r.name, what: `activity added on the driving path (${r.duration ?? "?"} days)` });
  for (const r of c.activities.deleted) if (r.wasCritical) revisions.push({ code: r.code, name: r.name, what: "activity on the driving path deleted" });
  return { progress, revisions };
}

export function windows(updates, opts = {}) {
  if (!Array.isArray(updates) || updates.length < 2) throw new Error("a windows analysis needs at least two updates of the project");
  const warnings = [];
  // the project's ID, from the last-loaded update unless given
  const name = opts.projectName || headerOf(updates[updates.length - 1].xer).name;
  const items = updates.map((u, i) => {
    const h = headerOf(u.xer, name);
    if (name && h.name && h.name !== name) warnings.push(`${u.label || `update ${i + 1}`}: holds no project with ID ${name}; used ${h.name}.`);
    return { ...u, label: u.label || `update ${i + 1}`, ...h };
  });
  items.sort((a, b) => (a.dataDate ?? 0) - (b.dataDate ?? 0));
  for (let i = 1; i < items.length; i++) if (items[i].dataDate === items[i - 1].dataDate) warnings.push(`${items[i - 1].label} and ${items[i].label} have the same data date (${formatDate(items[i].dataDate).slice(0, 10)}): that window has no progress period.`);

  const wins = [];
  for (let i = 1; i < items.length; i++) {
    const A = items[i - 1], B = items[i];
    const c = compare(A.xer, B.xer, { prevProjId: matchingProject(A.xer, B.name, B.projId) ?? A.projId, curProjId: B.projId });
    for (const w of c.warnings) warnings.push(`Window ${i} (${A.label} to ${B.label}): ${w}`);
    const d = drivers(c);
    wins.push({
      n: i,
      from: A.label,
      to: B.label,
      dataDateFrom: c.previous.dataDate,
      dataDateTo: c.current.dataDate,
      workingDays: c.period.workingDays,
      finishFrom: c.previous.finish,
      finishTo: c.current.finish,
      storedFinishFrom: c.previous.storedFinish,
      storedFinishTo: c.current.storedFinish,
      moved: c.finish.moved,
      halfStep: c.finish.halfStep,
      progressEffect: c.finish.progressEffect,
      revisionEffect: c.finish.revisionEffect,
      // the open driving path at the start of the window, first activities first
      pathAtStart: c.criticalPath.previous.slice(0, 8),
      pathLength: c.criticalPath.previous.length,
      drivers: d,
      flags: c.flags,
      counts: { started: c.progress.started.length, finished: c.progress.finished.length, relationshipChanges: c.logic.added.length + c.logic.deleted.length + c.logic.lagChanged.length + c.logic.typeChanged.length, activitiesAdded: c.activities.added.length, activitiesDeleted: c.activities.deleted.length },
      agreement: c.current.agreement,
    });
  }

  // one calendar for the whole-series total: the last update's project
  // calendar, the same one the last window measures on
  const last = schedule(items[items.length - 1].xer);
  const cal = last.projects.get(items[items.length - 1].projId)?.cal;
  const hpd = cal?.hoursPerDay || 8;
  const f0 = parseDate(wins[0].finishFrom), fN = parseDate(wins[wins.length - 1].finishTo);
  const totalMoved = cal && f0 !== null && fN !== null ? round1(cal.workBetween(f0, fN) / 60 / hpd) : null;
  const sum = (k) => (wins.some((w) => w[k] === null) ? null : round1(wins.reduce((s, w) => s + w[k], 0)));
  const total = { moved: totalMoved, sumOfWindows: sum("moved"), progress: sum("progressEffect"), revisions: sum("revisionEffect"), firstFinish: wins[0].finishFrom, lastFinish: wins[wins.length - 1].finishTo };
  if (total.moved !== null && total.sumOfWindows !== null && Math.abs(total.moved - total.sumOfWindows) > 0.15) warnings.push(`The windows add to ${total.sumOfWindows} working days but the finish moved ${total.moved} on the last update's calendar: the updates' project calendars differ, so each window is measured on its own.`);

  // the activities named most often as progress drivers across the windows:
  // where the job lost its time, as a first list to read
  const tally = new Map();
  for (const w of wins) for (const x of w.drivers.progress) {
    if (x.gain) continue;
    const e = tally.get(x.code) || { code: x.code, name: x.name, windows: [], windowDays: 0 };
    if (!e.windows.includes(w.n)) { e.windows.push(w.n); if (w.progressEffect > 0) e.windowDays += w.progressEffect; }
    tally.set(x.code, e);
  }
  const recurring = [...tally.values()].sort((a, b) => b.windows.length - a.windows.length || b.windowDays - a.windowDays).slice(0, 20);

  return {
    project: name,
    updates: items.map((u) => ({ label: u.label, dataDate: formatDate(u.dataDate) })),
    windows: wins,
    total,
    recurring,
    warnings,
  };
}

const sgn = (d) => (d === null || d === undefined ? "n/a" : `${d > 0 ? "+" : ""}${d}`);

export function windowsText(rep, { limit = 8 } = {}) {
  const L = [];
  L.push(`${rep.project}: windows analysis over ${rep.updates.length} updates (${rep.updates[0].dataDate.slice(0, 10)} to ${rep.updates[rep.updates.length - 1].dataDate.slice(0, 10)})`);
  for (const w of rep.warnings) L.push(`WARNING: ${w}`);
  const t = rep.total;
  L.push(`Forecast finish ${t.firstFinish.slice(0, 10)} -> ${t.lastFinish.slice(0, 10)}: ${sgn(t.moved)} working days (windows add to ${sgn(t.sumOfWindows)}; progress ${sgn(t.progress)}, revisions ${sgn(t.revisions)})`);
  L.push("");
  L.push("Window  Data dates               Days  Finish moved  Progress  Revisions  Finish at end");
  for (const w of rep.windows) {
    L.push(`${String(w.n).padEnd(7)} ${w.dataDateFrom.slice(0, 10)} to ${w.dataDateTo.slice(0, 10)}  ${String(w.workingDays ?? "?").padStart(4)}  ${sgn(w.moved).padStart(12)}  ${sgn(w.progressEffect).padStart(8)}  ${sgn(w.revisionEffect).padStart(9)}  ${w.finishTo.slice(0, 10)}`);
  }
  for (const w of rep.windows) {
    L.push("", `Window ${w.n}: ${w.from} to ${w.to}, finish ${sgn(w.moved)} (progress ${sgn(w.progressEffect)}, revisions ${sgn(w.revisionEffect)})`);
    L.push(`  Driving path at the start: ${w.pathAtStart.join(", ")}${w.pathLength > w.pathAtStart.length ? `, ... (${w.pathLength} activities)` : ""}`);
    const sec = (title, rows) => {
      if (!rows.length) return;
      L.push(`  ${title}:`);
      for (const r of rows.slice(0, limit)) L.push(`    ${r.code}${r.name ? ` ${r.name}` : ""}: ${r.what}`);
      if (rows.length > limit) L.push(`    ... ${rows.length - limit} more (--json or --csv for all)`);
    };
    sec("On the driving path, progress", w.drivers.progress);
    sec("Revisions touching the driving path", w.drivers.revisions);
  }
  if (rep.recurring.length) {
    L.push("", "Named in the most windows (progress on the driving path):");
    for (const r of rep.recurring.slice(0, 10)) L.push(`  ${r.code} ${r.name}: windows ${r.windows.join(", ")}`);
  }
  return L.join("\n") + "\n";
}

export function windowsCsv(rep) {
  const q = (v) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["window", "from", "to", "data_date_from", "data_date_to", "working_days", "finish_from", "finish_to", "moved", "half_step", "progress", "revisions", "kind", "activity", "name", "detail"]];
  for (const w of rep.windows) {
    const base = [w.n, w.from, w.to, w.dataDateFrom, w.dataDateTo, w.workingDays, w.finishFrom, w.finishTo, w.moved, w.halfStep, w.progressEffect, w.revisionEffect];
    rows.push([...base, "window", "", "", ""]);
    for (const x of w.drivers.progress) rows.push([...base, "progress", x.code, x.name, x.what]);
    for (const x of w.drivers.revisions) rows.push([...base, "revision", x.code, x.name, x.what]);
  }
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
