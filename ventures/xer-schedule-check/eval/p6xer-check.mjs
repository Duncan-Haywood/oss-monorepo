// Microsoft Project XML -> P6 XER (p6xer.mjs), checked two ways.
//
// --mspdi <dir>: every MSPDI file under dir (MPXJ's test corpus). Each is
//   read by mspdi.mjs (whose dates match Project's own on 2,442 of 2,491
//   tasks) and written as an XER; the XER is read back by this tool's XER
//   reader and checked against the MSPDI reading:
//   - P6's import rules (p6Problems: fields, whole-number ids, references,
//     unique activity IDs, field lengths, dates, progress before the data date);
//   - every activity's name, status, remaining duration, actual dates,
//     constraint, baseline and calendar (working time day by day);
//   - every link (type, lag) and activity code assignment;
//   - the schedule: both through cpm.mjs; early finish, late finish and total
//     float on every open activity.
//
// --xer <dir>: real P6 files the other way round. Each XER is written as
//   Project XML (msproject.mjs, as someone with Project would receive it),
//   then back to XER with p6xer.mjs, and the result checked against the P6
//   original by activity ID: the same fields, links and codes, the WBS path,
//   and the schedule under Project's rules (the original recomputed with lags
//   on the successor's calendar, smallest float, retained logic, no
//   must-finish date) against the returned XER under its own options.
//
//   node eval/p6xer-check.mjs --mspdi <dir> --xer <dir> [--json out.json] [--show N] [--write dir]
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, parseDate, num } from "../xer.mjs";
import { parseMspdi } from "../mspdi.mjs";
import { schedule } from "../cpm.mjs";
import { Calendar } from "../calendar.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const show = Number(opt("--show") || 0), writeDir = opt("--write");
if (writeDir) mkdirSync(writeDir, { recursive: true });
const list = (dir, re) => (dir ? readdirSync(dir, { recursive: true }).filter((f) => re.test(f) && statSync(join(dir, f)).isFile()).sort().map((f) => join(dir, f)) : []);

const same = (a, b) => (a || "") === (b || "");
const hEq = (a, b) => Math.abs((num(a) ?? 0) - (num(b) ?? 0)) < 1 / 60 + 0.006; // a minute (hours written to 0.01)
const calFrom = (rows, id) => { const r = rows.find((c) => c.clndr_id === id); if (!r || !(r.clndr_data || "").trim()) return null; try { return Calendar.fromXer(r); } catch { return null; } };
const CSTR_BACK = { CS_MANDSTART: "CS_MSO", CS_MANDFIN: "CS_MEO" };

// compare activity pairs [a (reference), b (written)] field by field
function compareTasks(pairs, A, B, show) {
  const fields = { name: 0, status: 0, remaining: 0, actualStart: 0, actualFinish: 0, constraint: 0, baseline: 0, calendar: 0 };
  let all = 0;
  const bad = [];
  let lo = Infinity, hi = -Infinity;
  for (const [a] of pairs) for (const d of [a.act_start_date, a.early_start_date, a.late_end_date, a.early_end_date, a.target_end_date]) { const m = parseDate(d); if (m !== null) { lo = Math.min(lo, m); hi = Math.max(hi, m); } }
  const day0 = Math.floor(lo / 1440) - 31, day1 = Math.floor(hi / 1440) + 366;
  const calSame = new Map();
  for (const [a, b, cstr = a.cstr_type, cstrDate = a.cstr_date] of pairs) {
    const ok = {
      name: b.task_name === a.task_name.replace(/""/g, '"').slice(0, 120),
      status: b.status_code === (a.status_code || "TK_NotStart"),
      remaining: a.status_code === "TK_Complete" || a.task_type === "TT_Mile" || a.task_type === "TT_FinMile" ? hEq(b.remain_drtn_hr_cnt, 0) : hEq(b.remain_drtn_hr_cnt, a.remain_drtn_hr_cnt ?? a.target_drtn_hr_cnt),
      actualStart: a.status_code === "TK_NotStart" || same(b.act_start_date, a.act_start_date),
      actualFinish: a.status_code !== "TK_Complete" || same(b.act_end_date, a.act_end_date),
      constraint: same(b.cstr_type, cstr) && (!cstr || cstr === "CS_ALAP" || same(b.cstr_date, cstrDate)),
      baseline: !a.target_start_date || !a.target_end_date || (same(b.target_start_date, a.target_start_date) && same(b.target_end_date, a.target_end_date)),
      calendar: (() => {
        const key = `${a.clndr_id}|${b.clndr_id}`;
        if (!calSame.has(key)) {
          const x = calFrom(A.CALENDAR, a.clndr_id), y = calFrom(B.CALENDAR, b.clndr_id);
          let eq = !!x && !!y;
          for (let d = day0; eq && d <= day1; d++) eq = JSON.stringify(x.day(d)) === JSON.stringify(y.day(d));
          calSame.set(key, eq || (!x && !!y));
        }
        return calSame.get(key);
      })(),
    };
    let good = true;
    for (const k of Object.keys(fields)) { if (ok[k]) fields[k]++; else good = false; }
    if (good) all++; else if (bad.length < show) bad.push({ code: a.task_code, fail: Object.keys(ok).filter((k) => !ok[k]), a: { rem: a.remain_drtn_hr_cnt, c: a.cstr_type, cd: a.cstr_date }, b: { rem: b.remain_drtn_hr_cnt, c: b.cstr_type, cd: b.cstr_date } });
  }
  return { n: pairs.length, all, fields, bad };
}

