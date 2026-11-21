// Activity user-defined fields through Microsoft Project XML and back. For
// each XER file, write the MSPDI with msproject.mjs (UDFs as Number, Cost,
// Date and free Text fields), read it back with mspdi.mjs, and check every
// activity UDF value of the project's activities: numbers, costs and dates
// come back as UDFs with the same title and value; text UDFs come back as a
// text field (read as an activity code) with the same title and value.
//
//   node eval/msproject-udfs.mjs <dir-or-files...> [--json out.json] [--xml-dir D] [--mpxj D]
//
// --xml-dir D also saves each .xml in D; then, after
// `python eval/msproject-udfs-mpxj.py D/<file>.xml D/<file>.udf.json` for each,
// `--mpxj D` compares MPXJ's reading of every custom field with what was written.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, parseDate, num } from "../xer.mjs";
import { parseMspdi } from "../mspdi.mjs";
import { mspdiText } from "../msproject.mjs";

const args = process.argv.slice(2);
const valOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const jsonOut = valOf("--json"), xmlDir = valOf("--xml-dir"), mpxjDir = valOf("--mpxj");
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--json", "--xml-dir", "--mpxj"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const nm = (s) => String(s ?? "").replace(/""/g, '"');
const KIND = { FT_INT: "number", FT_FLOAT: "number", FT_FLOAT_2_DECIMALS: "number", FT_MONEY: "cost", FT_START_DATE: "date", FT_END_DATE: "date", FT_TEXT: "text" };
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const T = xer.tables;
  const types = new Map((T.UDFTYPE || []).filter((u) => u.table_name === "TASK").map((u) => [u.udf_type_id, u]));
  const r = mspdiText(xer);
  const pid = r.project.id;
  const tasks = new Map((T.TASK || []).filter((t) => t.proj_id === pid).map((t) => [t.task_id, t]));
  if (xmlDir) writeFileSync(join(xmlDir, basename(f).replace(/\.xer$/i, ".xml")), r.xml);
  const back = parseMspdi(r.xml);
  const B = back.tables;
  // task uid in the XML -> P6 task_id; the reader's task_code is the UID
  const idOfUid = new Map([...r.taskUid].map(([taskId, uid]) => [String(uid), taskId]));
  const fieldOf = new Map(r.udfFields.fields.map((x) => [x.typeId, x]));
  // read back: title -> Map(task_id -> value)
  const backBy = new Map();
  const bTypes = new Map((B.UDFTYPE || []).map((u) => [u.udf_type_id, u]));
  for (const v of B.UDFVALUE || []) {
    const u = bTypes.get(v.udf_type_id);
    if (!backBy.has(u.udf_type_label)) backBy.set(u.udf_type_label, { kind: KIND[u.logical_data_type], vals: new Map() });
    backBy.get(u.udf_type_label).vals.set(idOfUid.get(v.fk_id), u.logical_data_type.includes("DATE") ? v.udf_date : num(v.udf_number));
  }
  const bCodeType = new Map((B.ACTVTYPE || []).map((t) => [t.actv_code_type_id, t.actv_code_type]));
  const bCode = new Map((B.ACTVCODE || []).map((c) => [c.actv_code_id, c]));
  for (const a of B.TASKACTV || []) {
    const label = bCodeType.get(a.actv_code_type_id);
    if (!backBy.has(label)) backBy.set(label, { kind: "text", vals: new Map() });
    const c = bCode.get(a.actv_code_id);
    backBy.get(label).vals.set(idOfUid.get(a.task_id), c.short_name === c.actv_code_name ? c.short_name : c.actv_code_name);
  }
  const res = { file: basename(f), project: r.project.name, byKind: {}, written: r.udfFields.written, left: r.udfFields.dropped, mismatches: [] };
  for (const v of T.UDFVALUE || []) {
    const u = types.get(v.udf_type_id);
    if (!u || !tasks.has(v.fk_id)) continue;
    const kind = KIND[u.logical_data_type] || "other";
    let want = kind === "date" ? (parseDate(v.udf_date) === null ? null : v.udf_date.slice(0, 16)) : kind === "text" ? nm(v.udf_text).trim() : num(v.udf_number);
    if (want === null || want === "") continue;
    const k = (res.byKind[kind] ||= { values: 0, carried: 0, same: 0, notWritten: 0 });
    k.values++;
    const fld = fieldOf.get(u.udf_type_id);
    if (!fld) { k.notWritten++; continue; }
    k.carried++;
    const got = backBy.get(fld.alias)?.vals.get(v.fk_id);
    const ok = kind === "number" || kind === "cost" ? got !== undefined && Math.abs(got - want) < 1e-9 * Math.max(1, Math.abs(want)) : got === want;
    if (ok) k.same++;
    else if (res.mismatches.length < 20) res.mismatches.push({ field: fld.alias, task: tasks.get(v.fk_id).task_code, want, got: got ?? null });
  }
  if (mpxjDir) {
    const p = join(mpxjDir, basename(f).replace(/\.xer$/i, ".udf.json"));
    if (existsSync(p)) {
      const m = JSON.parse(readFileSync(p, "utf8"));
      const mm = { aliases: 0, aliasSame: 0, cells: 0, cellSame: 0, extra: 0, examples: [] };
      for (const fld of r.udfFields.fields) {
        mm.aliases++;
        if (m.aliases[fld.fieldName] === fld.alias) mm.aliasSame++;
        for (const [taskId, x] of fld.values) {
          mm.cells++;
          const want = fld.kind === "cost" ? Number(x) / 100 : fld.kind === "number" ? Number(x) : fld.kind === "date" ? x.slice(0, 16) : x;
          const got = m.tasks[tasks.get(taskId).task_code]?.[fld.fieldName];
          const ok = typeof want === "number" ? got !== undefined && Math.abs(Number(got) - want) < 1e-6 * Math.max(1, Math.abs(want)) : String(got ?? "").slice(0, 16) === want;
          if (ok) mm.cellSame++;
          else if (mm.examples.length < 10) mm.examples.push({ field: fld.fieldName, task: tasks.get(taskId).task_code, want, got: got ?? null });
        }
      }
      res.mpxj = mm;
    }
  }
  out.push(res);
  const kinds = Object.entries(res.byKind).map(([k, v]) => `${k} ${v.same}/${v.carried} back (${v.notWritten} of ${v.values} not written)`).join("; ");
  console.log(`${res.file}: ${kinds || "no activity UDF values"}${res.mpxj ? `; MPXJ aliases ${res.mpxj.aliasSame}/${res.mpxj.aliases}, cells ${res.mpxj.cellSame}/${res.mpxj.cells}` : ""}`);
  for (const w of r.warnings.filter((w) => /user-defined/.test(w))) console.log("  warning:", w);
  for (const x of res.mismatches.slice(0, 5)) console.log("  mismatch:", JSON.stringify(x));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
