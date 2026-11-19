// A look-ahead schedule from the recomputed CPM (cpm.mjs): the work the next
// few weeks hold, by WBS, a day-by-day bar for each activity on its own
// calendar, and a make-ready check that says what each activity still waits on.
//
// lookahead(xer, { weeks = 3, projId, from, result }) -> {
//   project: { id, code, name, dataDate }, weeks, from, through, days: [{ day, date, weekday }],
//   activities: [{ id, code, name, wbs, wbsKey, status, start, finish, startMin, finishMin,
//     remainingHours, tf, ff, critical, resources, constraints, bars: "", ready,
//     waitsOn: [{ code, name, type, lag, state, inLookahead, driving, date }],
//     drivenBy, note }],
//   summary: { activities, inProgress, starting, finishing, critical, ready, waiting,
//     waitingOutside, noPredecessor, constraint, outOfSequence },
//   warnings
// }
//
// The window runs from the data date (or opts.from, a later date) through
// `weeks` x 7 calendar days counted from that day. An activity is in it when it has working time left inside the
// window by its recomputed dates: in progress (from the data date to its
// early finish) or not started with an early start before the window's end.
// Milestones count when their date falls in the window.
//
// Make-ready (the "constraint analysis" of a weekly work plan, from the
// file's logic alone; materials, crews and permits are the user's to add):
// for each not-started activity, every predecessor link that gates its start
// (FS: the predecessor must finish; SS: start) and is not yet met at the data
// date. `ready` is one of
//   "in progress"     started already;
//   "ready"           every start-gating predecessor is met: it could start
//                     at the data date as far as the logic says;
//   "waits"           gated by work that is itself in this look-ahead;
//   "waits outside"   gated by work not in this look-ahead (another project's
//                     activity, or one the window does not reach): the
//                     dates depend on something this list does not show;
//   "no predecessor"  nothing gates its start (an open start: the date is
//                     held only by the data date, a constraint or the
//                     project start, a logic gap DCMA point 1 counts).
// A link that is met but whose lag is still running at the data date (a
// cure, a notice period) gates the start too, state "lag running", and
// counts as look-ahead work when the lag ends inside the window. FF and SF
// links do not gate a start; they are listed with state "finish tie". `drivenBy` names what sets the early start: the driving link
// (zero relationship float, floatpaths.mjs), else a start constraint, else
// the data date. A started activity with an FS predecessor that has not
// finished, or an SS predecessor that has not started, is out of sequence
// (`note`).
//
// lookaheadText, lookaheadCsv and lookaheadHtml print it: the HTML is a
// self-contained page for a site meeting (landscape, one row per activity,
// a cell per day), printed to PDF from the browser like the written review.

import { schedule, lagCalendar } from "./cpm.mjs";
import { relationshipFloat } from "./floatpaths.mjs";
import { formatDate, parseDate } from "./xer.mjs";

const DAY = 1440;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CSTR = { CS_MSO: "start on", CS_MSOA: "start on or after", CS_MSOB: "start on or before", CS_MEO: "finish on", CS_MEOA: "finish on or after", CS_MEOB: "finish on or before", CS_MANDSTART: "mandatory start", CS_MANDFIN: "mandatory finish", CS_ALAP: "as late as possible", CS_SNLF: "start no later than", CS_FNLF: "finish no later than" };
const START_CSTR = new Set(["CS_MSO", "CS_MSOA", "CS_MANDSTART"]);
const LINK = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
// own keys only: a file value such as "constructor" must not find Object.prototype
const own = (map, k, fallback) => (Object.hasOwn(map, k) ? map[k] : fallback);
const r2 = (v) => (v === undefined || v === null ? null : Math.round(v * 100) / 100);
const dateOnly = (min) => formatDate(min).slice(0, 10);

function pickProject(result, projId) {
  if (projId && result.projects.has(projId)) return result.projects.get(projId);
  const counts = new Map();
  for (const t of result.model.tasks.values()) if (!t.span && t.status !== "TK_Complete") counts.set(t.proj, (counts.get(t.proj) || 0) + 1);
  let best = null;
  for (const p of result.projects.values()) if (!best || (counts.get(p.id) || 0) > (counts.get(best.id) || 0)) best = p;
  return best;
}

