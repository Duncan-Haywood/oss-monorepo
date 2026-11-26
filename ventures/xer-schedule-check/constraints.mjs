// A constraints log for the look-ahead's make-ready check: the things the
// schedule file does not hold (materials, permits, RFIs, submittals, crews,
// equipment, access) kept as a spreadsheet the site team already has, one row
// per constraint, and merged with the recomputed schedule.
//
// parseConstraintLog(text) -> { items: [{ row, codes, what, type, owner,
//   needByLog, expected, cleared, clearedOn, note }], columns, warnings }
//
// A CSV, tab-separated (pasted from a spreadsheet) or semicolon-separated
// file with a header row. Columns are found by name (see COLUMNS); only the
// activity column is required. One row may name several activities
// ("A1010; A1020"). Dates read as 2025-12-03, 12/3/2025 (US order, or
// day-first when any slash date in the log has a first number over 12), 3-Dec-25, 3 Dec 2025 or an
// Excel day number. "Cleared" is a date (cleared that day), or yes / done /
// closed / x; blank, "open" or "no" is open.
//
// evaluateConstraints(log, ctx) is called by lookahead() with the schedule
// it built. For each row and each activity it names:
//   need by     when the schedule needs it cleared: the activity's remaining
//               early start (the data date for work already started);
//   latest      the late start: cleared after that, the project finish moves;
//   status      "cleared"; "overdue" (open and its expected date has passed);
//               "late" (expected after the need-by day); "no date" (open,
//               nothing promised); "on track" (expected on or before the
//               need-by day); "activity finished" (open against finished
//               work: close it or move it).
// A not-started activity in the look-ahead whose logic says "ready" but has
// an open constraint is "constrained": the Last Planner "sound" test, the
// logic and the log both clear.
//
// What if every open constraint clears on its expected date? Each expected
// date goes to the CPM engine as a start floor on its activities (the same
// floor resource levelling uses, so logic, calendars and other constraints
// still apply) and the project finish is recomputed: the slip it shows is the
// cost of the log as promised. Each late row is also run alone, so the rows
// are ranked by how far each would move the finish by itself (the one to
// chase first).

import { schedule } from "./cpm.mjs";
import { formatDate } from "./xer.mjs";

const DAY = 1440;
// a log for the example schedule (example.mjs), the same as samples/constraints-log.csv
export const EXAMPLE_LOG = "Activity ID,Constraint,Type,Owner,Need by,Expected,Cleared,Notes\nA1060,Asbestos clearance certificate for level 2,Permit,Abatement sub,,2026-04-08,,Air test booked Tue\nA1070,Track and stud delivery,Material,Supplier,,2026-04-14,,Truck confirmed for the 14th\nA1070; A1080,Layout drawings at revision C,Information,Architect,,2026-04-07,2026-04-03,\nA1090,RFI 14: duct route above corridor,RFI,Engineer,2026-04-20,,,No answer yet\nA1040,Door hardware schedule approved,Submittal,Architect,,2026-04-06,,\nA1100,Mechanical crew of 4,Crew,MEP sub,,2026-05-04,,Crew on another job until 1 May\n";
export const COLUMNS = {
  activity: /^(activity|activity ?(id|code|ids|codes|no\.?|number)|act(ivity)?[ _-]?id|task|task ?(id|code)|id|code|activities)$/,
  what: /^(constraint|constraints|description|item|issue|what|title|subject|requirement|need)$/,
  type: /^(type|category|kind|class)$/,
  owner: /^(owner|responsible|who|by|assigned|assigned to|ball in court|action by|responsible party)$/,
  needBy: /^(need(ed)? ?by|required ?by|due|due date|required)$/,
  expected: /^(expected|expected ?(clear|date|by|on|clear date)|forecast|forecast date|promised|promise date|eta|delivery|delivery date|clears?|clears? (on|by)|clear date|target|target date)$/,
  cleared: /^(cleared|cleared ?(on|date)|done|closed|closed ?(on|date)|removed|status|complete|completed)$/,
  note: /^(notes?|comments?|remarks?)$/,
};
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const YES = /^(y|yes|x|done|closed|cleared|complete|completed|removed|true|ok|✓|✔)$/i;
const NO = /^(n|no|open|pending|outstanding|false|-|tbd|tbc)?$/i;

