// Schedule health across a series of P6 XER updates of one project: the
// month-by-month quality trend an owner's scheduler or a lender's monitor
// keeps (and that paid schedule-analytics subscriptions sell), built from the
// single-file assessment in dcma.mjs.
//
// trend([{ xer, label }], { projectName }) -> report (plain JSON)
//
// Per update, in data-date order: the 14 DCMA points (value, pass, count),
// the forecast finish, how many open activities sit on zero or negative
// float and within 10 working days of it, and how much of the previous
// update's driving path is still the driving path ("path kept": a path that
// changes every month is a schedule nobody can manage to).
//
// Two measures need more than one file, so a single-file check cannot give
// them honestly:
//
// - Missed tasks and BEI against the FIRST update in the series as the
//   baseline. dcma.mjs uses each file's own planned dates, which P6 resets to
//   the early dates on every schedule run for unstarted work, so overdue work
//   never counts as missed there (quality audit 2026-11-19). Here an
//   activity's baseline finish is its actual finish if the first update had
//   it finished, else the first update's recomputed early finish; it is "due"
//   in a later update when that date is on or before the update's data date.
//   Activities added after the first update have no baseline and are left
//   out (counted in `added`).
// - Float erosion: for every activity open in the last update and present in
//   at least three updates, its total float (recomputed, working days of its
//   own calendar) in each update, the loss per calendar month fitted by least
//   squares, and, when it is still positive and falling, the months until it
//   reaches zero at that rate. Those are the activities about to join the
//   critical path, named before they do.
//
// It also lists, per update, the activities that newly fail each DCMA point
// (failed it in this update and not in the previous one): what got worse
// this month, by name.

import { assess } from "./dcma.mjs";
import { schedule, drivingPath } from "./cpm.mjs";
import { parseDate, formatDate } from "./xer.mjs";
import { pickProject } from "./compare.mjs";

const round1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const round3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const MONTH = 30.4375 * 24 * 60; // minutes in an average calendar month
const NEAR = 10; // working days of float counted as near-critical

function projectOf(xer, result, name) {
  const rows = xer.tables.PROJECT || [];
  let row = name ? rows.find((r) => r.proj_short_name === name) : null;
  if (!row) {
    const p = pickProject(xer, result.model, null);
    row = rows.find((r) => r.proj_id === p?.id) || rows[0] || null;
  }
  return row;
}