// WBS path text ("Level 1 / Drywall", the project's own root node left out)
// and a sort key that follows the WBS tree in P6's order (seq_num at each
// level, then the short name), so the look-ahead reads like the project's
// own layout grouped by WBS.
function wbsPaths(xer) {
  const rows = new Map((xer.tables.PROJWBS || []).map((w) => [w.wbs_id, w]));
  const memo = new Map();
  const info = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    const w = rows.get(id);
    if (!w || seen.has(id)) return { path: "", key: "" };
    seen.add(id);
    const own = w.proj_node_flag === "Y" ? "" : (w.wbs_name || w.wbs_short_name || "");
    const up = w.parent_wbs_id ? info(w.parent_wbs_id, seen) : { path: "", key: "" };
    const seq = Number(w.seq_num);
    const part = `${String(Number.isFinite(seq) ? Math.max(0, Math.round(seq)) : 0).padStart(10, "0")}:${w.wbs_short_name || ""}:${w.wbs_id}`;
    const out = { path: [up.path, own].filter(Boolean).join(" / "), key: `${up.key}/${part}` };
    memo.set(id, out);
    return out;
  };
  return info;
}

function resourcesByTask(xer) {
  const names = new Map((xer.tables.RSRC || []).map((r) => [r.rsrc_id, r.rsrc_name || r.rsrc_short_name || r.rsrc_id]));
  const out = new Map();
  for (const a of xer.tables.TASKRSRC || []) {
    const n = names.get(a.rsrc_id);
    if (!n) continue;
    if (!out.has(a.task_id)) out.set(a.task_id, []);
    if (!out.get(a.task_id).includes(n)) out.get(a.task_id).push(n);
  }
  return out;
}

