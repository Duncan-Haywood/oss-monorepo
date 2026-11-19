// Check the look-ahead (lookahead.mjs) on real P6 exports against what P6
// itself stored in the same file.
//
//   node eval/lookahead-check.mjs <dir-or-files...> [--weeks 3] [--json out.json]
//
// 1. Membership: the activities P6's own stored dates put in the window
//    (open, scheduled by P6: remaining early start, restart_date for started
//    work, before the window's end and early finish after the data date;
//    milestones on a date in it) against the look-ahead's list, built from
//    the recomputed dates. Both directions are counted.
// 2. Bars: every activity's first worked day is the day of its remaining
//    start (or the data date) and, when it finishes in the window, its last
//    worked day is the day of its finish (or the working day before, for a
//    finish at the very start of a day), and no bar falls on a day its
//    calendar does not work.
// 3. Make-ready against P6's stored dates: for each activity the look-ahead
//    calls "waits", every gating predecessor's stored early finish (FS) or
//    start (SS), plus the link's lag on its lag calendar, is at or before the
//    activity's stored early start. A "waits" that P6's dates contradict
//    would mean the gate was read wrong. (P6's dates meet the logic by
//    construction, so this checks the gate reading, not the dates.)
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate } from "../xer.mjs";
import { schedule, lagCalendar } from "../cpm.mjs";
import { lookahead } from "../lookahead.mjs";

