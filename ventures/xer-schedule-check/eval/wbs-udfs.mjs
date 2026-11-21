// WBS user-defined fields through Microsoft Project XML and back.
//
// For each XER file: msproject.mjs writes the MSPDI (WBS UDFs as the task
// Number, Cost, Date and Text fields of the summary tasks, each renamed to the
// UDF's title; a WBS UDF titled like an activity UDF of its kind shares that
// field), p6xer.mjs turns the XML back into an XER, and this checks, for every
// WBS UDF value on a WBS node the XML writes, that the XER that comes back
// holds a WBS UDF with the same title and value on the same node (matched by
// its path of WBS codes): numbers within 1e-9, costs to the cent, dates to the
// minute, text exactly. Values on the project node have no summary task and
// must be counted in the warnings. It also checks that every activity UDF
// value still comes back (a shared field must not leak WBS values onto
// activities or the other way) and runs p6Problems on the XER that comes back.
//
//   node eval/wbs-udfs.mjs <dir-or-files...> [--json out.json] [--xml-dir D] [--mpxj D]
//   node eval/wbs-udfs.mjs --plant <public file.xer> <out-dir>
//
// --plant adds WBS UDFs of every kind (no public file carries any) to a public
// XER's WBS nodes, including one titled like the file's first integer activity
// UDF and one like its first text activity UDF (so they share a field), and
// one value on the project node; it writes <out-dir>/<name>-wbs-planted.xer.
// --xml-dir D saves each .xml and .back.xer; after `python eval/wbs-udfs-mpxj.py
// D/<name>.xml D/<name>.back.xer D/<name>.wbs.json`, --mpxj D compares MPXJ's
// reading of both files (an independent reader) with the values meant.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, xerText, parseDate, num } from "../xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { p6XerText, p6Problems } from "../p6xer.mjs";

