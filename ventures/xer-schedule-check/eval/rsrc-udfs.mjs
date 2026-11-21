// Resource user-defined fields through Microsoft Project XML and back.
//
// For each XER file: msproject.mjs writes the MSPDI (resource UDFs as
// Project's resource Text, Number, Cost and Date fields, each renamed to the
// UDF's title), p6xer.mjs turns that XML back into an XER, and this checks,
// for every resource UDF value of a resource the XML carries, that the XER
// that comes back holds a resource UDF with the same title and the same value
// on the same resource (matched by resource ID, rsrc_short_name): numbers
// within 1e-9, costs to the cent, dates to the minute, text exactly. It also
// runs p6Problems on the XER that comes back.
//
//   node eval/rsrc-udfs.mjs <dir-or-files...> [--json out.json] [--xml-dir D] [--mpxj D]
//   node eval/rsrc-udfs.mjs --plant <public example_xer_file.xer> <out-dir>
//
// --plant adds the UDF kinds no public file carries on resources (integer,
// decimal, cost with negatives, start date, finish date) to a public XER's
// resources and writes <out-dir>/rsrc-udfs-planted.xer.
// --xml-dir D saves each .xml and each XER that comes back (<name>.back.xer)
// in D; after `python eval/rsrc-udfs-mpxj.py D/<name>.xml D/<name>.back.xer
// D/<name>.rsrc.json`, --mpxj D compares MPXJ's reading of both files (an
// independent reader) with the values meant.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, xerText, parseDate, num } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";

const args = process.argv.slice(2);
if (args[0] === "--plant") {
  const x = parseXer(decodeXer(readFileSync(args[1])));
  const T = x.tables;
  const kinds = [
    ["Day rate", "FT_MONEY", (i) => (412.5 + 37.25 * i).toFixed(2)],
    ["Rate adjustment", "FT_MONEY", (i) => (i % 3 ? (-12.5 * i).toFixed(2) : null)],
    ["Induction date", "FT_START_DATE", (i) => `2026-03-${String(2 + (i % 27)).padStart(2, "0")} 08:00`],
    ["Contract ends", "FT_END_DATE", (i) => (i % 4 ? `2026-12-${String(1 + (i % 28)).padStart(2, "0")} 17:00` : null)],
    ["Crew size", "FT_INT", (i) => String(1 + (i % 6))],
    ["Productivity factor", "FT_FLOAT_2_DECIMALS", (i) => String(0.75 + 0.05 * (i % 9))],
  ];
  const base = 9100;
  for (const [k, [label, type]] of kinds.entries()) T.UDFTYPE.push({ udf_type_id: String(base + k), table_name: "RSRC", udf_type_name: `user_field_${base + k}`, udf_type_label: label, logical_data_type: type, super_flag: "N", indicator_expression: "", summary_indicator_expression: "", export_flag: "" });
  let n = 0;
  kinds.forEach(([, type, pick], k) => T.RSRC.forEach((r, i) => {
    const v = pick(i);
    if (v === null) return;
    T.UDFVALUE.push({ udf_type_id: String(base + k), fk_id: r.rsrc_id, proj_id: "", udf_date: type.includes("DATE") ? v : "", udf_number: type.includes("DATE") ? "" : v, udf_text: "", udf_code_id: "" });
    n++;
  }));
  writeFileSync(join(args[2] || ".", "rsrc-udfs-planted.xer"), xerText(x));
  console.log(n, "planted values in", kinds.length, "resource UDFs on", T.RSRC.length, "resources");
  process.exit(0);
}

const valOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const jsonOut = valOf("--json"), xmlDir = valOf("--xml-dir"), mpxjDir = valOf("--mpxj");
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--json", "--xml-dir", "--mpxj"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const nm = (s) => String(s ?? "").replace(/""/g, '"');
const KIND = { FT_INT: "number", FT_FLOAT: "number", FT_FLOAT_2_DECIMALS: "number", FT_MONEY: "cost", FT_START_DATE: "date", FT_END_DATE: "date", FT_TEXT: "text" };
const label = (u) => nm(u.udf_type_label || u.udf_type_name || `UDF ${u.udf_type_id}`).replace(/\[/g, "(").replace(/\]/g, ")").trim();