const linkKey = (s, p, type, lag) => `${s}|${p}|${type}|${Math.round(lag * 60)}`;
const codeSet = (T, keyOf) => {
  const type = new Map((T.ACTVTYPE || []).map((t) => [t.actv_code_type_id, t.actv_code_type]));
  const code = new Map((T.ACTVCODE || []).map((c) => [c.actv_code_id, c.short_name]));
  return new Set((T.TASKACTV || []).filter((r) => keyOf(r.task_id) !== undefined).map((r) => `${keyOf(r.task_id)}|${type.get(r.actv_code_type_id)}|${code.get(r.actv_code_id)}`));
};
// activity UDF values: activity|title|value (dates as written, numbers as numbers), and the same with the type
const udfSet = (T, keyOf, keep = () => true, withType = false) => {
  const types = new Map((T.UDFTYPE || []).filter((u) => u.table_name === "TASK" && keep(u)).map((u) => [u.udf_type_id, u]));
  const out = new Set();
  for (const v of T.UDFVALUE || []) {
    const u = types.get(v.udf_type_id), k = keyOf(v.fk_id);
    if (!u || k === undefined) continue;
    const x = /DATE/.test(u.logical_data_type) ? v.udf_date : /INT|FLOAT|MONEY/.test(u.logical_data_type) ? String(num(v.udf_number)) : v.udf_text;
    out.add(`${k}|${u.udf_type_label.replace(/\[/g, "(").replace(/\]/g, ")").trim()}|${x}${withType ? `|${u.logical_data_type}` : ""}`);
  }
  return out;
};
const kept = (A, B) => [...A].filter((k) => B.has(k)).length;
const schedCmp = (pairs, rA, rB) => {
  let n = 0, m = 0;
  const miss = [];
  for (const [a, b] of pairs) {
    if (a.status_code === "TK_Complete") continue;
    const x = rA.tasks.get(a.task_id), y = rB.tasks.get(b.task_id);
    if (!x || !y || x.lf === undefined) continue;
    n++;
    if (x.ef === y.ef && x.lf === y.lf && Math.abs(x.tf - y.tf) < 0.01) m++;
    else if (miss.length < 3) miss.push({ code: a.task_code, ef: [x.ef, y.ef], lf: [x.lf, y.lf], tf: [x.tf, y.tf] });
  }
  return { open: n, same: m, miss };
};

const out = { mspdi: [], xer: [] };