export function trend(updates, opts = {}) {
  if (!Array.isArray(updates) || updates.length < 2) throw new Error("a trend needs at least two updates of the project");
  const warnings = [];
  const runs = updates.map((u, i) => ({ ...u, label: u.label || `update ${i + 1}`, result: schedule(u.xer) }));
  const lastRun = runs[runs.length - 1];
  const name = opts.projectName || projectOf(lastRun.xer, lastRun.result, null)?.proj_short_name || "";
  for (const r of runs) {
    const row = projectOf(r.xer, r.result, name);
    if (!row) throw new Error(`${r.label}: the file has no PROJECT table`);
    if (name && row.proj_short_name !== name) warnings.push(`${r.label}: holds no project with ID ${name}; used ${row.proj_short_name}.`);
    r.projId = row.proj_id;
    r.dataDate = parseDate(row.last_recalc_date) ?? parseDate(row.plan_start_date);
  }
  runs.sort((a, b) => (a.dataDate ?? 0) - (b.dataDate ?? 0));
  for (let i = 1; i < runs.length; i++) if (runs[i].dataDate === runs[i - 1].dataDate) warnings.push(`${runs[i - 1].label} and ${runs[i].label} have the same data date (${formatDate(runs[i].dataDate).slice(0, 10)}).`);

  // the baseline: the first update's finish for each activity, by activity ID
  const first = runs[0];
  const baseline = new Map();
  for (const t of first.result.model.tasks.values()) {
    if (t.proj !== first.projId || t.span || t.type === "TT_Mile" || t.type === "TT_FinMile") continue;
    const ef = t.actEnd ?? first.result.tasks.get(t.id)?.ef ?? null;
    if (ef !== null && ef !== undefined) baseline.set(t.code, ef);
  }

  const rows = [];
  const floatSeries = new Map(); // code -> [{ at, days }]
  let prevFail = null, prevPath = null;
  for (const r of runs) {
    const rep = assess(r.xer, { result: r.result, projId: r.projId });
    const { model, tasks: res } = r.result;
    const p = r.result.projects.get(r.projId);
    const open = [...model.tasks.values()].filter((t) => t.proj === r.projId && !t.span && t.status !== "TK_Complete");
    let critical = 0, negative = 0, near = 0;
    for (const t of open) {
      const v = res.get(t.id);
      if (!v || v.tf === undefined || v.tf === null) continue;
      const days = v.tf / (t.cal.hoursPerDay || 8);
      if (days < 0) negative++;
      if (days <= 0) critical++;
      else if (days <= NEAR) near++;
      const s = floatSeries.get(t.code) || [];
      s.push({ at: r.dataDate, days: round1(days), label: r.label, ef: v.ef, lf: v.lf, hpd: t.cal.hoursPerDay || 8, cal: t.cal });
      floatSeries.set(t.code, s);
    }
    const path = drivingPath(r.result, r.projId).map((id) => model.tasks.get(id).code);
    // of the previous driving path's activities still open now, how many are
    // still on the driving path
    let pathKept = null;
    if (prevPath) {
      const openCodes = new Set(open.map((t) => t.code));
      const still = prevPath.filter((c) => openCodes.has(c));
      const now = new Set(path);
      pathKept = still.length ? round3(still.filter((c) => now.has(c)).length / still.length) : null;
    }
    // baseline execution against the first update
    const byCode = new Map();
    for (const t of model.tasks.values()) if (t.proj === r.projId && !t.span) byCode.set(t.code, t);
    let due = 0, dueDone = 0, done = 0, added = 0;
    const missed = [];
    for (const t of byCode.values()) {
      if (t.type === "TT_Mile" || t.type === "TT_FinMile") continue;
      const b = baseline.get(t.code);
      if (b === undefined) { added++; continue; }
      if (t.status === "TK_Complete") done++;
      if (r.dataDate !== null && b <= r.dataDate) {
        due++;
        if (t.actEnd !== null && t.actEnd <= b) dueDone++;
        else missed.push({ code: t.code, name: t.name, why: t.actEnd === null ? `baseline finish ${formatDate(b).slice(0, 10)}, not finished` : `baseline finish ${formatDate(b).slice(0, 10)}, finished ${formatDate(t.actEnd).slice(0, 10)}` });
      }
    }
    const bei = due ? round3(done / due) : null;
    // what newly fails each point
    const fail = new Map();
    for (const c of rep.checks) if (c.id !== 13 && c.id !== 14) fail.set(c.id, new Set(c.items.map((x) => x.code)));
    for (const c of rep.extra) if (c.pass === false && c.items) fail.set(c.id, new Set(c.items.map((x) => x.code)));
    const newly = [];
    if (prevFail) {
      const names = new Map([...rep.checks, ...rep.extra].map((c) => [c.id, c.name]));
      for (const [id, codes] of fail) {
        const was = prevFail.get(id) || new Set();
        const fresh = [...codes].filter((c) => !was.has(c));
        if (fresh.length) newly.push({ id, name: names.get(id), count: fresh.length, codes: fresh.slice(0, 50) });
      }
    }
    rows.push({
      label: r.label,
      dataDate: formatDate(r.dataDate),
      finish: formatDate(p?.finish ?? null),
      storedFinish: formatDate(p?.storedFinish ?? null),
      passed: rep.passed,
      points: rep.checks.map((c) => ({ id: c.id, name: c.name, value: c.value, unit: c.unit, pass: c.pass, count: c.count, total: c.total })),
      open: open.length,
      critical, negative, nearCritical: near,
      drivingPath: path.length,
      pathKept,
      baselineExecution: { due, finishedOnTime: dueDone, finished: done, bei, missed: missed.length, missedItems: missed.slice(0, 200), added },
      newlyFailing: newly,
    });
    prevFail = fail;
    prevPath = path;
  }

  // finish movement in working days of the last update's project calendar
  const cal = lastRun.result.projects.get(lastRun.projId)?.cal;
  const hpd = cal?.hoursPerDay || 8;
  for (let i = 0; i < rows.length; i++) {
    const f = parseDate(rows[i].finish), f0 = i ? parseDate(rows[i - 1].finish) : null;
    rows[i].finishMoved = cal && f !== null && f0 !== null ? round1((f >= f0 ? 1 : -1) * cal.workBetween(Math.min(f, f0), Math.max(f, f0)) / 60 / hpd) : null;
  }

  // float erosion: activities open at the end, seen in 3+ updates
  const lastCodes = new Set(floatSeries.keys());
  const lastOpen = new Set([...lastRun.result.model.tasks.values()].filter((t) => t.proj === lastRun.projId && !t.span && t.status !== "TK_Complete").map((t) => t.code));
  const names = new Map([...lastRun.result.model.tasks.values()].map((t) => [t.code, t.name]));
  const erosion = [];
  for (const code of lastCodes) {
    if (!lastOpen.has(code)) continue;
    const s = floatSeries.get(code).filter((x) => x.days !== null && x.at !== null);
    if (s.length < 3 || s[s.length - 1].label !== rows[rows.length - 1].label) continue;
    const xs = s.map((x) => x.at / MONTH), ys = s.map((x) => x.days);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
    if (sxx === 0) continue;
    const slope = sxy / sxx; // working days of float per calendar month
    const now = ys[ys.length - 1];
    const lost = round1(ys[0] - now);
    if (!(slope < -0.05) || lost <= 0) continue;
    // where the float went, in working days of the activity's calendar: its
    // own forecast finish moving later (it slipped, or work before it did),
    // or its late finish moving earlier (work after it tightened, or, for
    // work under way whose only successors are start-to-start, P6's rule
    // that the late finish is the successor's late start less the lag plus
    // the remaining duration, which pulls in as the remaining shrinks)
    const a = s[0], z = s[s.length - 1], c = z.cal;
    const wd = (x, y) => (x === undefined || y === undefined || x === null || y === null ? null : round1((y >= x ? 1 : -1) * c.workBetween(Math.min(x, y), Math.max(x, y)) / 60 / z.hpd));
    const finishLater = wd(a.ef, z.ef), lateFinishEarlier = wd(z.lf, a.lf);
    const cause = finishLater !== null && finishLater > 0.05 ? (lateFinishEarlier > 0.05 ? "both" : "finish later") : lateFinishEarlier > 0.05 ? "late finish earlier" : "calendar";
    erosion.push({ code, name: names.get(code) || "", float: s.map((x) => x.days), floatNow: now, lost, perMonth: round1(slope), monthsToZero: now > 0 ? round1(now / -slope) : 0, finishLater, lateFinishEarlier, cause });
  }
  // still positive first (about to join the critical path), soonest to zero
  // first; then those already at or below zero, most lost first
  erosion.sort((a, b) => (b.floatNow > 0) - (a.floatNow > 0) || (a.floatNow > 0 ? a.monthsToZero - b.monthsToZero : 0) || b.lost - a.lost);

  const firstRow = rows[0], lastRow = rows[rows.length - 1];
  return {
    project: name,
    baseline: firstRow.label,
    updates: rows,
    summary: {
      passedFirst: firstRow.passed, passedLast: lastRow.passed,
      finishFirst: firstRow.finish, finishLast: lastRow.finish,
      finishMoved: rows.slice(1).every((x) => x.finishMoved !== null) ? round1(rows.slice(1).reduce((s, x) => s + x.finishMoved, 0)) : null,
      bei: lastRow.baselineExecution.bei,
      criticalFirst: firstRow.critical, criticalLast: lastRow.critical,
      eroding: erosion.filter((e) => e.floatNow > 0).length,
      goneNegative: erosion.filter((e) => e.floatNow < 0).length,
    },
    erosion: erosion.slice(0, 200),
    warnings,
  };
}

