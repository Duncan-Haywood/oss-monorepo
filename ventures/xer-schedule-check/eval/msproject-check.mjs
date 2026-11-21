// XER -> Microsoft Project XML, read back. For each XER file, write the
// MSPDI with msproject.mjs, read it back with this tool's own MSPDI reader
// (mspdi.mjs, which matches Project's own dates on 2,442 of 2,491 tasks in
// 102 files saved by Project), and check that nothing was lost or changed:
//
//   1. every activity: name, status, remaining duration (to the minute),
//      actual start and finish, constraint, baseline (planned) start and
//      finish, and its calendar's working time day by day over the project;
//   2. every relationship: predecessor, successor, type and lag;
//   3. the schedule: recompute the original XER with Project's rules (lags on
//      the successor's calendar, total float the smaller of start and finish
//      float, retained logic, no must-finish date, no expected finish) and the
//      read-back file with the same engine; early finish, late finish and
//      total float must agree on every open activity. The same comparison
//      under P6's own options says how far Project's rules move the dates.
//
//   node eval/msproject-check.mjs <dir-or-files...> [--json out.json] [--show N]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate, num } from "../xer.mjs";
import { parseMspdi } from "../mspdi.mjs";
import { schedule } from "../cpm.mjs";
import { Calendar } from "../calendar.mjs";
import { mspdiText } from "../msproject.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const jsonOut = opt("--json"), show = Number(opt("--show") || 0);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--json", "--show"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

const CSTR_BACK = { CS_MANDSTART: "CS_MSO", CS_MANDFIN: "CS_MEO" };
const calFrom = (rows, id) => { const r = rows.find((c) => c.clndr_id === id); if (!r || !(r.clndr_data || "").trim()) return null; try { return Calendar.fromXer(r); } catch { return null; } };
const same = (a, b) => (a || "") === (b || "");
const hEq = (a, b) => Math.abs((num(a) ?? 0) - (num(b) ?? 0)) < 1 / 120; // half a minute

