// Start and finish custom fields through P6 and back, 2026-11-22
// (eval/finish-udfs-2026-11-22.md).
//
// MPXJ's junit/data/generated/task-starts and task-finishes folders hold
// Project XML files saved by Microsoft Project 2003 to 2019: one task per
// field, named after it (task "Finish3" sets Finish3). For each file:
//   1. read it (mspdi.mjs): each set Start field must come back as a
//      start-date UDF, each Finish field as a finish-date UDF, titled by the
//      field and holding the value on the task with that name;
//   2. write it as XER (p6xer.mjs): the same in P6's UDFTYPE/UDFVALUE, no
//      p6Problems;
//   3. write that XER back as Project XML (msproject.mjs): every value must
//      land in a field of its own kind (Date for start dates, Finish for
//      finish dates) with the title and value it started with.
//
// With --xer FILE... it also sends P6 files through Project XML and back and
// counts date UDF values that come back with the same kind, title, activity
// ID and date.
//
//   node eval/finish-udfs.mjs --mpxj <mpxj>/junit/data/generated [--xer a.xer ...] [--json out.json]

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseMspdi, parseXml } from "../mspdi.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { parseXer } from "../xer.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const mpxj = opt("--mpxj");
const xers = [];
for (let i = args.indexOf("--xer") + 1; i > 0 && i < args.length && !args[i].startsWith("--"); i++) xers.push(args[i]);
const out = { mspdi: [], xer: [] };

const KIND = { Start: "FT_START_DATE", Finish: "FT_END_DATE" };
const minute = (s) => (s || "").replace("T", " ").slice(0, 16);

if (mpxj) {
  for (const dir of ["task-starts", "task-finishes"]) {
    const d = join(mpxj, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((n) => n.endsWith("-mspdi.xml")).sort()) {
      const xml = readFileSync(join(d, f), "utf8");
      // expected: task name FieldN -> its value, read straight from the XML
      const proj = parseXml(xml).children.find((c) => c.name === "Project");
      const defs = new Map(proj.children.find((c) => c.name === "ExtendedAttributes")?.children.map((e) => [e.children.find((c) => c.name === "FieldID").text.trim(), e.children.find((c) => c.name === "FieldName")?.text.trim()]) || []);
      const want = [];
      for (const t of proj.children.find((c) => c.name === "Tasks").children) {
        const name = t.children.find((c) => c.name === "Name")?.text.trim() || "";
        for (const e of t.children.filter((c) => c.name === "ExtendedAttribute")) {
          const id = e.children.find((c) => c.name === "FieldID").text.trim();
          const v = e.children.find((c) => c.name === "Value")?.text.trim();
          const fname = defs.get(id);
          if (!v || !/^(Start|Finish)\d+$/.test(fname || "")) continue;
          want.push({ task: name, field: fname, kind: KIND[fname.match(/^\D+/)[0]], value: minute(v), id });
        }
      }
      const row = { file: `${dir}/${f}`, values: want.length, nameMatchesField: want.filter((w) => w.task === w.field).length, read: 0, xer: 0, back: 0, backSameKindField: 0, problems: [] };
      // 1. read
      const T = parseMspdi(xml).tables;
      const types = new Map((T.UDFTYPE || []).map((u) => [u.udf_type_id, u]));
      const taskName = new Map(T.TASK.map((t) => [t.task_id, t.task_name]));
      const got = (tabs, tn) => (tabs.UDFVALUE || []).map((v) => { const u = (tabs.UDFTYPE || []).find((x) => x.udf_type_id === v.udf_type_id); return { task: tn.get(v.fk_id), field: u.udf_type_label, kind: u.logical_data_type, value: minute(v.udf_date) }; });
      const has = (list, w) => list.some((g) => g.task === w.task && g.field === w.field && g.kind === w.kind && g.value === w.value);
      const r1 = got(T, taskName);
      row.read = want.filter((w) => has(r1, w)).length;
      // 2. XER
      const x = p6XerText(xml);
      const B = parseXer(x.text).tables;
      row.problems = p6Problems(B);
      const r2 = got(B, new Map(B.TASK.map((t) => [t.task_id, t.task_name])));
      row.xer = want.filter((w) => has(r2, w)).length;
      // 3. back to Project XML
      const m = mspdiText(parseXer(x.text));
      const P = parseXml(m.xml).children.find((c) => c.name === "Project");
      const alias = new Map(P.children.find((c) => c.name === "ExtendedAttributes").children.map((e) => [e.children.find((c) => c.name === "FieldID").text.trim(), { name: e.children.find((c) => c.name === "FieldName")?.text.trim(), alias: e.children.find((c) => c.name === "Alias")?.text.trim() }]));
      const r3 = [];
      for (const t of P.children.find((c) => c.name === "Tasks").children) {
        const name = t.children.find((c) => c.name === "Name")?.text.trim() || "";
        for (const e of t.children.filter((c) => c.name === "ExtendedAttribute")) {
          const a = alias.get(e.children.find((c) => c.name === "FieldID").text.trim());
          if (!a || !/^(Date|Finish|Start)\d+$/.test(a.name)) continue;
          r3.push({ task: name, field: a.alias, fieldName: a.name, value: minute(e.children.find((c) => c.name === "Value")?.text.trim()) });
        }
      }
      for (const w of want) {
        const hit = r3.find((g) => g.task === w.task && g.field === w.field && g.value === w.value);
        if (!hit) continue;
        row.back++;
        if ((w.kind === "FT_END_DATE") === hit.fieldName.startsWith("Finish")) row.backSameKindField++;
      }
      out.mspdi.push(row);
    }
  }
}