const args = process.argv.slice(2);
const weeks = args.includes("--weeks") ? Number(args[args.indexOf("--weeks") + 1]) : 3;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--weeks", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const DAY = 1440;
const LINK = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const t0 = Date.now();
  const result = schedule(xer);
  let la = lookahead(xer, { weeks, result });
  if (!la.project) { console.log(`${f}: no project`); continue; }
  // a project whose work all starts after the window (planned start weeks
  // past the data date) is read again from the day its first work starts
  let shifted = null;
  if (!la.activities.length) {
    let next = null;
    for (const t of result.model.tasks.values()) {
      if (t.proj !== la.project.id || t.span || t.status === "TK_Complete") continue;
      const r = result.tasks.get(t.id);
      if (r && Number.isFinite(r.remES) && (next === null || r.remES < next)) next = r.remES;
    }
    if (next !== null) { shifted = Math.floor(next / DAY) * DAY; la = lookahead(xer, { weeks, result, from: shifted }); }
  }
  const ms = Date.now() - t0;
  const p = result.projects.get(la.project.id);
  const from = shifted ?? p.dataDate, firstDay = Math.floor(from / DAY), to = (firstDay + weeks * 7) * DAY;
  // 1. membership by P6's stored dates
  const p6 = new Set();
  for (const t of result.model.tasks.values()) {
    if (t.proj !== p.id || t.span || t.status === "TK_Complete") continue;
    const row = t.row;
    if (!row.early_end_date) continue;
    const s0 = parseDate(t.status === "TK_Active" ? (row.restart_date || row.early_start_date) : row.early_start_date);
    const e = parseDate(row.early_end_date);
    if (s0 === null || e === null) continue;
    const s = t.status === "TK_Active" ? Math.max(p.dataDate, s0) : s0;
    const zero = t.type === "TT_Mile" || t.type === "TT_FinMile" || e <= s;
    if (zero ? s >= from && s < to : s < to && e > from) p6.add(t.code);
  }
  const ours = new Set(la.activities.map((a) => a.code));
  const both = [...ours].filter((c) => p6.has(c)).length;
  const onlyOurs = [...ours].filter((c) => !p6.has(c)), onlyP6 = [...p6].filter((c) => !ours.has(c));
  // 2. bars
  let barBad = 0;
  const barEx = [];
  for (const a of la.activities) {
    const t = result.model.tasks.get(a.id);
    const idx = [...a.bars].map((c, i) => (c === "#" || c === "M" ? i : -1)).filter((i) => i >= 0);
    let ok = idx.length > 0;
    if (ok) {
      const first = la.days[idx[0]].day, last = la.days[idx[idx.length - 1]].day;
      const sDay = Math.floor(Math.max(a.startMin, from) / DAY);
      // the first worked day may be later than the start's day when the start
      // falls at a day's end (a remaining start at 17:00): the next working day
      if (first < sDay) ok = false;
      if (first > sDay && t.cal.workBetween(Math.max(a.startMin, from), first * DAY) > 0) ok = false;
      if (a.finishMin <= to && a.bars[idx[idx.length - 1]] === "#") {
        const fDay = Math.floor(a.finishMin / DAY);
        if (last > fDay) ok = false;
        if (last < fDay && t.cal.workBetween((last + 1) * DAY, a.finishMin) > 0) ok = false;
      }
      for (const i of idx) if (a.bars[i] === "#" && t.cal.workBetween(la.days[i].day * DAY, (la.days[i].day + 1) * DAY) === 0) ok = false;
    }
    if (!ok) { barBad++; if (barEx.length < 5) barEx.push(`${a.code} ${a.bars} ${a.start}..${a.finish}`); }
  }
  // 3. make-ready against P6's stored dates
  const byCode = new Map([...result.model.tasks.values()].filter((t) => t.proj === p.id).map((t) => [t.code, t]));
  let waits = 0, waitsOk = 0, ready = 0;
  const contra = [];
  for (const a of la.activities) {
    if (a.ready !== "waits" && a.ready !== "waits outside" && a.ready !== "ready") continue;
    const t = result.model.tasks.get(a.id);
    const sS = parseDate(t.row.early_start_date);
    const gates = a.waitsOn.filter((w) => w.state === "waits for finish" || w.state === "waits for start");
    if (a.ready === "ready") { ready++; continue; }
    if (!gates.length || sS === null) continue; // a running lag or another project's work: no stored pair to test
    waits++;
    let ok = true;
    for (const w of gates) {
      const pr = byCode.get(w.code);
      if (!pr) continue;
      const pd0 = parseDate(w.state === "waits for finish" ? pr.row.early_end_date : (pr.row.restart_date || pr.row.early_start_date));
      const rel = t.preds.find((x) => x.predId === pr.id && (LINK[x.type] || x.type) === w.type);
      // the link's lag (a lead when negative) on the file's lag calendar
      const pd = pd0 === null ? null : rel ? lagCalendar(result.model, rel).addWork(pd0, rel.lag) : pd0;
      if (pd === null || pd > sS) { ok = false; if (contra.length < 5) contra.push(`${a.code} <- ${w.code} ${w.type}: P6 ${w.state === "waits for finish" ? "EF" : "ES"} ${pr.row.early_end_date} after ES ${t.row.early_start_date}`); }
    }
    if (ok) waitsOk++;
  }
  const s = { file: f.split("/").pop(), project: la.project.code, dataDate: la.project.dataDate, windowFrom: la.from, weeks, activities: la.activities.length, p6InWindow: p6.size, both, onlyOurs: onlyOurs.slice(0, 10), onlyOursCount: onlyOurs.length, onlyP6: onlyP6.slice(0, 10), onlyP6Count: onlyP6.length, barBad, barEx, waits, waitsOk, ready, contra, summary: la.summary, ms };
  out.push(s);
  const m = la.summary;
  console.log(`${s.file} (${s.project}, data date ${s.dataDate}${shifted !== null ? `, window from ${la.from}` : ""}): ${m.activities} in ${weeks} weeks; P6's stored dates put ${p6.size} there, ${both} in both, ${onlyOurs.length} only ours, ${onlyP6.length} only P6's; bars wrong ${barBad}; waits confirmed by P6's dates ${waitsOk}/${waits}; ` +
    `in progress ${m.inProgress}, ready ${m.ready}, waits ${m.waiting}, waits outside ${m.waitingOutside}, no predecessor ${m.noPredecessor}, constraint ${m.constraint}, out of sequence ${m.outOfSequence}; ${ms} ms`);
  if (onlyOurs.length || onlyP6.length) console.log(`   only ours: ${onlyOurs.slice(0, 8).join(", ")}; only P6's: ${onlyP6.slice(0, 8).join(", ")}`);
  for (const b of barEx) console.log(`   bar: ${b}`);
  for (const c of contra) console.log(`   contradicted: ${c}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2) + "\n");