export function splitRows(text) {
  const s = String(text ?? "").replace(/^\uFEFF/, "");
  const first = s.split(/\r?\n/, 1)[0] || "";
  const delim = first.includes("\t") ? "\t" : !first.includes(",") && first.includes(";") ? ";" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}

// minutes (xer.mjs's clock) of a date the way people type them, or null.
// order: "dmy" reads 03/12/2025 as 3 December, "mdy" as March 12; left out,
// each value decides alone (US order unless the first number is over 12).
export function parseLogDate(v, order) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const at = (y, m, d, hh = 0, mm = 0) => {
    if (y < 100) y += 2000;
    if (m < 0 || m > 11 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
    const t = Date.UTC(y, m, d, hh, mm);
    return new Date(t).getUTCDate() === d ? t / 60000 : null;
  };
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)(?:[ T](\d{1,2}):(\d{2}))?/.exec(s))) return at(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})(?!\d)(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s))) {
    let a = +m[1], b = +m[2];
    if (order === "dmy" ? b <= 12 : order !== "mdy" && a > 12 && b <= 12) [a, b] = [b, a]; // day first
    return at(+m[3], a - 1, b, +(m[4] || 0), +(m[5] || 0));
  }
  if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{4}|\d{2})(?!\d)$/.exec(s)) && Object.hasOwn(MON, m[2].toLowerCase())) return at(+m[3], MON[m[2].toLowerCase()], +m[1]);
  if ((m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)) && Object.hasOwn(MON, m[1].toLowerCase())) return at(+m[3], MON[m[1].toLowerCase()], +m[2]);
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 20000 && n < 80000) return Math.round((Date.UTC(1899, 11, 30) / 60000) + n * DAY); }
  return null;
}

// One order for the whole log: a site team types every date the same way, so
// a 25/12/2025 anywhere means 03/12/2025 elsewhere is 3 December, not March 12.
// "dmy", "mdy", "mixed" (both kinds seen) or undefined (nothing tells).
export function slashOrder(values) {
  let dmy = false, mdy = false;
  for (const v of values) {
    const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})(?!\d)/.exec(String(v ?? "").trim());
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) dmy = true;
    else if (+m[2] > 12 && +m[1] <= 12) mdy = true;
  }
  return dmy && mdy ? "mixed" : dmy ? "dmy" : mdy ? "mdy" : undefined;
}

export function parseConstraintLog(text) {
  const rows = splitRows(text);
  const warnings = [];
  if (!rows.length) return { items: [], columns: {}, warnings: ["the constraints log is empty"] };
  const head = rows[0].map((h) => h.toLowerCase().replace(/[_*:]+/g, " ").replace(/\s+/g, " ").replace(/\(.*?\)/g, "").trim());
  const columns = {};
  for (const [k, re] of Object.entries(COLUMNS)) {
    const i = head.findIndex((h, j) => re.test(h) && !Object.values(columns).includes(j));
    if (i >= 0) columns[k] = i;
  }
  let body = rows.slice(1);
  if (columns.activity === undefined) {
    // no header: activity, constraint, owner, expected, cleared
    Object.assign(columns, { activity: 0, what: 1, owner: 2, expected: 3, cleared: 4 });
    for (const k of Object.keys(columns)) if (columns[k] >= Math.max(...rows.map((r) => r.length))) delete columns[k];
    body = rows;
    warnings.push("no column named activity (or activity ID, task code, ID): read as activity, constraint, owner, expected date, cleared");
  }
  const get = (r, k) => (columns[k] === undefined ? "" : r[columns[k]] ?? "");
  const order = slashOrder(body.flatMap((r) => ["expected", "needBy", "cleared"].map((k) => get(r, k))));
  if (order === "mixed") warnings.push("the log has dates with the day first (25/12/2025) and with the month first (12/25/2025); each one read on its own, and 03/12-style dates as month first");
  const date = (v) => parseLogDate(v, order === "mixed" ? undefined : order);
  const items = [];
  body.forEach((r, i) => {
    const row = i + (body === rows ? 1 : 2);
    const act = get(r, "activity");
    if (!act) { warnings.push(`row ${row}: no activity, skipped`); return; }
    const exp = get(r, "expected"), need = get(r, "needBy"), cl = get(r, "cleared");
    const expected = date(exp), needByLog = date(need);
    if (exp && expected === null) warnings.push(`row ${row}: expected date "${exp}" does not read as a date; treated as no date`);
    if (need && needByLog === null) warnings.push(`row ${row}: need-by date "${need}" does not read as a date`);
    let cleared = false, clearedOn = null;
    const cd = date(cl);
    if (cd !== null) { cleared = true; clearedOn = cd; }
    else if (YES.test(cl)) cleared = true;
    else if (!NO.test(cl)) warnings.push(`row ${row}: cleared "${cl}" read as open (use a date, yes or done to close it)`);
    items.push({ row, raw: act, codes: [act], what: get(r, "what"), type: get(r, "type"), owner: get(r, "owner"), needByLog, expected, cleared, clearedOn, note: get(r, "note") });
  });
  return { items, columns, warnings };
}