const out = [];
for (const f of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(f)));
  const conv = mspdiText(xer);
  const back = parseMspdi(conv.xml);
  const ms = Date.now() - t0;
  const pid = conv.project.id;
  const spanIds = new Set(xer.tables.TASK.filter((t) => t.task_type === "TT_LOE" || t.task_type === "TT_WBS").map((t) => t.task_id));
  const uidToCode = new Map();
  const orig = new Map();
  for (const t of xer.tables.TASK) if (t.proj_id === pid && conv.taskUid.has(t.task_id)) { orig.set(String(conv.taskUid.get(t.task_id)), t); uidToCode.set(String(conv.taskUid.get(t.task_id)), t.task_id); }
  const bk = new Map(back.tables.TASK.map((t) => [t.task_id, t]));

  // 1. activities
  const fields = { name: 0, status: 0, remaining: 0, actualStart: 0, actualFinish: 0, constraint: 0, baseline: 0, calendar: 0 };
  let n = 0, all = 0, spans = 0;
  const bad = [];
  let lo = Infinity, hi = -Infinity;
  for (const t of orig.values()) for (const d of [t.act_start_date, t.early_start_date, t.late_end_date, t.early_end_date, t.target_end_date]) { const m = parseDate(d); if (m !== null) { lo = Math.min(lo, m); hi = Math.max(hi, m); } }
  const day0 = Math.floor(lo / 1440) - 31, day1 = Math.floor(hi / 1440) + 366;
  const calSame = new Map();
  for (const [uid, t] of orig) {
    const b = bk.get(uid);
    const span = t.task_type === "TT_LOE" || t.task_type === "TT_WBS";
    if (span) { spans++; continue; } // written as manual tasks; checked by name only below
    n++;
    const ok = {
      name: b && b.task_name === t.task_name.replace(/""/g, '"'),
      status: b && b.status_code === (t.status_code || "TK_NotStart"),
      remaining: b && (t.status_code === "TK_Complete" || t.task_type === "TT_Mile" || t.task_type === "TT_FinMile" ? hEq(b.remain_drtn_hr_cnt, 0) : hEq(b.remain_drtn_hr_cnt, t.remain_drtn_hr_cnt ?? t.target_drtn_hr_cnt)),
      actualStart: b && (t.status_code === "TK_NotStart" || same(b.act_start_date, t.act_start_date)),
      actualFinish: b && (t.status_code !== "TK_Complete" || same(b.act_end_date, t.act_end_date)),
      constraint: b && (() => {
        let ty = CSTR_BACK[t.cstr_type] || t.cstr_type || "", d = t.cstr_date;
        // an external early start with no constraint of its own is written as start no earlier than
        if (!ty && t.external_early_start_date && (t.status_code || "TK_NotStart") === "TK_NotStart") { ty = "CS_MSOA"; d = t.external_early_start_date; }
        return same(b.cstr_type, ty) && (ty === "" || ty === "CS_ALAP" || same(b.cstr_date, d));
      })(),
      baseline: b && (!t.target_start_date || !t.target_end_date || (same(b.target_start_date, t.target_start_date) && same(b.target_end_date, t.target_end_date))),
      calendar: b && (() => {
        const key = `${t.clndr_id}|${b.clndr_id}`;
        if (!calSame.has(key)) {
          const a = calFrom(xer.tables.CALENDAR, t.clndr_id), c = calFrom(back.tables.CALENDAR, b.clndr_id);
          let eq = !!a && !!c;
          for (let d = day0; eq && d <= day1; d++) eq = JSON.stringify(a.day(d)) === JSON.stringify(c.day(d));
          calSame.set(key, eq || (!a && !!c));
        }
        return calSame.get(key);
      })(),
    };
    let good = true;
    for (const k of Object.keys(fields)) { if (ok[k]) fields[k]++; else good = false; }
    if (good) all++; else if (bad.length < show) bad.push({ code: t.task_code, fail: Object.keys(ok).filter((k) => !ok[k]) });
  }

  // 2. relationships
  const key = (succ, pred, type, lag) => `${succ}|${pred}|${type}|${Math.round(lag * 60)}`;
  const want = new Set(), got = new Set();
  const notes = new Map();
  for (const chunk of conv.xml.split("</Task>")) {
    const n = chunk.indexOf("<Notes>");
    if (n < 0) continue;
    const u = /<Task><UID>(\d+)<\/UID>/.exec(chunk);
    if (u) notes.set(u[1], chunk.slice(n + 7, chunk.indexOf("</Notes>", n)));
  }
  let inNotes = 0, notesOk = 0;
  const codeOf = new Map(xer.tables.TASK.map((t) => [t.task_id, t.task_code]));
  for (const r of xer.tables.TASKPRED || []) {
    if (!conv.taskUid.has(r.task_id) || !conv.taskUid.has(r.pred_task_id)) continue;
    if (spanIds.has(r.task_id) || spanIds.has(r.pred_task_id)) {
      inNotes++;
      const t = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" }[r.pred_type];
      const lag = num(r.lag_hr_cnt) || 0, lt = lag ? `${lag > 0 ? "+" : ""}${lag}h` : "";
      const okS = !spanIds.has(r.task_id) || (notes.get(String(conv.taskUid.get(r.task_id))) || "").includes(`${t}${lt} from ${codeOf.get(r.pred_task_id)}`);
      const okP = !spanIds.has(r.pred_task_id) || (notes.get(String(conv.taskUid.get(r.pred_task_id))) || "").includes(`${t}${lt} to ${codeOf.get(r.task_id)}`);
      if (okS && okP) notesOk++;
      continue;
    }
    want.add(key(r.task_id, r.pred_task_id, r.pred_type, num(r.lag_hr_cnt) || 0));
  }
  for (const r of back.tables.TASKPRED) got.add(key(uidToCode.get(r.task_id), uidToCode.get(r.pred_task_id), r.pred_type, num(r.lag_hr_cnt) || 0));
  const linksKept = [...want].filter((k) => got.has(k)).length;
  const linksExtra = [...got].filter((k) => !want.has(k)).length;

  // 3. the schedule
  const projectRules = { sched_float_type: "FT_SmallestFloat", sched_calendar_on_relationship_lag: "rcal_Successor", sched_retained_logic: "Y", sched_progress_override: "N", sched_use_project_end_date_for_float: "Y", sched_use_expect_end_flag: "N" };
  const hasPred = new Set((xer.tables.TASKPRED || []).filter((r) => conv.taskUid.has(r.pred_task_id) && !spanIds.has(r.pred_task_id)).map((r) => r.task_id));
  const asProject = { ...xer, tables: { ...xer.tables,
    SCHEDOPTIONS: (xer.tables.SCHEDOPTIONS || [{ proj_id: pid }]).map((o) => (o.proj_id === pid ? { ...o, ...projectRules } : o)),
    PROJECT: xer.tables.PROJECT.map((p) => (p.proj_id === pid ? { ...p, plan_end_date: "" } : p)),
    // Project has one kind of milestone: with a predecessor it sits at that
    // predecessor's finish, as a P6 finish milestone does
    TASK: xer.tables.TASK.map((t) => {
      if (t.proj_id !== pid) return t;
      let u = t.task_type === "TT_Mile" && hasPred.has(t.task_id) ? { ...t, task_type: "TT_FinMile" } : t;
      // external dates as written: early start as start-no-earlier-than; the
      // late finish becomes a deadline, which the MSPDI reader does not model
      if (u.external_early_start_date || u.external_late_end_date) {
        u = { ...u, external_early_start_date: "", external_late_end_date: "" };
        if (t.external_early_start_date && !t.cstr_type && t.status_code === "TK_NotStart") u = { ...u, cstr_type: "CS_MSOA", cstr_date: t.external_early_start_date };
      }
      return u;
    }),
    // links to level of effort and WBS summary activities go into notes
    TASKPRED: (xer.tables.TASKPRED || []).filter((r) => !(spanIds.has(r.task_id) || spanIds.has(r.pred_task_id))) } };
  const rA = schedule(asProject), rP6 = schedule(xer), rB = schedule(back);
  const cmp = (rX) => {
    let m = 0, k = 0, e = 0;
    for (const [uid, t] of orig) {
      if (t.task_type === "TT_LOE" || t.task_type === "TT_WBS" || t.status_code === "TK_Complete") continue;
      const a = rX.tasks.get(t.task_id), b = rB.tasks.get(uid);
      if (!a || !b || a.lf === undefined) continue;
      k++;
      if (a.ef === b.ef && a.lf === b.lf && Math.abs(a.tf - b.tf) < 0.01) m++;
      if (a.ef === b.ef) e++;
    }
    return [m, k, e];
  };
  const [schedSame, schedN] = cmp(rA);
  const [p6Same, , p6Ef] = cmp(rP6);
  const finA = rA.projects.get(pid)?.finish, finB = [...rB.projects.values()][0]?.finish, finP6 = rP6.projects.get(pid)?.finish;
  const s = {
    file: f.split("/").pop(), version: xer.version, project: conv.project.name, ms, bytes: conv.xml.length,
    activities: n, spans, allFields: all, fields, links: want.size, linksKept, linksExtra, linksInNotes: inNotes, linksInNotesFound: notesOk,
    schedule: { open: schedN, sameUnderProjectRules: schedSame, sameUnderP6Options: p6Same, earlyFinishSameUnderP6Options: p6Ef, finishSame: finA === finB, finishMovesUnderProject: finP6 !== finB },
    warnings: conv.warnings, bad,
  };
  out.push(s);
  console.log(`${s.file} (${s.project}): ${all}/${n} activities intact (${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join(", ")}); ${spans} LOE/WBS summary as manual; links ${linksKept}/${want.size} kept, ${linksExtra} extra, ${notesOk}/${inNotes} LOE links in notes; schedule ${schedSame}/${schedN} equal under Project's rules (${p6Same} under P6's options, early finish alone ${p6Ef}), finish ${s.schedule.finishSame ? "same" : "DIFFERS"}; ${ms} ms, ${(conv.xml.length / 1e6).toFixed(1)} MB`);
  for (const b of bad) console.log("   ", JSON.stringify(b));
}
const tot = out.reduce((a, s) => ({ n: a.n + s.activities, all: a.all + s.allFields, l: a.l + s.links, lk: a.lk + s.linksKept, le: a.le + s.linksExtra, o: a.o + s.schedule.open, so: a.so + s.schedule.sameUnderProjectRules, p6: a.p6 + s.schedule.sameUnderP6Options, p6e: a.p6e + s.schedule.earlyFinishSameUnderP6Options }), { n: 0, all: 0, l: 0, lk: 0, le: 0, o: 0, so: 0, p6: 0, p6e: 0 });
console.log(`TOTAL: activities intact ${tot.all}/${tot.n}; links kept ${tot.lk}/${tot.l} (${tot.le} extra); schedule equal ${tot.so}/${tot.o} under Project's rules, ${tot.p6}/${tot.o} under P6's own options (early finish alone ${tot.p6e})`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2));