for (const f of list(opt("--mspdi"), /\.xml$/i)) {
  const text = readFileSync(f, "utf8");
  if (!/<Project[\s>]/.test(text.slice(0, 2000)) || /<APIBusinessObjects/.test(text.slice(0, 2000))) continue; // not MSPDI (P6 XML and MPXJ's other formats)
  let A, r;
  try { A = parseMspdi(text); r = p6XerText(text); } catch (e) { out.mspdi.push({ file: basename(f), error: e.message }); continue; }
  const B = parseXer(r.text);
  const problems = p6Problems(r.xer.tables);
  // same data date for both (the writer moves it past the latest actual)
  A.tables.PROJECT[0].last_recalc_date = B.tables.PROJECT[0].last_recalc_date;
  const pairs = A.tables.TASK.map((a, i) => [a, B.tables.TASK[i]]);
  const cmp = compareTasks(pairs, A.tables, B.tables, show);
  const idMap = new Map(pairs.map(([a, b]) => [b.task_id, a.task_id]));
  const want = new Set(A.tables.TASKPRED.map((l) => linkKey(l.task_id, l.pred_task_id, l.pred_type, num(l.lag_hr_cnt) || 0)));
  const got = new Set(B.tables.TASKPRED.map((l) => linkKey(idMap.get(l.task_id), idMap.get(l.pred_task_id), l.pred_type, num(l.lag_hr_cnt) || 0)));
  const codesA = codeSet(A.tables, (id) => id), codesB = codeSet(B.tables, (id) => idMap.get(id));
  const sc = schedCmp(pairs, schedule(A), schedule(B));
  const udfA = udfSet(A.tables, (id) => id), udfB = udfSet(B.tables, (id) => idMap.get(id));
  const udfTA = udfSet(A.tables, (id) => id, undefined, true), udfTB = udfSet(B.tables, (id) => idMap.get(id), undefined, true);
  const s = {
    file: f.split("/junit/data/").pop() || basename(f), activities: cmp.n, allFields: cmp.all, fields: cmp.fields, problems,
    udfFields: r.counts.udfFields, udfs: udfA.size, udfsKept: kept(udfA, udfB), udfsTyped: kept(udfTA, udfTB), udfsExtra: [...udfB].filter((k) => !udfA.has(k)).length,
    links: want.size, linksKept: [...want].filter((k) => got.has(k)).length, linksExtra: [...got].filter((k) => !want.has(k)).length,
    codes: codesA.size, codesKept: [...codesA].filter((k) => codesB.has(k)).length,
    resources: r.counts.resources, assignments: r.counts.assignments, schedule: sc, bad: cmp.bad,
  };
  out.mspdi.push(s);
  if (problems.length || s.allFields < s.activities || s.linksKept < s.links || s.codesKept < s.codes || s.udfsKept < s.udfs || sc.same < sc.open) console.log(`${s.file}: ${s.allFields}/${s.activities} intact ${JSON.stringify(cmp.fields)}; links ${s.linksKept}/${s.links}; codes ${s.codesKept}/${s.codes}; UDFs ${s.udfsKept}/${s.udfs}; schedule ${sc.same}/${sc.open} ${JSON.stringify(sc.miss)}; problems ${problems.length} ${problems.slice(0, 2).join("; ")} ${JSON.stringify(cmp.bad)}`);
  if (writeDir) writeFileSync(join(writeDir, basename(f).replace(/\.xml$/i, ".xer")), r.text);
}
if (out.mspdi.length) {
  const ok = out.mspdi.filter((s) => !s.error);
  const sum = (k) => ok.reduce((a, s) => a + (typeof k === "function" ? k(s) : s[k]), 0);
  console.log(`MSPDI: ${ok.length} files (${out.mspdi.length - ok.length} not read); P6 import problems in ${ok.filter((s) => s.problems.length).length}; activities intact ${sum("allFields")}/${sum("activities")}; links ${sum("linksKept")}/${sum("links")} (${sum("linksExtra")} extra); code assignments ${sum("codesKept")}/${sum("codes")}; custom field values as UDFs ${sum("udfsKept")}/${sum("udfs")} (${sum("udfsTyped")} with the type, ${sum("udfsExtra")} extra) in ${sum("udfFields")} fields of ${ok.filter((s) => s.udfFields).length} files; schedule equal ${sum((s) => s.schedule.same)}/${sum((s) => s.schedule.open)} open activities; ${sum("resources")} resources, ${sum("assignments")} assignments written`);
}