for (const f of xers) {
  const T = parseXer(readFileSync(f, "utf8")).tables;
  const key = (tabs) => {
    const ty = new Map((tabs.UDFTYPE || []).filter((u) => u.table_name === "TASK").map((u) => [u.udf_type_id, u]));
    const code = new Map(tabs.TASK.map((t) => [t.task_id, t.task_code]));
    return (tabs.UDFVALUE || []).filter((v) => ty.has(v.udf_type_id) && /DATE/.test(ty.get(v.udf_type_id).logical_data_type) && v.udf_date && code.has(v.fk_id))
      .map((v) => { const u = ty.get(v.udf_type_id); return `${code.get(v.fk_id)}|${u.udf_type_label}|${u.logical_data_type}|${minute(v.udf_date)}`; });
  };
  const projects = (T.PROJECT || []).map((p) => p.proj_id);
  const row = { file: f.split("/").pop(), dateValues: 0, start: 0, finish: 0, back: 0, backStart: 0, backFinish: 0, sameDateWrongKind: 0 };
  for (const pid of projects) {
    let m;
    try { m = mspdiText(parseXer(readFileSync(f, "utf8")), { projId: pid }); } catch { continue; }
    const B = parseXer(p6XerText(m.xml).text).tables;
    // the activities of this project only
    const mine = new Set(T.TASK.filter((t) => t.proj_id === pid).map((t) => t.task_id));
    const before = key({ ...T, TASK: T.TASK.filter((t) => mine.has(t.task_id)) });
    const after = new Set(key(B));
    const loose = new Set(key(B).map((k) => k.split("|").filter((_, i) => i !== 2).join("|")));
    for (const k of before) {
      row.dateValues++;
      const fin = k.includes("|FT_END_DATE|");
      if (fin) row.finish++; else row.start++;
      if (after.has(k)) { row.back++; if (fin) row.backFinish++; else row.backStart++; }
      else if (loose.has(k.split("|").filter((_, i) => i !== 2).join("|"))) row.sameDateWrongKind++;
    }
  }
  out.xer.push(row);
}

console.table(out.mspdi.map((r) => ({ file: r.file, values: r.values, read: r.read, xer: r.xer, back: r.back, sameKind: r.backSameKindField, problems: r.problems.length })));
if (out.xer.length) console.table(out.xer);
const sum = (k) => out.mspdi.reduce((a, r) => a + r[k], 0);
console.log(`Project files: ${out.mspdi.length}; values ${sum("values")}; read with kind ${sum("read")}; XER ${sum("xer")}; back in Project ${sum("back")}, in a field of their kind ${sum("backSameKindField")}; files with P6 problems ${out.mspdi.filter((r) => r.problems.length).length}`);
const j = opt("--json");
if (j) writeFileSync(j, JSON.stringify(out, null, 1) + "\n");