const args = process.argv.slice(2);
if (args[0] === "--plant") {
  const x = parseXer(decodeXer(readFileSync(args[1])));
  const T = x.tables;
  const pid = T.PROJECT[0].proj_id;
  const wbs = T.PROJWBS.filter((w) => w.proj_id === pid);
  const node = wbs.find((w) => w.proj_node_flag === "Y");
  const kids = wbs.filter((w) => w.proj_node_flag !== "Y");
  const taskTypes = (T.UDFTYPE || []).filter((u) => u.table_name === "TASK");
  const hasVals = (u) => (T.UDFVALUE || []).some((v) => v.udf_type_id === u.udf_type_id);
  const intTwin = taskTypes.find((u) => u.logical_data_type === "FT_INT" && hasVals(u));
  const textTwin = taskTypes.find((u) => u.logical_data_type === "FT_TEXT" && hasVals(u));
  const kinds = [
    ["Cost code", "FT_TEXT", (i) => `CC-${String(100 + i).padStart(4, "0")}`],
    ["WBS budget", "FT_MONEY", (i) => (i % 7 ? (25000 + 1234.56 * i).toFixed(2) : (-500.25 - i).toFixed(2))],
    ["Floor area m2", "FT_FLOAT_2_DECIMALS", (i) => (12.5 + 3.25 * i).toFixed(2)],
    ["Package no", "FT_INT", (i) => String(1 + (i % 40))],
    ["Handover", "FT_START_DATE", (i) => `2027-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")} 08:00`],
    ["Warranty ends", "FT_END_DATE", (i) => (i % 3 ? `2029-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")} 17:00` : null)],
    ...(intTwin ? [[intTwin.udf_type_label, "FT_INT", (i) => (i % 2 ? String(i % 11) : null)]] : []),
    ...(textTwin ? [[textTwin.udf_type_label, "FT_TEXT", (i) => (i % 2 ? null : `wbs owner ${i % 13}`)]] : []),
  ];
  const base = 9200;
  for (const [k, [label, type]] of kinds.entries()) T.UDFTYPE.push({ udf_type_id: String(base + k), table_name: "PROJWBS", udf_type_name: `user_field_${base + k}`, udf_type_label: label, logical_data_type: type, super_flag: "N", indicator_expression: "", summary_indicator_expression: "", export_flag: "" });
  let n = 0;
  const put = (k, type, w, v) => {
    const date = type.includes("DATE"), text = type === "FT_TEXT";
    T.UDFVALUE.push({ udf_type_id: String(base + k), fk_id: w.wbs_id, proj_id: pid, udf_date: date ? v : "", udf_number: date || text ? "" : v, udf_text: text ? v : "", udf_code_id: "" });
    n++;
  };
  kinds.forEach(([, type, pick], k) => kids.forEach((w, i) => { const v = pick(i); if (v !== null) put(k, type, w, v); }));
  if (node) put(0, "FT_TEXT", node, "CC-PROJECT");
  const out = join(args[2] || ".", `${basename(args[1]).replace(/\.xer$/i, "")}-wbs-planted.xer`);
  writeFileSync(out, xerText(x));
  console.log(out, n, "planted values in", kinds.length, "WBS UDFs on", kids.length, "WBS nodes", node ? "(1 on the project node)" : "", intTwin || textTwin ? `; titled like activity UDFs: ${[intTwin, textTwin].filter(Boolean).map((u) => u.udf_type_label).join(", ")}` : "");
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
const same = (kind, a, b) => (kind === "date" ? parseDate(a.udf_date) === parseDate(b.udf_date)
  : kind === "cost" ? Math.round(num(a.udf_number) * 100) === Math.round(num(b.udf_number) * 100)
  : kind === "number" ? Math.abs(num(a.udf_number) - num(b.udf_number)) < 1e-9
  : nm(a.udf_text).slice(0, 255) === b.udf_text);
// each WBS node's path of codes below the project node
const paths = (rows, pid) => {
  const by = new Map(rows.filter((w) => pid === null || w.proj_id === pid).map((w) => [w.wbs_id, w]));
  const path = new Map();
  for (const w of by.values()) {
    if (w.proj_node_flag === "Y") continue;
    const chain = [];
    for (let x = w, n = 0; x && x.proj_node_flag !== "Y" && n <= by.size; x = by.get(x.parent_wbs_id), n++) chain.unshift(x.wbs_short_name);
    path.set(w.wbs_id, chain.join("\u0001"));
  }
  return path;
};

const out = [];
for (const f of files) {
  const name = basename(f).replace(/\.xer$/i, "");
  const xer = parseXer(decodeXer(readFileSync(f)));
  const T = xer.tables;
  const r = mspdiText(xer);
  const pid = r.project.id;
  const types = new Map((T.UDFTYPE || []).filter((u) => u.table_name === "PROJWBS").map((u) => [u.udf_type_id, u]));
  const written = new Set((r.wbsUdfFields?.fields || []).map((fl) => fl.typeId));
  const wPath = paths(T.PROJWBS || [], pid);
  const back = p6XerText(r.xml);
  const B = parseXer(back.text).tables;
  if (xmlDir) { writeFileSync(join(xmlDir, `${name}.xml`), r.xml); writeFileSync(join(xmlDir, `${name}.back.xer`), back.text); }
  const bPath = paths(B.PROJWBS || [], null);
  const bTypes = new Map((B.UDFTYPE || []).filter((u) => u.table_name === "PROJWBS").map((u) => [u.udf_type_id, u]));
  const bVal = new Map(); // `${title}|${path}` -> { v, u }
  for (const v of B.UDFVALUE || []) { const u = bTypes.get(v.udf_type_id); if (u) bVal.set(`${u.udf_type_label}|${bPath.get(v.fk_id)}`, { v, u }); }
  const per = { file: basename(f), wbsUdfTypes: types.size, valuesInFile: 0, onProjectNode: 0, onWrittenNodes: 0, inFieldsWritten: 0, byKind: {}, back: 0, wrong: [], missing: [], extraBack: 0, typeKept: 0, typeChanged: [], sharedFields: (r.wbsUdfFields?.fields || []).filter((fl) => fl.shared).map((fl) => `${fl.alias} (${fl.fieldName})`), problems: p6Problems(B).length, warnings: r.warnings.filter((w) => /WBS user-defined/.test(w)) };
  const changed = new Set();
  let meantBack = 0;
  for (const v of T.UDFVALUE || []) {
    const u = types.get(v.udf_type_id);
    if (!u) continue;
    const w = (T.PROJWBS || []).find((x) => x.wbs_id === v.fk_id);
    if (!w || w.proj_id !== pid) continue;
    per.valuesInFile++;
    if (w.proj_node_flag === "Y") { per.onProjectNode++; continue; }
    const kind = KIND[u.logical_data_type];
    if (!kind || (kind === "text" && !nm(v.udf_text).trim())) continue;
    per.onWrittenNodes++;
    if (!written.has(u.udf_type_id)) continue; // no room: counted in the warnings
    per.inFieldsWritten++;
    meantBack++;
    const k = (per.byKind[kind] ||= { meant: 0, back: 0 });
    k.meant++;
    const fl = r.wbsUdfFields.fields.find((x) => x.typeId === u.udf_type_id);
    const got = bVal.get(`${fl.alias.slice(0, 40)}|${wPath.get(v.fk_id)}`);
    if (!got) { per.missing.push(`${label(u)} on ${wPath.get(v.fk_id)}`); continue; }
    if (same(kind, v, got.v)) { per.back++; k.back++; } else per.wrong.push(`${label(u)} on ${wPath.get(v.fk_id)}: ${JSON.stringify(v)} -> ${JSON.stringify(got.v)}`);
    if (!changed.has(u.udf_type_id)) {
      changed.add(u.udf_type_id);
      if (got.u.logical_data_type === u.logical_data_type) per.typeKept++;
      else per.typeChanged.push(`${label(u)}: ${u.logical_data_type} -> ${got.u.logical_data_type}`);
    }
  }
  per.extraBack = [...bVal.keys()].length - meantBack;
  // activity UDFs (Number, Cost, Date fields come back as activity UDFs): the
  // same count of values back as before WBS UDFs existed, none on a WBS node
  const bTask = new Set((B.UDFTYPE || []).filter((u) => u.table_name === "TASK").map((u) => u.udf_type_id));
  per.activityUdfValuesBack = (B.UDFVALUE || []).filter((v) => bTask.has(v.udf_type_id)).length;
  per.activityUdfValuesWritten = (r.udfFields?.fields || []).filter((fl) => fl.kind !== "text").reduce((n, fl) => n + fl.values.size, 0);
  if (mpxjDir && existsSync(join(mpxjDir, `${name}.wbs.json`))) {
    // MPXJ's reading: { xml: { aliases: {Number3: title}, cells: {summaryUid: {Number3: v}} }, xer: { cells: {wbsCode: {title: v}} } }
    const m = JSON.parse(readFileSync(join(mpxjDir, `${name}.wbs.json`), "utf8"));
    const code = new Map([...wPath].map(([id, p]) => [id, p.split("\u0001").join(".")]));
    let aliases = 0, aliasOk = 0, cells = 0, cellOk = 0, xerCells = 0, xerOk = 0;
    const bad = [];
    for (const fl of r.wbsUdfFields.fields) { aliases++; if (m.xml.aliases[fl.fieldName] === fl.alias) aliasOk++; else bad.push(`alias ${fl.fieldName}: ${m.xml.aliases[fl.fieldName]} != ${fl.alias}`); }
    for (const fl of r.wbsUdfFields.fields) {
      for (const [wid, x] of fl.values) {
        const want = fl.kind === "cost" ? Number(x) / 100 : fl.kind === "number" ? Number(x) : fl.kind === "date" ? x.slice(0, 16) : x;
        const eq = (g) => (fl.kind === "cost" || fl.kind === "number" ? Math.abs(Number(g) - want) < 1e-6 : g === want);
        cells++;
        const g1 = m.xml.cells[String(r.wbsUid.get(wid))]?.[fl.fieldName];
        if (eq(g1)) cellOk++; else if (bad.length < 20) bad.push(`xml ${fl.fieldName} on UID ${r.wbsUid.get(wid)} (${code.get(wid)}): ${g1} != ${want}`);
        xerCells++;
        const g2 = m.xer.cells[code.get(wid)]?.[fl.alias.slice(0, 40)];
        if (eq(g2)) xerOk++; else if (bad.length < 20) bad.push(`xer ${fl.alias} on ${code.get(wid)}: ${g2} != ${want}`);
      }
    }
    // summary tasks MPXJ reads as plain tasks (no children: an empty WBS node)
    const plain = new Set(m.xml.plain || []);
    const wbsUids = new Set([...r.wbsUid.values()].map(String));
    per.mpxj = { aliases: `${aliasOk}/${aliases}`, xmlCells: `${cellOk}/${cells}`, xerCells: `${xerOk}/${xerCells}`, emptyWbsReadAsTasks: [...plain].filter((u) => wbsUids.has(u)).length, bad };
  }
  out.push(per);
  console.log(`${per.file}: ${per.wbsUdfTypes} WBS UDF types, ${per.valuesInFile} values (${per.onProjectNode} on the project node), ${per.inFieldsWritten} of ${per.onWrittenNodes} on summary tasks in fields written, ${per.back} back the same (${Object.entries(per.byKind).map(([k, v]) => `${k} ${v.back}/${v.meant}`).join(", ") || "none"}), ${per.missing.length} missing, ${per.wrong.length} wrong, ${per.extraBack} extra, types kept ${per.typeKept}${per.typeChanged.length ? `, changed: ${per.typeChanged.join("; ")}` : ""}${per.sharedFields.length ? `, shared: ${per.sharedFields.join(", ")}` : ""}; activity UDF values written ${per.activityUdfValuesWritten}, back ${per.activityUdfValuesBack}; p6Problems ${per.problems}${per.mpxj ? `; MPXJ aliases ${per.mpxj.aliases}, XML cells ${per.mpxj.xmlCells}, XER cells ${per.mpxj.xerCells}, ${per.mpxj.emptyWbsReadAsTasks} childless summary tasks read as plain tasks` : ""}`);
  for (const w of [...per.warnings, ...per.missing, ...per.wrong, ...(per.mpxj?.bad || [])].slice(0, 10)) console.log("   ", w);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