const SEVERITY = { overdue: 0, late: 1, "no date": 2, "activity finished": 3, "on track": 4, cleared: 5, "not in file": 6 };
const sev = (k) => (Object.hasOwn(SEVERITY, k) ? SEVERITY[k] : 9);
export const worstStatus = (list) => list.reduce((w, s) => (w === null || sev(s) < sev(w) ? s : w), null);
const dayOf = (min) => Math.floor(min / DAY);

// ctx: { result, project (cpm project), activities (lookahead rows), from, to }
// Adds openConstraints to each look-ahead row; returns the log report.
export function evaluateConstraints(log, ctx) {
  const parsed = typeof log === "string" ? parseConstraintLog(log) : log;
  const { result, project: p, activities } = ctx;
  const { model, tasks: res } = result;
  const dd = p.dataDate;
  const byCode = new Map();
  for (const t of model.tasks.values()) if (t.proj === p.id && !t.span && t.code !== undefined) byCode.set(String(t.code), t);
  const rowsById = new Map(activities.map((a) => [a.id, a]));
  const warnings = [...parsed.warnings];
  const items = [];
  const floors = new Map(); // task id -> expected minute (start floor)
  const floorsBy = []; // [item index, task id, minute]
  for (const it0 of parsed.items) {
    // the whole cell first (a code with a space in it), then split on ; , | or spaces
    let codes = byCode.has(it0.raw) ? [it0.raw] : it0.raw.split(/[;,|\s]+/).filter(Boolean);
    codes = [...new Set(codes)];
    const it = { ...it0, codes, links: [] };
    for (const code of codes) {
      const t = byCode.get(code);
      if (!t) { it.links.push({ code, status: "not in file" }); warnings.push(`row ${it.row}: activity ${code} is not in project ${p.code || p.id}`); continue; }
      const r = res.get(t.id);
      const done = t.status === "TK_Complete", active = t.status === "TK_Active";
      const open = !it.cleared || (it.clearedOn !== null && it.clearedOn > dd);
      const s = r && Number.isFinite(r.remES ?? r.es) ? (active ? Math.max(dd, r.remES ?? r.es) : (r.remES ?? r.es)) : null;
      const needBy = done ? null : active ? dd : s;
      const latest = done || !r || !Number.isFinite(r.ls) ? null : active ? null : r.ls;
      let status;
      if (!open) status = "cleared";
      else if (done) status = "activity finished";
      else if (it.expected === null) status = "no date";
      else if (dayOf(it.expected) < dayOf(dd)) status = "overdue";
      else if (needBy !== null && dayOf(it.expected) > dayOf(needBy)) status = "late";
      else status = "on track";
      const hpd = t.cal.hoursPerDay || 8;
      const slack = it.expected !== null && needBy !== null && open && !done ? Math.round(((it.expected < needBy ? t.cal.workBetween(it.expected, needBy) : -t.cal.workBetween(needBy, it.expected)) / 60 / hpd) * 10) / 10 : null;
      const link = { code, id: t.id, name: t.name, status, needBy: needBy === null ? null : formatDate(needBy), latest: latest === null ? null : formatDate(latest), slackDays: slack, inLookahead: rowsById.has(t.id), past: latest !== null && it.expected !== null && open && it.expected > latest };
      // past the late start but not after the start the schedule already has:
      // the activity is behind (negative float, from a deadline) without this
      // row, and the row adds no slip of its own
      link.alreadyBehind = link.past && needBy !== null && it.expected <= needBy;
      it.links.push(link);
      if (open && !done && !active && it.expected !== null && s !== null && it.expected > s) {
        floors.set(t.id, Math.max(floors.get(t.id) ?? -Infinity, it.expected));
        floorsBy.push([items.length, t.id, it.expected]);
      }
      const row = rowsById.get(t.id);
      if (row && open && !done) row.openConstraints.push({ row: it.row, what: it.what || it.type || "(constraint)", type: it.type, owner: it.owner, expected: it.expected === null ? null : formatDate(it.expected).slice(0, 10), status });
    }
    it.status = worstStatus(it.links.map((l) => l.status)) || "not in file";
    it.past = it.links.some((l) => l.past);
    items.push(it);
  }
  // "Past late start" read twice more, so the flag says whether the row
  // itself moves anything:
  // - against the late dates P6's calendars leave out. P6's backward pass
  //   does not credit a finish that may fall in its own calendar's non-work
  //   time (calslack.mjs) or a milestone that could sit at the instant its
  //   logic gives (milestones.mjs). Past P6's late start but not past these:
  //   nothing downstream moves (slackOnly).
  // - with every finish- or start-on-or-before date the schedule already
  //   misses moved to where the schedule puts that activity. On negative
  //   float the late start comes from a deadline that a longer path misses
  //   by more; a row inside that margin adds nothing to the miss
  //   (alreadyBehind).
  // A row past both moves the project finish or a kept date. Checked on the
  // six public files: eval/constraints-slack-2026-11-20.md.
  if (items.some((i) => i.past)) {
    const cal = schedule(null, { model, calendarSlack: true, milestones24h: true });
    const LATE_ONLY = new Set(["CS_MEOB", "CS_MSOB"]);
    const tasks2 = new Map();
    for (const [id, t] of model.tasks) {
      const r0 = res.get(id);
      if (!r0 || !t.cstr.some((c) => LATE_ONLY.has(c.type))) { tasks2.set(id, t); continue; }
      const cstr = t.cstr.map((c) => {
        if (!LATE_ONLY.has(c.type) || c.date === null) return c;
        const at = c.type === "CS_MEOB" ? r0.ef : (r0.remES ?? r0.es);
        return Number.isFinite(at) && at > c.date ? { ...c, date: at } : c;
      });
      tasks2.set(id, { ...t, cstr });
    }
    const rel = schedule(null, { model: { ...model, tasks: tasks2 }, calendarSlack: true, milestones24h: true });
    const lsOf = (run, id) => { const r1 = run.tasks.get(id); return r1 && Number.isFinite(r1.ls) ? r1.ls : null; };
    for (const it of items) {
      if (!it.past) continue;
      for (const l of it.links) {
        if (!l.past) continue;
        const a = lsOf(cal, l.id), b = lsOf(rel, l.id);
        l.latestLoose = a === null ? null : formatDate(a);
        l.latestRelaxed = b === null ? null : formatDate(b);
        l.slackOnly = a !== null && it.expected <= a;
        l.alreadyBehind = !l.slackOnly && (l.alreadyBehind || (b !== null && it.expected <= b));
        l.moves = !l.slackOnly && !l.alreadyBehind;
      }
      const pl = it.links.filter((l) => l.past);
      it.pastSlackOnly = pl.every((l) => l.slackOnly);
      it.pastAlreadyBehind = !it.pastSlackOnly && pl.every((l) => !l.moves);
    }
  }
  // make-ready: logic and log
  for (const a of activities) if (a.openConstraints.length && a.ready === "ready") a.ready = "constrained";

  // what if every open constraint clears on its expected date
  const baseFinish = result.projects.get(p.id)?.finish ?? null;
  const pcal = p.cal || [...model.tasks.values()].find((t) => t.proj === p.id)?.cal;
  const wd = (a, b) => (pcal && a !== null && b !== null ? Math.round(((b >= a ? pcal.workBetween(a, b) : -pcal.workBetween(b, a)) / 60 / (pcal.hoursPerDay || 8)) * 10) / 10 : null);
  let finish = { base: baseFinish === null ? null : formatDate(baseFinish), withLog: null, slipDays: 0, floors: floors.size };
  const startMoves = [];
  if (floors.size && baseFinish !== null) {
    // the full run for the dates (an as-late-as-possible activity takes its
    // early dates from the backward pass); the forward pass alone for each
    // row's finish (ALAP never moves the project finish)
    const run = (fl) => schedule(null, { model, levelStart: fl, forwardOnly: true });
    const w = schedule(null, { model, levelStart: floors });
    const f = w.projects.get(p.id)?.finish ?? baseFinish;
    finish = { ...finish, withLog: formatDate(f), slipDays: wd(baseFinish, f) };
    for (const a of activities) {
      const r1 = w.tasks.get(a.id);
      if (!r1 || a.status !== "not started") continue;
      const s1 = r1.remES ?? r1.es;
      if (Number.isFinite(s1) && s1 > a.startMin + 1) { a.startWithLog = formatDate(s1); startMoves.push(a.code); }
    }
    // each row alone (the rows that move a start), at most 60 runs
    const byItem = new Map();
    for (const [k, id, m] of floorsBy) { if (!byItem.has(k)) byItem.set(k, new Map()); const fm = byItem.get(k); fm.set(id, Math.max(fm.get(id) ?? -Infinity, m)); }
    let runs = 0;
    for (const [k, fm] of byItem) {
      if (runs++ >= 60) { warnings.push(`${byItem.size - 60} more late rows not run one by one (finish impact left blank)`); break; }
      const f1 = run(fm).projects.get(p.id)?.finish ?? baseFinish;
      items[k].finishSlipDays = wd(baseFinish, f1);
    }
  }
  const n = (st) => items.filter((i) => i.status === st).length;
  const summary = { rows: items.length, open: items.filter((i) => i.status !== "cleared" && i.status !== "not in file").length, cleared: n("cleared"), overdue: n("overdue"), late: n("late"), noDate: n("no date"), onTrack: n("on track"), activityFinished: n("activity finished"), notInFile: n("not in file"), pastLateStart: items.filter((i) => i.past).length, pastSlackOnly: items.filter((i) => i.past && i.pastSlackOnly).length, pastAlreadyBehind: items.filter((i) => i.past && i.pastAlreadyBehind).length, startsMoved: startMoves.length };
  items.sort((a, b) => sev(a.status) - sev(b.status) || (b.finishSlipDays ?? 0) - (a.finishSlipDays ?? 0) || minNeed(a) - minNeed(b) || a.row - b.row);
  return { items, summary, finish, warnings };
}
// What "past late start" means for this link, in words (text, page, CSV).
export function pastLabel(l) {
  if (!l || !l.past) return "";
  if (l.slackOnly) return `past P6's late start, within the slack its calendars leave (to ${String(l.latestLoose).slice(0, 10)}): moves nothing`;
  if (l.alreadyBehind) return `past late start, but a deadline is already missed by more on another path${l.latestRelaxed ? ` (adds to it after ${String(l.latestRelaxed).slice(0, 10)})` : ""}`;
  return "past late start: moves the finish or a deadline";
}

