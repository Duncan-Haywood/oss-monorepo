// Check the constraints log (constraints.mjs) on real P6 exports.
//
//   node eval/constraints-check.mjs <dir-or-files...> [--rows 40] [--seed 1] [--json out.json]
//
// No public P6 job publishes its constraints log, so the rows are planted: on
// each file, up to --rows not-started activities in the 3-week look-ahead get
// a row each (seeded), with an expected date from 5 days before to 15 days
// after the activity's start, a fifth cleared and a tenth with no date; a few
// rows name two activities.
//
// 1. The what-if, by a second route. The log's floors (an expected date as a
//    start floor on its activities) against the same dates written into the
//    file as P6 "start on or after" constraints (CS_MSOA) and scheduled again
//    from scratch: the project finish and every open activity's early start
//    must agree. Activities that already carry a primary constraint are not
//    planted (one primary constraint per activity in P6).
// 2. Each row alone: the finish slip constraints.mjs reports for a row
//    against the same row as CS_MSOA constraints scheduled alone (the first
//    10 late rows per file).
// 3. Status rules: "late" exactly when the expected day is after the need-by
//    day; for a late row the activity's start with the log is on or after
//    the expected date; "past late start" against "moves the finish".
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, formatDate } from "../xer.mjs";
import { schedule } from "../cpm.mjs";
import { lookahead } from "../lookahead.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const maxRows = Number(val("--rows", 40));
let seed = Number(val("--seed", 1));
const jsonOut = val("--json", null);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--rows", "--seed", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const DAY = 1440;
const d10 = (m) => formatDate(m).slice(0, 10);
const out = [];
for (const f of files) {
  const text = decodeXer(readFileSync(f));
  const xer = parseXer(text);
  const t0 = Date.now();
  const result = schedule(xer);
  let from = null;
  let base = lookahead(xer, { weeks: 3, result });
  if (!base.project) continue;
  // a file whose open work starts after the window: start the window there
  const nx = /next work starts (\d{4}-\d{2}-\d{2})/.exec(base.warnings.join(" "));
  if (!base.activities.length && nx) { from = nx[1]; base = lookahead(xer, { weeks: 3, result, from }); }
  const cand = base.activities.filter((a) => a.status === "not started" && !base.activities.find((b) => b.id === a.id).constraints.length);
  // shuffle, take up to maxRows
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const picks = cand.slice(0, maxRows);
  if (!picks.length) { out.push({ file: f.split("/").pop(), rows: 0, note: "no unconstrained not-started activity in the window" }); console.log(`${f.split("/").pop()}: no unconstrained not-started activity in the 3-week window (${base.activities.length} activities in it)`); continue; }
  const lines = ["activity,constraint,expected,cleared"];
  const planted = []; // { codes, expected (min) | null, cleared }
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  picks.forEach((a, i) => {
    const codes = [a.code];
    if (i % 7 === 3 && picks[i + 1]) codes.push(picks[i + 1].code);
    const r = rnd();
    const cleared = r < 0.2;
    const noDate = !cleared && r < 0.3;
    const off = Math.floor(rnd() * 21) - 5;
    const exp = noDate ? null : (Math.floor(a.startMin / DAY) + off) * DAY;
    planted.push({ codes, expected: exp, cleared });
    lines.push([q(codes.join("; ")), `planted ${i + 1}`, exp === null ? "" : d10(exp), cleared ? "yes" : ""].join(","));
  });
  const la = lookahead(xer, { weeks: 3, result, from, constraints: lines.join("\n") });
  const cl = la.constraintLog;
  const byCode = new Map([...result.model.tasks.values()].filter((t) => t.proj === la.project.id).map((t) => [t.code, t]));
  // 1. the same floors as CS_MSOA constraints in the file
  const floors = new Map();
  for (const p of planted) {
    if (p.cleared || p.expected === null) continue;
    for (const c of p.codes) {
      const t = byCode.get(c);
      const r = result.tasks.get(t.id);
      if (p.expected > (r.remES ?? r.es)) floors.set(t.id, Math.max(floors.get(t.id) ?? -Infinity, p.expected));
    }
  }
  const withCstr = (fl) => {
    const x = parseXer(text);
    for (const row of x.tables.TASK) if (fl.has(row.task_id)) { row.cstr_type = "CS_MSOA"; row.cstr_date = formatDate(fl.get(row.task_id)); }
    return schedule(x);
  };
  const r1 = { floors: floors.size, finishAgree: null, startsCompared: 0, startsAgree: 0, mismatches: [] };
  if (floors.size) {
    const oracle = withCstr(floors);
    const pf = oracle.projects.get(la.project.id).finish;
    r1.finishLog = cl.finish.withLog; r1.finishCstr = formatDate(pf);
    r1.finishAgree = cl.finish.withLog === formatDate(pf);
    // the look-ahead's own "starts ... if the log holds" against the second route
    r1.windowCompared = 0; r1.windowAgree = 0;
    for (const a of la.activities) {
      if (a.status !== "not started") continue;
      const b = oracle.tasks.get(a.id);
      const sb = b.remES ?? b.es;
      const moved = sb > a.startMin + 1;
      r1.windowCompared++;
      if (moved ? a.startWithLog === formatDate(sb) : !a.startWithLog) r1.windowAgree++;
      else if (r1.mismatches.length < 5) r1.mismatches.push({ code: a.code, la: a.startWithLog || "unmoved", cstr: formatDate(sb) });
    }
    const fl = schedule(null, { model: result.model, levelStart: floors });
    for (const t of result.model.tasks.values()) {
      if (t.proj !== la.project.id || t.span || t.status === "TK_Complete") continue;
      const a = fl.tasks.get(t.id), b = oracle.tasks.get(t.id);
      if (!a || !b || !Number.isFinite(a.ef)) continue;
      r1.startsCompared++;
      const sa = a.remES ?? a.es, sb = b.remES ?? b.es;
      if (Math.abs(sa - sb) < 1 && Math.abs(a.ef - b.ef) < 1) r1.startsAgree++;
      else if (r1.mismatches.length < 5) r1.mismatches.push({ code: t.code, floor: formatDate(sa), cstr: formatDate(sb) });
    }
  }
  // 2. each late row alone
  const r2 = { compared: 0, agree: 0, mismatches: [] };
  const lateRows = cl.items.filter((it) => it.status === "late" || it.status === "overdue" || it.status === "on track").filter((it) => it.finishSlipDays !== undefined).slice(0, 10);
  const pcal = result.projects.get(la.project.id).cal;
  const baseFinish = result.projects.get(la.project.id).finish;
  for (const it of lateRows) {
    const fm = new Map();
    for (const l of it.links) { const r = result.tasks.get(l.id); if (it.expected > (r.remES ?? r.es)) fm.set(l.id, it.expected); }
    if (!fm.size) continue;
    const o = withCstr(fm).projects.get(la.project.id).finish;
    const slip = Math.round(((o >= baseFinish ? pcal.workBetween(baseFinish, o) : -pcal.workBetween(o, baseFinish)) / 60 / (pcal.hoursPerDay || 8)) * 10) / 10;
    r2.compared++;
    if (slip === it.finishSlipDays) r2.agree++;
    else if (r2.mismatches.length < 5) r2.mismatches.push({ row: it.row, log: it.finishSlipDays, cstr: slip });
  }
  // 3. status rules
  const r3 = { links: 0, lateRuleAgree: 0, lateStartsHeld: 0, lateLinks: 0, pastAndMoves: 0, pastNoMove: 0, movesNotPast: 0 };
  const startWith = new Map(la.activities.map((a) => [a.code, a]));
  for (const it of cl.items) {
    for (const l of it.links) {
      if (!l.needBy || it.status === "cleared" || it.expected === null) continue;
      r3.links++;
      const late = Math.floor(it.expected / DAY) > Math.floor(Date.parse(l.needBy.replace(" ", "T") + "Z") / 60000 / DAY);
      const ownStatus = l.status;
      if ((ownStatus === "late") === late || ownStatus === "overdue") r3.lateRuleAgree++;
      if (ownStatus === "late") {
        r3.lateLinks++;
        const a = startWith.get(l.code);
        const s1 = a && a.startWithLog ? Date.parse(a.startWithLog.replace(" ", "T") + "Z") / 60000 : null;
        if (s1 !== null && s1 >= it.expected) r3.lateStartsHeld++;
      }
    }
    if (it.finishSlipDays !== undefined) {
      if (it.past && it.finishSlipDays > 0) r3.pastAndMoves++;
      else if (it.past) r3.pastNoMove++;
      else if (it.finishSlipDays > 0) r3.movesNotPast++;
    }
  }
  out.push({ file: f.split("/").pop(), from, activities: base.activities.length, rows: planted.length, summary: cl.summary, finish: cl.finish, whatIf: r1, alone: r2, rules: r3, seconds: Math.round((Date.now() - t0) / 100) / 10 });
  const o = out[out.length - 1];
  console.log(`${o.file}: ${o.rows} rows (${cl.summary.late} late, ${cl.summary.onTrack} on track, ${cl.summary.overdue} overdue, ${cl.summary.noDate} no date, ${cl.summary.cleared} cleared); finish ${cl.finish.base} -> ${cl.finish.withLog || "unchanged"}; ` +
    `what-if = CS_MSOA: finish ${r1.finishAgree}, starts ${r1.startsAgree}/${r1.startsCompared}, look-ahead starts ${r1.windowAgree ?? "-"}/${r1.windowCompared ?? "-"}; alone ${r2.agree}/${r2.compared}; late rule ${r3.lateRuleAgree}/${r3.links}, late starts held ${r3.lateStartsHeld}/${r3.lateLinks}; past+moves ${r3.pastAndMoves}, past only ${r3.pastNoMove}, moves only ${r3.movesNotPast}; ${o.seconds}s`);
  for (const m of [...r1.mismatches, ...r2.mismatches]) console.log("   ", JSON.stringify(m));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2) + "\n");