const out = [];
for (const f of files) {
  const name = basename(f).replace(/\.xer$/i, "");
  const xer = parseXer(decodeXer(readFileSync(f)));
  const T = xer.tables;
  const types = new Map((T.UDFTYPE || []).filter((u) => u.table_name === "RSRC").map((u) => [u.udf_type_id, u]));
  const r = mspdiText(xer);
  // resources the XML writes are those with an assignment in the project
  const pid = r.project.id;
  const tasks = new Set((T.TASK || []).filter((t) => t.proj_id === pid).map((t) => t.task_id));
  const used = new Set((T.TASKRSRC || []).filter((a) => tasks.has(a.task_id)).map((a) => a.rsrc_id));
  const rsrcShort = new Map((T.RSRC || []).map((x) => [x.rsrc_id, x.rsrc_short_name]));
  const back = p6XerText(r.xml);
  const B = parseXer(back.text).tables;
  if (xmlDir) { writeFileSync(join(xmlDir, `${name}.xml`), r.xml); writeFileSync(join(xmlDir, `${name}.back.xer`), back.text); }
  const bShort = new Map((B.RSRC || []).map((x) => [x.rsrc_id, x.rsrc_short_name]));
  const bTypes = new Map((B.UDFTYPE || []).filter((u) => u.table_name === "RSRC").map((u) => [u.udf_type_id, u]));
  const bVal = new Map(); // `${label}|${rsrc short}` -> row
  for (const v of B.UDFVALUE || []) { const u = bTypes.get(v.udf_type_id); if (u) bVal.set(`${u.udf_type_label}|${bShort.get(v.fk_id)}`, { v, u }); }
  const per = { file: basename(f), resourceUdfTypes: types.size, valuesInFile: 0, onWrittenResources: 0, byKind: {}, back: 0, wrong: [], missing: [], typeKept: 0, typeChanged: [], problems: p6Problems(B).length, warnings: r.warnings.filter((w) => /resource user-defined/.test(w)) };
  const changed = new Set();
  for (const v of T.UDFVALUE || []) {
    const u = types.get(v.udf_type_id);
    if (!u) continue;
    per.valuesInFile++;
    if (!used.has(v.fk_id)) continue;
    const kind = KIND[u.logical_data_type];
    if (!kind) continue;
    if (kind === "text" && !nm(v.udf_text).trim()) continue;
    per.onWrittenResources++;
    const k = (per.byKind[kind] ||= { meant: 0, back: 0 });
    k.meant++;
    const got = bVal.get(`${label(u)}|${rsrcShort.get(v.fk_id)}`);
    if (!got) { per.missing.push(`${label(u)} on ${rsrcShort.get(v.fk_id)}`); continue; }
    let ok;
    if (kind === "date") ok = parseDate(got.v.udf_date) === parseDate(v.udf_date);
    else if (kind === "cost") ok = Math.round(num(got.v.udf_number) * 100) === Math.round(num(v.udf_number) * 100);
    else if (kind === "number") ok = Math.abs(num(got.v.udf_number) - num(v.udf_number)) < 1e-9;
    else ok = got.v.udf_text === nm(v.udf_text).slice(0, 255);
    if (ok) { per.back++; k.back++; } else per.wrong.push(`${label(u)} on ${rsrcShort.get(v.fk_id)}: ${JSON.stringify(v)} -> ${JSON.stringify(got.v)}`);
    if (!changed.has(u.udf_type_id)) {
      changed.add(u.udf_type_id);
      if (got.u.logical_data_type === u.logical_data_type) per.typeKept++;
      else per.typeChanged.push(`${label(u)}: ${u.logical_data_type} -> ${got.u.logical_data_type}`);
    }
  }
  if (mpxjDir && existsSync(join(mpxjDir, `${name}.rsrc.json`))) {
    // MPXJ's reading: { xml: { aliases: {Text1: title}, cells: {rsrcName: {Text1: v}} }, xer: { cells: {rsrcShort: {title: v}} } }
    const m = JSON.parse(readFileSync(join(mpxjDir, `${name}.rsrc.json`), "utf8"));
    const meant = new Map(r.rsrcUdfFields.fields.map((fl) => [fl.fieldName, fl]));
    let aliases = 0, aliasOk = 0, cells = 0, cellOk = 0, xerCells = 0, xerOk = 0;
    const bad = [];
    for (const [fname, fl] of meant) { aliases++; if (m.xml.aliases[fname] === fl.alias) aliasOk++; else bad.push(`alias ${fname}: ${m.xml.aliases[fname]} != ${fl.alias}`); }
    const rName = new Map((T.RSRC || []).map((x) => [x.rsrc_id, nm(x.rsrc_name || x.rsrc_short_name || x.rsrc_id)]));
    for (const [fname, fl] of meant) {
      for (const [rid, x] of fl.values) {
        cells++;
        const got = m.xml.cells[rName.get(rid)]?.[fname];
        const want = fl.kind === "cost" ? Number(x) / 100 : fl.kind === "number" ? Number(x) : fl.kind === "date" ? x.slice(0, 16) : x;
        const ok = fl.kind === "cost" || fl.kind === "number" ? Math.abs(Number(got) - want) < 1e-6 : got === want;
        if (ok) cellOk++; else if (bad.length < 20) bad.push(`xml ${fname} on ${rName.get(rid)}: ${got} != ${want}`);
        // the XER that comes back, as MPXJ reads it: the UDF titled with the alias
        xerCells++;
        const g2 = m.xer.cells[rsrcShort.get(rid)]?.[fl.alias];
        const ok2 = fl.kind === "cost" || fl.kind === "number" ? Math.abs(Number(g2) - want) < 1e-6 : g2 === want;
        if (ok2) xerOk++; else if (bad.length < 20) bad.push(`xer ${fl.alias} on ${rsrcShort.get(rid)}: ${g2} != ${want}`);
      }
    }
    per.mpxj = { aliases: `${aliasOk}/${aliases}`, xmlCells: `${cellOk}/${cells}`, xerCells: `${xerOk}/${xerCells}`, bad };
  }
  out.push(per);
  console.log(`${per.file}: ${per.resourceUdfTypes} resource UDF types, ${per.valuesInFile} values, ${per.onWrittenResources} on written resources, ${per.back} back the same (${Object.entries(per.byKind).map(([k, v]) => `${k} ${v.back}/${v.meant}`).join(", ") || "none"}), ${per.missing.length} missing, ${per.wrong.length} wrong, types kept ${per.typeKept}${per.typeChanged.length ? `, changed: ${per.typeChanged.join("; ")}` : ""}, p6Problems ${per.problems}${per.mpxj ? `; MPXJ aliases ${per.mpxj.aliases}, XML cells ${per.mpxj.xmlCells}, XER cells ${per.mpxj.xerCells}` : ""}`);
  for (const w of [...per.missing, ...per.wrong, ...(per.mpxj?.bad || [])].slice(0, 8)) console.log("   ", w);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