const minNeed = (it) => Math.min(...it.links.map((l) => (l.needBy ? Date.parse(l.needBy.replace(" ", "T") + "Z") : Infinity)));

const d10 = (m) => (m === null || m === undefined ? "" : formatDate(m).slice(0, 10));

export function constraintLogText(cl) {
  if (!cl) return "";
  const s = cl.summary;
  const out = ["", `Constraints log: ${s.rows} rows, ${s.open} open (${s.overdue} overdue, ${s.late} late for the schedule, ${s.noDate} with no expected date, ${s.onTrack} on track${s.activityFinished ? `, ${s.activityFinished} against finished work` : ""}), ${s.cleared} cleared${s.notInFile ? `, ${s.notInFile} naming no activity in the file` : ""}.`];
  if (cl.finish.withLog) out.push(`If every open constraint clears on its expected date: project finish ${cl.finish.base} -> ${cl.finish.withLog} (${cl.finish.slipDays > 0 ? `${cl.finish.slipDays} working days later` : "no change"}); ${s.startsMoved} look-ahead starts move.`);
  for (const it of cl.items) {
    if (it.status === "cleared") continue;
    const links = it.links.map((l) => `${l.code}${l.needBy ? ` need ${l.needBy.slice(0, 10)}` : ""}${l.slackDays !== null && l.slackDays !== undefined ? ` (${l.slackDays >= 0 ? "+" : ""}${l.slackDays} d)` : ""}${l.past ? " " + pastLabel(l) : ""}`).join(", ");
    out.push(`  [${it.status}] row ${it.row}: ${it.what || it.type || "(constraint)"}${it.owner ? ` (${it.owner})` : ""}, expected ${d10(it.expected) || "-"}: ${links}${it.finishSlipDays ? `; alone moves the finish ${it.finishSlipDays} d` : ""}`);
  }
  return out.join("\n");
}