const projectRules = { sched_float_type: "FT_SmallestFloat", sched_calendar_on_relationship_lag: "rcal_Successor", sched_retained_logic: "Y", sched_progress_override: "N", sched_use_project_end_date_for_float: "Y", sched_use_expect_end_flag: "N" };
for (const f of list(opt("--xer"), /\.xer$/i)) {
  const t0 = Date.now();
  const X = parseXer(decodeXer(readFileSync(f)));
  const conv = mspdiText(X);
  const r = p6XerText(conv.xml);
  const B = parseXer(r.text);
  const ms = Date.now() - t0;
  const problems = p6Problems(r.xer.tables);
  const pid = conv.project.id;
  const span = (t) => t.task_type === "TT_LOE" || t.task_type === "TT_WBS";
  const spanIds = new Set(X.tables.TASK.filter(span).map((t) => t.task_id));
  const orig = X.tables.TASK.filter((t) => t.proj_id === pid && conv.taskUid.has(t.task_id));
  const byCode = new Map(B.tables.TASK.map((t) => [t.task_code, t]));
  const P6code = new Map(orig.map((t) => [t.task_id, t.task_code.replace(/""/g, '"')]));
  const codeOfB = new Map(B.tables.TASK.map((t) => [t.task_id, t.task_code]));
  let found = 0;
  const pairs = [];
  for (const a of orig) {
    const b = byCode.get(P6code.get(a.task_id));
    if (!b) continue;
    found++;
    if (span(a)) continue; // written to Project as manual tasks; they come back as start-on-or-after
    let c = CSTR_BACK[a.cstr_type] || a.cstr_type || "", d = a.cstr_date;
    if (!c && a.external_early_start_date && (a.status_code || "TK_NotStart") === "TK_NotStart") { c = "CS_MSOA"; d = a.external_early_start_date; }
    pairs.push([a, b, c, d]);
  }
  const cmp = compareTasks(pairs, X.tables, B.tables, show);
  // links, by activity ID; those into or out of LOE / WBS summary activities go to notes in Project
  const want = new Set();
  for (const l of X.tables.TASKPRED || []) {
    if (!P6code.has(l.task_id) || !P6code.has(l.pred_task_id) || spanIds.has(l.task_id) || spanIds.has(l.pred_task_id)) continue;
    want.add(linkKey(P6code.get(l.task_id), P6code.get(l.pred_task_id), l.pred_type, num(l.lag_hr_cnt) || 0));
  }
  const got = new Set(B.tables.TASKPRED.map((l) => linkKey(codeOfB.get(l.task_id), codeOfB.get(l.pred_task_id), l.pred_type, num(l.lag_hr_cnt) || 0)));
  // activity codes: type name and code value per activity (as msproject.mjs writes them)
  const codesB = codeSet(B.tables, (id) => codeOfB.get(id));
  const typesWritten = new Set((r.xer.tables.ACTVTYPE || []).map((t) => t.actv_code_type));
  const codesA = new Set([...codeSet(X.tables, (id) => P6code.get(id))].filter((k) => typesWritten.has(k.split("|")[1])));
  // WBS path by names
  const wbsPath = (T, id) => { const w = new Map((T.PROJWBS || []).map((x) => [x.wbs_id, x])); const p = []; let x = w.get(id), h = 0; while (x && x.proj_node_flag !== "Y" && h++ < 100) { p.unshift(x.wbs_name); x = w.get(x.parent_wbs_id); } return p.join(" / "); };
  // activity UDFs msproject.mjs wrote to Number, Cost and Date fields (text ones go to Text fields, read back as codes)
  const numericIds = new Set((conv.udfFields?.fields || []).filter((f) => f.kind !== "text").map((f) => f.typeId));
  const udfA = udfSet(X.tables, (id) => P6code.get(id), (u) => numericIds.has(u.udf_type_id));
  const udfB = udfSet(B.tables, (id) => codeOfB.get(id));
  const backType = (t) => (t === "FT_END_DATE" ? "FT_START_DATE" : t);
  const udfTA = new Set([...udfSet(X.tables, (id) => P6code.get(id), (u) => numericIds.has(u.udf_type_id), true)].map((k) => k.replace(/\|([A-Z_0-9]+)$/, (m, t) => `|${backType(t)}`)));
  const udfTB = udfSet(B.tables, (id) => codeOfB.get(id), undefined, true);
  const allA = udfSet(X.tables, (id) => P6code.get(id));
  const wbsSame = pairs.filter(([a, b]) => wbsPath(X.tables, a.wbs_id) === wbsPath(B.tables, b.wbs_id)).length;
  // schedule: the original under Project's rules (as msproject-check.mjs builds it) vs the returned XER as written
  const hasPred = new Set((X.tables.TASKPRED || []).filter((l) => P6code.has(l.pred_task_id) && !spanIds.has(l.pred_task_id)).map((l) => l.task_id));
  const asProject = { ...X, tables: { ...X.tables,
    SCHEDOPTIONS: (X.tables.SCHEDOPTIONS || [{ proj_id: pid }]).map((o) => (o.proj_id === pid ? { ...o, ...projectRules } : o)),
    PROJECT: X.tables.PROJECT.map((p) => (p.proj_id === pid ? { ...p, plan_end_date: "" } : p)),
    TASK: X.tables.TASK.map((t) => {
      if (t.proj_id !== pid) return t;
      let u = t.task_type === "TT_Mile" && hasPred.has(t.task_id) ? { ...t, task_type: "TT_FinMile" } : t;
      if (u.external_early_start_date || u.external_late_end_date) {
        u = { ...u, external_early_start_date: "", external_late_end_date: "" };
        if (t.external_early_start_date && !t.cstr_type && t.status_code === "TK_NotStart") u = { ...u, cstr_type: "CS_MSOA", cstr_date: t.external_early_start_date };
      }
      return u;
    }),
    TASKPRED: (X.tables.TASKPRED || []).filter((l) => !(spanIds.has(l.task_id) || spanIds.has(l.pred_task_id))) } };
  const sc = schedCmp(pairs, schedule(asProject), schedule(B));
  const s = {
    file: basename(f), version: X.version, project: conv.project.name, ms, bytes: r.text.length,
    activities: orig.length, idsBack: found, spans: orig.filter(span).length, compared: cmp.n, allFields: cmp.all, fields: cmp.fields,
    links: want.size, linksKept: [...want].filter((k) => got.has(k)).length, linksExtra: [...got].filter((k) => !want.has(k)).length,
    codes: codesA.size, codesKept: [...codesA].filter((k) => codesB.has(k)).length, wbsSame, problems,
    udfsAll: allA.size, udfs: udfA.size, udfsKept: kept(udfA, udfB), udfsTyped: kept(udfTA, udfTB), udfsExtra: [...udfB].filter((k) => !udfA.has(k)).length,
    udfMiss: [...udfA].filter((k) => !udfB.has(k)).slice(0, 3), udfTypeMiss: [...udfTA].filter((k) => !udfTB.has(k)).slice(0, 3),
    resources: r.counts.resources, assignments: r.counts.assignments, schedule: sc, warnings: r.warnings, bad: cmp.bad,
  };
  out.xer.push(s);
  console.log(`${s.file} (${s.project}, P6 ${s.version}): IDs back ${found}/${orig.length}; ${cmp.all}/${cmp.n} intact ${JSON.stringify(cmp.fields)}; WBS path ${wbsSame}/${cmp.n}; links ${s.linksKept}/${s.links} (${s.linksExtra} extra); codes ${s.codesKept}/${s.codes}; UDFs ${s.udfsKept}/${s.udfs} of ${s.udfsAll} activity UDF values (${s.udfsTyped} with the type, ${s.udfsExtra} extra) ${s.udfMiss.length ? JSON.stringify(s.udfMiss) : ""}${s.udfTypeMiss.length ? ` type: ${JSON.stringify(s.udfTypeMiss)}` : ""}; schedule ${sc.same}/${sc.open} ${JSON.stringify(sc.miss)}; ${s.resources} resources, ${s.assignments} assignments; problems ${problems.length} ${problems.slice(0, 3).join("; ")}; ${ms} ms`);
  for (const b of cmp.bad) console.log("   ", JSON.stringify(b));
  if (writeDir) writeFileSync(join(writeDir, basename(f).replace(/\.xer$/i, "-via-project.xer")), r.text);
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 2));
