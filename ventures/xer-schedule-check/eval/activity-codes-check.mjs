// The Gantt chart grouped by activity code (gantt.mjs groupBy, actvcodes.mjs)
// against the file's own TASKACTV, ACTVCODE and PROJWBS tables, read here
// independently of actvcodes.mjs.
//
//   node eval/activity-codes-check.mjs <dir-or-files...> [--json out.json]
//
// For every project with a chart and every code type its activities carry,
// the chart grouped by that type alone, then by that type and the WBS:
//   once      every activity of the WBS chart is on the grouped chart exactly once;
//   place     the group rows above an activity, outermost first, are the value
//             TASKACTV gives it and that value's ACTVCODE parents (or the single
//             "no <type>" group), followed (type + WBS) by its PROJWBS branch;
//   count     every group row's count is the number of activities under it, and
//             each value's count equals the TASKACTV tally of drawn activities
//             holding that value or a value below it;
//   rollup    every group row spans exactly the earliest start and latest finish
//             of the activities under it;
//   order     siblings follow ACTVCODE seq_num (PROJWBS seq_num for WBS rows),
//             "no <type>" last.
// No P6 output is compared: the XER stores no layout. These are the rules a
// P6 user expects from Group and Sort by a code, checked on real code sets.
// eval/activity-codes-2026-11-21.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule } from "../cpm.mjs";
import { gantt } from "../gantt.mjs";
import { codeTypes } from "../actvcodes.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("-") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

const out = [];
for (const f of files) {
  const name = f.split("/").pop();
  const xer = parseXer(decodeXer(readFileSync(f)));
  const T = xer.tables;
  if (!(T.TASKACTV || []).length) { out.push({ file: name, types: 0, note: "no activity codes" }); continue; }
  const result = schedule(xer);
  const base = gantt(xer, { result });
  const pid = base.project.id;
  const drawn = base.rows.filter((r) => r.kind === "task");
  const taskWbs = new Map((T.TASK || []).map((t) => [t.task_id, t.wbs_id]));
  const code = new Map((T.ACTVCODE || []).map((c) => [c.actv_code_id, c]));
  const wbs = new Map((T.PROJWBS || []).map((w) => [w.wbs_id, w]));
  const rec = { file: name, project: base.project.code, activities: drawn.length, types: 0, charts: 0, once: [0, 0], place: [0, 0], count: [0, 0], tally: [0, 0], rollup: [0, 0], order: [0, 0], ms: 0, perType: [] };
  const ok = (k, good) => { rec[k][0] += good ? 1 : 0; rec[k][1]++; return good; };
  for (const type of codeTypes(xer, pid).filter((t) => t.assigned)) {
    rec.types++;
    const held = new Map();
    for (const a of T.TASKACTV) if (a.actv_code_type_id === type.id && !held.has(a.task_id) && code.has(a.actv_code_id)) held.set(a.task_id, a.actv_code_id);
    const chainOf = (id) => { const c = []; for (let k = id; k && code.has(k); k = code.get(k).parent_actv_code_id) c.unshift(code.get(k)); return c; };
    const wbsChain = (id) => { const c = []; for (let k = id; k && wbs.has(k) && wbs.get(k).proj_node_flag !== "Y"; k = wbs.get(k).parent_wbs_id) c.unshift(wbs.get(k)); return c; };
    for (const levels of [[type.id], [type.id, "wbs"]]) {
      const t0 = performance.now();
      const g = gantt(xer, { result, groupBy: levels });
      rec.ms += performance.now() - t0;
      rec.charts++;
      const byKey = new Map(g.rows.map((r) => [r.key, r]));
      const tasks = g.rows.filter((r) => r.kind === "task");
      const seen = new Map();
      for (const r of tasks) seen.set(r.id, (seen.get(r.id) || 0) + 1);
      ok("once", tasks.length === drawn.length && drawn.every((r) => seen.get(r.id) === 1));
      for (const r of tasks) {
        const above = [];
        for (let k = r.parent; k; k = byKey.get(k)?.parent) above.unshift(byKey.get(k));
        const c = held.has(r.id) ? chainOf(held.get(r.id)) : null;
        const want = c ? c.map((v) => `${type.name}|${v.short_name}|${v.actv_code_name || v.short_name}`) : [`${type.name}||no ${type.name}`];
        if (levels.length === 2) for (const w of wbsChain(taskWbs.get(r.id))) want.push(`WBS|${w.wbs_short_name || ""}|${w.wbs_name || w.wbs_short_name || ""}`);
        ok("place", JSON.stringify(above.map((a) => `${a.level}|${a.code}|${a.name}`)) === JSON.stringify(want));
      }
      // counts, spans and sibling order, bottom-up from each row's children
      const kids = new Map();
      for (const r of g.rows) { if (!kids.has(r.parent)) kids.set(r.parent, []); kids.get(r.parent).push(r); }
      const under = (key) => { const acc = []; for (const k of kids.get(key) || []) { if (k.kind === "task") acc.push(k); else acc.push(...under(k.key)); } return acc; };
      for (const r of g.rows) {
        if (r.kind !== "wbs") continue;
        const t = under(r.key);
        ok("count", r.count === t.length);
        const s = Math.min(...t.map((x) => x.start)), e = Math.max(...t.map((x) => x.finish));
        ok("rollup", r.start === s && r.finish === e);
      }
      for (const [, list] of kids) {
        const groups = list.filter((r) => r.kind === "wbs");
        const seqOf = (r) => {
          if (r.name === `no ${r.level}` && r.code === "") return Infinity;
          const id = r.key.split("|").pop().split(":").slice(1).join(":");
          const src = r.level === "WBS" ? wbs.get(id) : code.get(id);
          return Number(src?.seq_num) || 0;
        };
        for (let i = 1; i < groups.length; i++) ok("order", seqOf(groups[i - 1]) <= seqOf(groups[i]));
      }
      if (levels.length === 1) {
        // each value's count against an independent tally (the value or one below it)
        const tally = new Map();
        for (const r of drawn) for (const v of held.has(r.id) ? chainOf(held.get(r.id)) : []) tally.set(v.actv_code_id, (tally.get(v.actv_code_id) || 0) + 1);
        for (const r of g.rows) {
          if (r.kind !== "wbs" || r.name === `no ${type.name}`) continue;
          const id = r.key.split("|").pop().split(":").slice(1).join(":");
          ok("tally", r.count === (tally.get(id) || 0));
        }
        rec.perType.push({ type: type.name, values: type.values, hierarchical: type.hierarchical, groups: g.summary.wbs, noValue: g.rows.find((r) => r.kind === "wbs" && r.depth === 0 && r.name === `no ${type.name}`)?.count || 0 });
      }
    }
  }
  rec.ms = Math.round(rec.ms);
  out.push(rec);
}

for (const r of out) {
  if (!r.charts) { console.log(`${r.file}: ${r.note}`); continue; }
  const f = (k) => `${k} ${r[k][0]}/${r[k][1]}`;
  console.log(`${r.file} (${r.project}, ${r.activities} activities, ${r.types} code types, ${r.charts} charts, ${r.ms} ms): ${["once", "place", "count", "tally", "rollup", "order"].map(f).join(", ")}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