const q = (v) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The log back, in its own order of columns plus what the schedule says, to
// keep as next week's log.
export function constraintLogCsv(cl) {
  const head = ["row", "activity", "constraint", "type", "owner", "need by (log)", "expected", "cleared", "note", "status", "need by (schedule)", "latest start (finish holds)", "days to spare", "moves finish (working days)", "activity name"];
  const lines = [head.map(q).join(",")];
  for (const it of [...cl.items].sort((a, b) => a.row - b.row)) {
    lines.push([it.row, it.codes.join("; "), it.what, it.type, it.owner, d10(it.needByLog), d10(it.expected), it.clearedOn !== null ? d10(it.clearedOn) : it.cleared ? "yes" : "", it.note, it.status,
      it.links.map((l) => (l.needBy || "").slice(0, 10)).join("; "), it.links.map((l) => (l.latest || "").slice(0, 10)).join("; "), it.links.map((l) => l.slackDays ?? "").join("; "), it.finishSlipDays ?? "", it.links.map((l) => l.name || "").join("; ")].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function constraintLogHtml(cl) {
  if (!cl) return "";
  const s = cl.summary;
  const rows = cl.items.filter((i) => i.status !== "cleared").map((it) => `<tr><td class="mr ${esc(it.status.replace(/ /g, "-"))}">${esc(it.status)}</td><td>${esc(it.what || it.type || "(constraint)")}${it.type && it.what ? `<div class="sub">${esc(it.type)}</div>` : ""}${it.note ? `<div class="sub">${esc(it.note)}</div>` : ""}</td><td>${esc(it.owner)}</td><td class="dt">${esc(d10(it.expected))}</td><td>${it.links.map((l) => `${esc(l.code)}${l.needBy ? ` <span class="sub">need ${esc(l.needBy.slice(0, 10))}${l.slackDays !== null && l.slackDays !== undefined ? `, ${l.slackDays >= 0 ? "+" : ""}${esc(l.slackDays)} d` : ""}${l.past ? ", " + esc(pastLabel(l)) : ""}</span>` : ""}`).join("<br>")}</td><td class="n">${it.finishSlipDays ? esc(it.finishSlipDays) : ""}</td></tr>`).join("");
  return `<h2 style="font-size:15px;margin:16px 0 4px">Constraints log</h2>
<p>${s.rows} rows: <b>${s.open}</b> open (${s.overdue} overdue, ${s.late} late for the schedule, ${s.noDate} with no expected date, ${s.onTrack} on track), ${s.cleared} cleared.${cl.finish.withLog ? ` If every open constraint clears on its expected date the project finish moves from ${esc(cl.finish.base)} to <b>${esc(cl.finish.withLog)}</b> (${cl.finish.slipDays > 0 ? `${esc(cl.finish.slipDays)} working days later` : "no change"}).` : ""}</p>
${rows ? `<table><thead><tr><th>Status</th><th>Constraint</th><th>Owner</th><th>Expected</th><th>Activities (need by, working days to spare)</th><th>Moves finish (d)</th></tr></thead><tbody>${rows}</tbody></table>` : ""}`;
}