const sgn = (d) => (d === null || d === undefined ? "n/a" : `${d > 0 ? "+" : ""}${d}`);
const pctS = (x) => (x === null || x === undefined ? "-" : `${Math.round(x * 100)}%`);

const CAUSE = {
  "finish later": "its own forecast finish moved later",
  "late finish earlier": "its late finish moved earlier (work after it tightened)",
  both: "finish later and late finish earlier",
  calendar: "dates held; calendar arithmetic",
};

export function trendText(rep, { limit = 10 } = {}) {
  const L = [];
  const U = rep.updates, s = rep.summary;
  L.push(`${rep.project}: schedule health over ${U.length} updates (${U[0].dataDate.slice(0, 10)} to ${U[U.length - 1].dataDate.slice(0, 10)}); baseline for BEI: ${rep.baseline}`);
  for (const w of rep.warnings) L.push(`WARNING: ${w}`);
  L.push(`DCMA points passed ${s.passedFirst}/14 -> ${s.passedLast}/14; finish ${s.finishFirst.slice(0, 10)} -> ${s.finishLast.slice(0, 10)} (${sgn(s.finishMoved)} working days); BEI against the first update ${s.bei ?? "n/a"}`);
  L.push(`Critical (float <= 0) ${s.criticalFirst} -> ${s.criticalLast}; ${s.eroding} activities losing float toward zero, ${s.goneNegative} already negative`);
  L.push("");
  L.push("Update                    Data date   Passed  Finish      Moved  Open  Crit  Neg  Near  Path kept  BEI    Missed");
  for (const u of U) L.push(`${u.label.slice(0, 25).padEnd(25)} ${u.dataDate.slice(0, 10)}  ${String(u.passed).padStart(4)}/14 ${u.finish.slice(0, 10)}  ${sgn(u.finishMoved).padStart(5)}  ${String(u.open).padStart(4)}  ${String(u.critical).padStart(4)}  ${String(u.negative).padStart(3)}  ${String(u.nearCritical).padStart(4)}  ${pctS(u.pathKept).padStart(9)}  ${String(u.baselineExecution.bei ?? "-").padEnd(5)}  ${u.baselineExecution.missed}`);
  L.push("", "DCMA point by update (P pass, F fail):");
  for (let i = 0; i < 14; i++) L.push(`  ${String(U[0].points[i].id).padStart(2)} ${U[0].points[i].name.padEnd(36).slice(0, 36)} ${U.map((u) => (u.points[i].pass ? "P" : "F")).join(" ")}`);
  for (const u of U) {
    if (!u.newlyFailing.length) continue;
    L.push("", `${u.label}: newly failing`);
    for (const n of u.newlyFailing) L.push(`  ${n.name}: ${n.count} (${n.codes.slice(0, limit).join(", ")}${n.count > limit ? ", ..." : ""})`);
  }
  if (rep.erosion.length) {
    L.push("", "Float erosion (working days of float by update; loss per month; months to zero at that rate):");
    for (const e of rep.erosion.slice(0, limit * 2)) L.push(`  ${e.code} ${e.name}: ${e.float.join(" -> ")}; ${e.perMonth}/month; ${e.floatNow > 0 ? `zero in ${e.monthsToZero} months` : "already critical"}; ${Object.hasOwn(CAUSE, e.cause) ? CAUSE[e.cause] : e.cause}`);
  }
  return L.join("\n") + "\n";
}

export function trendCsv(rep) {
  const q = (v) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["update", "data_date", "finish", "finish_moved", "dcma_passed", "open", "critical", "negative_float", "near_critical", "driving_path", "path_kept", "bei_vs_first", "due", "missed", "added_since_first"];
  for (let i = 1; i <= 14; i++) head.push(`dcma_${i}_value`, `dcma_${i}_pass`);
  const rows = [head];
  for (const u of rep.updates) {
    const b = u.baselineExecution;
    const r = [u.label, u.dataDate, u.finish, u.finishMoved, u.passed, u.open, u.critical, u.negative, u.nearCritical, u.drivingPath, u.pathKept, b.bei, b.due, b.missed, b.added];
    for (const p of u.points) r.push(p.value, p.pass ? "pass" : "fail");
    rows.push(r);
  }
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