export function lookahead(xer, opts = {}) {
  const weeks = Math.max(1, Math.min(26, Math.round(Number(opts.weeks) || 3)));
  const result = opts.result || schedule(xer);
  const { model, tasks: res } = result;
  const p = pickProject(result, opts.projId);
  const warnings = [];
  if (!p) return { project: null, weeks, activities: [], days: [], summary: null, warnings: ["no project in the file"] };
  const dd = p.dataDate;
  // opts.from: a later window start (a date string or minutes), for planning
  // a future week; what is met or open is still read at the data date
  let from = dd;
  if (opts.from !== undefined && opts.from !== null && opts.from !== "") {
    const f = typeof opts.from === "number" ? opts.from : parseDate(String(opts.from).length === 10 ? `${opts.from} 00:00` : String(opts.from));
    if (f === null || !Number.isFinite(f)) warnings.push(`window start ${opts.from} does not read as a date; the data date is used`);
    else if (f < dd) warnings.push(`window start ${opts.from} is before the data date; the data date is used`);
    else from = f;
  }
  const firstDay = Math.floor(from / DAY);
  const to = (firstDay + weeks * 7) * DAY, lastDay = firstDay + weeks * 7 - 1;
  const days = [];
  for (let d = firstDay; d <= lastDay; d++) days.push({ day: d, date: dateOnly(d * DAY), weekday: WEEKDAY[(((d + 4) % 7) + 7) % 7] });
  const wbs = wbsPaths(xer), rsrc = resourcesByTask(xer);
  const isMile = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";

  // pass 1: who is in the window
  const inWin = new Map();
  for (const t of model.tasks.values()) {
    if (t.proj !== p.id || t.span || t.status === "TK_Complete") continue;
    const r = res.get(t.id);
    if (!r || r.ef === undefined || !Number.isFinite(r.ef)) continue;
    const s = t.status === "TK_Active" ? Math.max(dd, r.remES ?? r.es) : (r.remES ?? r.es);
    const zero = isMile(t) || r.ef <= s;
    const hit = zero ? s >= from && s < to : s < to && r.ef > from;
    if (hit) inWin.set(t.id, { t, r, s, zero });
  }

  const activities = [];
  for (const { t, r, s, zero } of inWin.values()) {
    // the day bars: a cell is worked when the calendar has working time in it
    // between the activity's remaining start and its early finish
    let bars = "";
    for (const { day } of days) {
      const a = day * DAY, b = a + DAY;
      if (zero) bars += Math.floor(s / DAY) === day ? "M" : (t.cal.workBetween(a, b) > 0 ? "." : " ");
      else {
        const lo = Math.max(a, s, from), hi = Math.min(b, r.ef);
        bars += hi > lo && t.cal.workBetween(lo, hi) > 0 ? "#" : t.cal.workBetween(a, b) > 0 ? "." : " ";
      }
    }
    const waitsOn = [];
    let outOfSeq = [];
    let driving = null;
    // links from an activity this file does not hold (another project's)
    // are left out of t.preds by buildModel; they still gate the start
    const preds = [...t.preds, ...model.rels.filter((rel) => rel.external && rel.succId === t.id)];
    for (const rel of preds) {
      const pr = model.tasks.get(rel.predId);
      const type = own(LINK, rel.type, rel.type);
      if (!pr) { waitsOn.push({ code: rel.predId, name: "(not in this file)", type, lag: r2(rel.lag / 60), state: "external", inLookahead: false, driving: false, date: null }); continue; }
      if (pr.span) continue;
      const pv = res.get(pr.id);
      const doneP = pr.status === "TK_Complete", started = doneP || pr.status === "TK_Active";
      let state;
      if (type === "FS") state = doneP ? "met" : "waits for finish";
      else if (type === "SS") state = started ? "met" : "waits for start";
      else state = "finish tie";
      // a met link whose lag is still running at the data date (a cure, a
      // notice period) gates the start until the lag ends
      let lagEnd = null;
      if (state === "met" && rel.lag > 0) {
        const base = type === "FS" ? pr.actEnd : pr.actStart;
        if (base !== null && base !== undefined) {
          const e = lagCalendar(model, rel).addWork(base, rel.lag);
          if (e > dd) { state = "lag running"; lagEnd = e; }
        }
      }
      const rf = relationshipFloat(result, rel);
      const drv = rf !== null && Math.abs(rf) < 0.5 && !doneP;
      const date = pv && pv.ef !== undefined ? formatDate(type === "SS" ? (pv.remES ?? pv.es) : pv.ef) : null;
      const item = { code: pr.code, name: pr.name, type, lag: r2(rel.lag / 60), state, inLookahead: lagEnd !== null ? lagEnd < to : inWin.has(pr.id), driving: drv, date: lagEnd !== null ? formatDate(lagEnd) : doneP ? null : date };
      waitsOn.push(item);
      // the link that sets the start: FS first, then SS, then a finish tie
      // (an FF or SF link that drives sets the finish, and the start with it)
      const rank = (k) => ({ FS: 0, SS: 1, FF: 2, SF: 3 }[k] ?? 4);
      if (drv && (!driving || rank(type) < rank(driving.type))) driving = item;
      if (t.status === "TK_Active" && state.startsWith("waits")) outOfSeq.push(`${type} from ${pr.code}`);
    }
    const gating = waitsOn.filter((w) => w.state.startsWith("waits") || w.state === "lag running" || w.state === "external");
    let ready;
    const gates = waitsOn.some((w) => w.type === "FS" || w.type === "SS" || w.state === "external");
    if (t.status === "TK_Active") ready = "in progress";
    else if (!gates) ready = "no predecessor"; // FF and SF ties do not gate a start
    else if (!gating.length) ready = "ready";
    else if (gating.every((w) => w.inLookahead)) ready = "waits";
    else ready = "waits outside";
    const cs = t.cstr.filter((c) => c.type).map((c) => `${own(CSTR, c.type, c.type)}${c.date !== null && c.date !== undefined ? ` ${formatDate(c.date)}` : ""}`);
    let drivenBy;
    if (t.status === "TK_Active") drivenBy = "started";
    else if (driving) drivenBy = `${driving.type}${driving.lag ? ` ${driving.lag} h` : ""} from ${driving.code}`;
    else {
      const sc = t.cstr.find((c) => START_CSTR.has(c.type) && c.date !== null && Math.abs(c.date - s) < 1 + DAY);
      drivenBy = sc ? `constraint: ${own(CSTR, sc.type, sc.type)} ${formatDate(sc.date)}` : s <= t.cal.nextStart(dd) + 1 ? "data date" : p.plannedStart !== null && p.plannedStart !== undefined && s <= t.cal.nextStart(p.plannedStart) + 1 ? "project planned start" : "a lag or calendar";
    }
    activities.push({
      id: t.id, code: t.code, name: t.name, wbs: wbs(t.wbs).path, wbsKey: wbs(t.wbs).key, status: t.status === "TK_Active" ? "in progress" : "not started",
      start: formatDate(t.status === "TK_Active" ? (t.actStart ?? s) : s), finish: formatDate(r.ef), startMin: s, finishMin: r.ef,
      remainingHours: r2(t.cal.workBetween(s, r.ef) / 60), tf: r2(r.tf), ff: r2(r.ff), critical: r.tf !== undefined && r.tf <= 0.005,
      resources: rsrc.get(t.id) || [], constraints: cs, bars, ready, waitsOn, drivenBy,
      finishesInWindow: r.ef <= to,
      note: outOfSeq.length ? `out of sequence: started before ${outOfSeq.join(", ")}` : "",
    });
  }
  activities.sort((a, b) => (a.wbsKey < b.wbsKey ? -1 : a.wbsKey > b.wbsKey ? 1 : a.startMin - b.startMin || a.finishMin - b.finishMin || (a.code < b.code ? -1 : 1)));
  const n = (f) => activities.filter(f).length;
  const summary = {
    activities: activities.length,
    inProgress: n((a) => a.status === "in progress"),
    starting: n((a) => a.status === "not started"),
    finishing: n((a) => a.finishesInWindow),
    critical: n((a) => a.critical),
    ready: n((a) => a.ready === "ready"),
    waiting: n((a) => a.ready === "waits"),
    waitingOutside: n((a) => a.ready === "waits outside"),
    noPredecessor: n((a) => a.ready === "no predecessor"),
    constraint: n((a) => a.drivenBy.startsWith("constraint")),
    outOfSequence: n((a) => a.note.startsWith("out of sequence")),
  };
  if (!activities.length) {
    let next = null;
    for (const t of model.tasks.values()) {
      if (t.proj !== p.id || t.span || t.status === "TK_Complete") continue;
      const r = res.get(t.id);
      if (r && Number.isFinite(r.remES) && r.remES >= to && (next === null || r.remES < next)) next = r.remES;
    }
    warnings.push(`no open activity has work between ${formatDate(from)} and ${formatDate(to)}${next !== null ? `; the next work starts ${formatDate(next)} (a later window start shows it)` : ""}`);
  }
  return { project: { id: p.id, code: p.code, name: (xer.tables.PROJECT || []).find((r) => r.proj_id === p.id)?.proj_name || "", dataDate: formatDate(dd) }, weeks, from: formatDate(from), through: days.length ? days[days.length - 1].date : null, days, activities, summary, warnings };
}

