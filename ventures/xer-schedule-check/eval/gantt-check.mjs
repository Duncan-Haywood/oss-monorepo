// The Gantt chart (gantt.mjs) against P6's stored dates and its own invariants.
//
//   node eval/gantt-check.mjs <dir-or-files...> [--json out.json] [-v]
//
// Per file, every project with stored dates:
//   span      - level of effort and WBS summary activities, which cpm.mjs
//               leaves out of the network: spanDates' early start (the
//               remaining start for a started one) and early finish against
//               P6's stored early_start_date / early_end_date, to the minute;
//   bars      - every other open activity: its bar's remaining start and
//               finish against P6's stored early start / finish (inherits the
//               engine's match, eval/cpm-vs-p6-2026-11-19.md);
//   once      - every activity of the project with dates is on the chart
//               exactly once;
//   rollup    - every WBS row spans exactly the earliest start and latest
//               finish of the activities under it, at any depth;
//   order     - WBS rows follow the PROJWBS tree (a child is never above its
//               parent, siblings in seq_num order);
//   self      - with the file as its own baseline, every variance is 0;
//   planted   - for --plant N (default 20) not-started task-dependent
//               activities with no FF or SF predecessor (one that ties
//               the finish moves the start instead), one at a time: a baseline copy with k = 1-10
//               working days added to the activity's remaining duration; the
//               chart of the file against that baseline must show the
//               activity's finish variance as exactly -k working days.
// eval/gantt-check-2026-11-20.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate, formatDate } from "../xer.mjs";
import { schedule } from "../cpm.mjs";
import { gantt, spanDates } from "../gantt.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const plantN = Number(val("--plant", 20));
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const jsonOut = val("--json", null), verbose = args.includes("-v");
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("-") && !["--json", "--plant"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

const out = [];
for (const f of files) {
  const name = f.split("/").pop();
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(f)));
  const result = schedule(xer);
  const spans = spanDates(result, xer);
  const rec = { file: name, span: { loe: 0, loeStart: 0, loeFinish: 0, wbs: 0, wbsStart: 0, wbsFinish: 0, misses: [] }, bars: { n: 0, ok: 0 }, once: { n: 0, ok: 0 }, rollup: { n: 0, ok: 0 }, order: { n: 0, ok: 0 }, self: { n: 0, ok: 0 }, planted: { n: 0, ok: 0, misses: [] }, projects: 0 };
  const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1;
  for (const t of result.model.tasks.values()) {
    if (!t.span || t.status === "TK_Complete") continue;
    const ses = parseDate(t.row.early_start_date), sef = parseDate(t.row.early_end_date);
    if (ses === null || sef === null) continue;
    const s = spans.get(t.id);
    const k = t.type === "TT_LOE" ? "loe" : "wbs";
    rec.span[k]++;
    const okS = s && near(s.rem, ses), okF = s && near(s.ef, sef);
    if (okS) rec.span[k + "Start"]++;
    if (okF) rec.span[k + "Finish"]++;
    if (!okS || !okF) rec.span.misses.push({ code: t.code, type: t.type, status: t.status, stored: [t.row.early_start_date, t.row.early_end_date], here: s ? [formatDate(s.rem), formatDate(s.ef)] : null });
  }
  for (const p of result.projects.values()) {
    const hasDates = [...result.model.tasks.values()].some((t) => t.proj === p.id && parseDate(t.row.early_end_date) !== null);
    if (!hasDates) continue;
    rec.projects++;
    const g = gantt(xer, { projId: p.id, result });
    const tasks = g.rows.filter((r) => r.kind === "task");
    // bars of open network activities against P6's stored early dates
    for (const r of tasks) {
      const t = result.model.tasks.get(r.id);
      if (t.span || r.status === "complete") continue;
      const ses = parseDate(t.row.early_start_date), sef = parseDate(t.row.early_end_date);
      if (ses === null || sef === null) continue;
      rec.bars.n++;
      const rs = r.remStart ?? r.start;
      if (near(rs, ses) && near(r.finish, sef)) rec.bars.ok++;
    }
    // once
    const counts = new Map();
    for (const r of tasks) counts.set(r.id, (counts.get(r.id) || 0) + 1);
    const withDates = [...result.model.tasks.values()].filter((t) => t.proj === p.id);
    const missing = g.warnings.find((w) => / no dates to draw/.test(w));
    const noBar = missing ? Number(missing.split(" ")[0]) : 0;
    rec.once.n += withDates.length;
    rec.once.ok += withDates.filter((t) => counts.get(t.id) === 1).length + noBar;
    // rollup: each WBS row against the tasks under it
    const byKey = new Map(g.rows.map((r) => [r.key, r]));
    const span = new Map();
    for (const r of tasks) for (let k = r.parent; k; k = byKey.get(k)?.parent) {
      const s = span.get(k) || { a: Infinity, b: -Infinity };
      s.a = Math.min(s.a, r.start); s.b = Math.max(s.b, r.finish);
      span.set(k, s);
    }
    for (const r of g.rows) if (r.kind === "wbs") {
      rec.rollup.n++;
      const s = span.get(r.key);
      if (s && s.a === r.start && s.b === r.finish) rec.rollup.ok++;
    }
    // order: a WBS row's parent is above it, siblings by seq_num
    const pos = new Map(g.rows.map((r, i) => [r.key, i]));
    const wbs = new Map((xer.tables.PROJWBS || []).map((w) => [w.wbs_id, w]));
    const lastSeq = new Map();
    for (const r of g.rows) if (r.kind === "wbs") {
      rec.order.n++;
      const parentOk = !r.parent || (pos.get(r.parent) ?? Infinity) < pos.get(r.key);
      const sq = Number(wbs.get(r.key)?.seq_num) || 0;
      const prev = lastSeq.get(r.parent);
      if (parentOk && (prev === undefined || prev <= sq)) rec.order.ok++;
      lastSeq.set(r.parent, sq);
    }
    // self-baseline
    const gs = gantt(xer, { projId: p.id, result, baseline: xer });
    for (const r of gs.rows) if (r.kind === "task") { rec.self.n++; if (r.variance === 0) rec.self.ok++; }
    // planted: one activity longer in a baseline copy
    const cand = tasks.filter((r) => r.status === "not started" && !r.span && !r.milestone && r.type === "TT_Task" && !result.model.tasks.get(r.id).preds.some((l) => l.type === "PR_FF" || l.type === "PR_SF"));
    for (let i = 0; i < plantN && cand.length; i++) {
      const r = cand.splice(Math.floor(rnd() * cand.length), 1)[0];
      const t = result.model.tasks.get(r.id);
      const k = 1 + Math.floor(rnd() * 10);
      const hpd = t.cal.hoursPerDay || 8;
      const rows = xer.tables.TASK.map((row) => (row.task_id === r.id ? { ...row, remain_drtn_hr_cnt: String(Number(row.remain_drtn_hr_cnt) + k * hpd), target_drtn_hr_cnt: String(Number(row.target_drtn_hr_cnt) + k * hpd) } : row));
      const base = { ...xer, tables: { ...xer.tables, TASK: rows } };
      const gp = gantt(xer, { projId: p.id, result, baseline: base });
      const got = gp.rows.find((x) => x.key === r.key)?.variance;
      rec.planted.n++;
      if (got === -k) rec.planted.ok++;
      else rec.planted.misses.push({ code: r.code, k, got });
    }
  }
  rec.ms = Date.now() - t0;
  out.push(rec);
  const s = rec.span;
  console.log(`${name}: LOE ${s.loe} (start ${s.loeStart}, finish ${s.loeFinish}); WBS summary ${s.wbs} (start ${s.wbsStart}, finish ${s.wbsFinish}); bars ${rec.bars.ok}/${rec.bars.n}; once ${rec.once.ok}/${rec.once.n}; rollup ${rec.rollup.ok}/${rec.rollup.n}; order ${rec.order.ok}/${rec.order.n}; self-baseline ${rec.self.ok}/${rec.self.n}; planted ${rec.planted.ok}/${rec.planted.n}; ${rec.ms} ms`);
  if (verbose) for (const m of [...s.misses, ...rec.planted.misses].slice(0, 10)) console.log("   miss", JSON.stringify(m));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