const READY_TEXT = { "in progress": "in progress", ready: "ready", waits: "waits on look-ahead work", "waits outside": "waits on work outside the look-ahead", "no predecessor": "no predecessor (open start)" };
const waitText = (a) => a.waitsOn.filter((w) => w.state !== "met").map((w) => `${w.code} ${w.type}${w.lag ? ` ${w.lag} h` : ""} (${w.state}${w.date ? ` ${w.date}` : ""})`).join("; ");

export function lookaheadText(la) {
  if (!la.project) return "No project in the file.\n";
  const s = la.summary;
  const out = [`${la.weeks}-week look-ahead: ${la.project.code || la.project.id}, ${la.from} through ${la.through}`,
    `${s.activities} activities with work in the window: ${s.inProgress} in progress, ${s.starting} to start, ${s.finishing} to finish; ${s.critical} critical.`,
    `Make-ready (logic only): ${s.ready} ready, ${s.waiting} wait on look-ahead work, ${s.waitingOutside} wait on work outside it, ${s.noPredecessor} with no predecessor, ${s.constraint} held by a constraint, ${s.outOfSequence} out of sequence.`, ""];
  const header = "            " + la.days.map((d) => d.weekday[0]).join("");
  let wbs = null;
  for (const a of la.activities) {
    if (a.wbsKey !== wbs) { wbs = a.wbsKey; out.push("", `== ${a.wbs || "(no WBS)"}`, header); }
    out.push(`${a.code.padEnd(11).slice(0, 11)} ${a.bars}  ${a.name}  [${a.start} to ${a.finish}, TF ${a.tf ?? "-"} h${a.critical ? ", critical" : ""}] ${own(READY_TEXT, a.ready, a.ready)}${a.ready !== "in progress" ? `, driven by ${a.drivenBy}` : ""}${waitText(a) ? `: ${waitText(a)}` : ""}${a.note ? `; ${a.note}` : ""}`);
  }
  for (const w of la.warnings) out.push(`warning: ${w}`);
  out.push("", "# = working on that day, . = a working day it is not on, M = milestone, blank = non-working day.");
  return out.join("\n") + "\n";
}

export function lookaheadCsv(la) {
  const q = (v) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["wbs", "activity", "name", "status", "start", "finish", "remaining (h)", "total float (h)", "free float (h)", "critical", "make-ready", "driven by", "waits on", "resources", "constraints", "note", ...la.days.map((d) => d.date)];
  const lines = [head.map(q).join(",")];
  for (const a of la.activities) lines.push([a.wbs, a.code, a.name, a.status, a.start, a.finish, a.remainingHours, a.tf, a.ff, a.critical ? "Y" : "N", own(READY_TEXT, a.ready, a.ready), a.ready === "in progress" ? "" : a.drivenBy, waitText(a), a.resources.join("; "), a.constraints.join("; "), a.note, ...[...a.bars].map((c) => (c === "#" ? "x" : c === "M" ? "M" : ""))].map(q).join(","));
  return lines.join("\n") + "\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function lookaheadHtml(la, meta = {}) {
  const title = `${la.weeks}-week look-ahead: ${la.project ? la.project.code || la.project.id : ""}`;
  if (!la.project) return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><p>No project in the file.</p>`;
  const s = la.summary;
  const dayHead = la.days.map((d) => `<th class="d${d.weekday === "Sun" || d.weekday === "Sat" ? " we" : ""}" title="${esc(d.date)}">${esc(d.weekday[0])}<br>${esc(d.date.slice(8))}</th>`).join("");
  const weekHead = [];
  for (let i = 0; i < la.days.length; i += 7) weekHead.push(`<th class="wk" colspan="${Math.min(7, la.days.length - i)}">Week of ${esc(la.days[i].date)}</th>`);
  let body = "", wbs = null;
  const cols = 6 + la.days.length;
  for (const a of la.activities) {
    if (a.wbsKey !== wbs) { wbs = a.wbsKey; body += `<tr class="g"><td colspan="${cols}">${esc(a.wbs || "(no WBS)")}</td></tr>`; }
    const cells = [...a.bars].map((c) => `<td class="c ${c === "#" ? (a.critical ? "on crit" : "on") : c === "M" ? "ms" : c === "." ? "" : "off"}">${c === "M" ? "&#9670;" : ""}</td>`).join("");
    const wait = waitText(a);
    body += `<tr><td class="code">${esc(a.code)}</td><td>${esc(a.name)}${a.resources.length ? `<div class="sub">${esc(a.resources.join(", "))}</div>` : ""}</td><td class="dt">${esc(a.start)}</td><td class="dt">${esc(a.finish)}</td><td class="n">${a.tf ?? ""}</td><td class="mr ${a.ready.replace(/ /g, "-")}">${esc(own(READY_TEXT, a.ready, a.ready))}${a.ready !== "in progress" ? `<div class="sub">driven by ${esc(a.drivenBy)}</div>` : ""}${wait ? `<div class="sub">${esc(wait)}</div>` : ""}${a.note ? `<div class="sub warn">${esc(a.note)}</div>` : ""}${a.constraints.length ? `<div class="sub">${esc(a.constraints.join("; "))}</div>` : ""}</td>${cells}</tr>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{color-scheme:light}body{font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1f24;background:#fff;margin:16px}
h1{font-size:18px;margin:0 0 4px}p{margin:4px 0}.note{color:#555}
table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #c9ced6;padding:3px 4px;vertical-align:top;text-align:left}
th{background:#eef1f5;font-weight:600}th.d,td.c{width:18px;min-width:18px;padding:0;text-align:center;vertical-align:middle}th.we,td.off{background:#f1f1f1}
td.on{background:#4a78c2}td.crit{background:#c0392b}td.ms{color:#c0392b;font-size:13px}tr.g td{background:#dde4ee;font-weight:600}
td.code{white-space:nowrap;font-weight:600}td.dt{white-space:nowrap}td.n{text-align:right}.sub{color:#555;font-size:11px}.warn{color:#a3530b}
td.mr.ready{background:#e6f4ea}td.mr.waits-outside,td.mr.no-predecessor{background:#fdf0e1}th.wk{text-align:center}
@media print{@page{size:landscape;margin:10mm}body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}
</style></head><body>
<h1>${esc(title)}</h1>
<p>${[la.project.name, `data date ${la.project.dataDate}`, `window ${la.from} through ${la.through}`, meta.by ? `prepared by ${meta.by}` : ""].filter(Boolean).map(esc).join(" &middot; ")}</p>
<p><b>${s.activities}</b> activities with work in the window: ${s.inProgress} in progress, ${s.starting} to start, ${s.finishing} to finish, ${s.critical} critical (red bars).
Make-ready from the logic: <b>${s.ready}</b> ready, ${s.waiting} waiting on work in this look-ahead, ${s.waitingOutside} waiting on work outside it, ${s.noPredecessor} with no predecessor, ${s.outOfSequence} out of sequence.</p>
<p class="note">Dates are recomputed from the file's logic, durations and calendars (early dates). "Ready" means every predecessor that gates the start has finished (FS) or started (SS) at the data date; crews, materials, information and permits are not in the file and are the meeting's to check.</p>
<table><thead><tr><th rowspan="2">Activity</th><th rowspan="2">Name</th><th rowspan="2">Start</th><th rowspan="2">Finish</th><th rowspan="2">TF (h)</th><th rowspan="2">Make-ready</th>${weekHead.join("")}</tr><tr>${dayHead}</tr></thead><tbody>${body}</tbody></table>
${la.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join("")}
<p class="note">Made with XER Schedule Check (MIT). Not professional advice: check dates against the scheduling software of record before acting on them.</p>
</body></html>`;
}
