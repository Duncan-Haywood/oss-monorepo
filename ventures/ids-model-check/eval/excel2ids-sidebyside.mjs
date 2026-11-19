#!/usr/bin/env node
// Excel2IDS's own tool and this venture's reader on the same workbooks.
//
// Each IDS of the round trip's three sets (eval/excel2ids-roundtrip.mjs) is
// repaired as the page repairs it (fix.mjs) and written into the Excel2IDS
// template by idsToExcel2Ids; the template's own sample workbook is added
// as it ships. Every workbook is then read twice: by buildingSMART-community's
// Excel2IDS.py at 4eb7575 (run unchanged through eval/excel2ids_tool_run.py)
// and by excel2idsToIds. Specifications are compared in the round trip's
// canonical form (eval/excel2ids-normal.mjs) with each other and with the
// original; each output is checked against ids.xsd (structure.mjs); on
// buildingSMART's test pairs, the checker's verdict on each output is
// compared with its verdict on the original.
//
// Workbooks are written twice: as written (a file with no <purpose> leaves
// the template's purpose row empty, which the tool cannot read) and with the
// purpose row filled with "General", so both readers can be compared on
// every workbook.
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh; eval/fetch-excel2ids.sh
//   pip install ifctester openpyxl tqdm   (EXCEL2IDS_PYTHON names the python)
//   node eval/excel2ids-sidebyside.mjs [--verbose]
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { xlsxToRows } from "../sheet.mjs";
import { idsToExcel2Ids, excel2IdsToXlsx, excel2idsToIds } from "../excel2ids.mjs";
import { fixStructure } from "../fix.mjs";
import { parseXml } from "../xml.mjs";
import { structureIssues } from "../structure.mjs";
import { check } from "../node.mjs";
import { normal } from "./excel2ids-normal.mjs";

const here = new URL(".", import.meta.url).pathname;
const verbose = process.argv.includes("--verbose");
const tool = join(here, "corpus/Excel2IDS");
const python = process.env.EXCEL2IDS_PYTHON || "python3";
if (!existsSync(join(tool, "Excel2IDS.py"))) { console.error("run eval/fetch-excel2ids.sh first"); process.exit(1); }

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) walk(join(dir, d.name), out);
    else if (/\.ids(\.xml)?$/i.test(d.name)) out.push(join(dir, d.name));
  }
  return out.sort();
}

const sets = [
  ["public IDS files on GitHub", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool test files", walk(join(here, "corpus/IDS-Audit-tool/testing.shared"))],
  ["buildingSMART test pairs (suite 870f9c4)", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases"))],
];
const out = join(here, "corpus/excel2ids-sidebyside");
rmSync(out, { recursive: true, force: true });
const asWritten = join(out, "as-written"), withPurpose = join(out, "with-purpose");
mkdirSync(asWritten, { recursive: true });
mkdirSync(withPurpose, { recursive: true });

// 1. Workbooks.
const books = []; // { id, set, source, text, keptIndex, purposeMissing }
let n = 0;
for (const [label, files] of sets) {
  for (const f of files) {
    let text = readFileSync(f, "utf8");
    try { parseXml(text); } catch { continue; }
    try { text = fixStructure(text).text || text; } catch { /* as written */ }
    let w;
    try { w = idsToExcel2Ids(text); } catch { continue; }
    if (!w.kept || w.byPhase) continue; // nothing to compare, or a phase split the tool does not make
    const id = `b${String(n++).padStart(4, "0")}`;
    const purposeMissing = w.rows[16].slice(17).every((v) => v === "");
    writeFileSync(join(asWritten, id + ".xlsx"), excel2IdsToXlsx(w.rows));
    const rows = w.rows.map((r) => r.slice());
    for (let c = 17; c < rows[17].length; c++) if (rows[17][c] === "TRUE" && rows[16][c] === "") rows[16][c] = "General";
    writeFileSync(join(withPurpose, id + ".xlsx"), excel2IdsToXlsx(rows));
    books.push({ id, set: label, source: f, text, keptIndex: w.keptIndex, purposeMissing, purpose: rows[16].find((v, c) => c > 16 && v !== "") });
  }
}
const sample = join(tool, "Excel2IDS.xlsx");
writeFileSync(join(withPurpose, "sample.xlsx"), readFileSync(sample));

// 2. The tool.
for (const d of [asWritten, withPurpose]) console.log(execFileSync(python, [join(here, "excel2ids_tool_run.py"), tool, d], { encoding: "utf8" }).trim());

// 3. Compare.
const fileSuffix = (s) => s.replace(/[^\w.-]+/g, "_"); // excel2ids.mjs names files the same way
const specsOf = (t) => t.c.find((c) => c.n === "specifications")?.c || [];
const structure = (t) => { try { return structureIssues(parseXml(t, { spans: true }), t).length; } catch { return -1; } };
const verdict = (t, model) => { try { const r = check(t, model); return r.pass ? "pass" : r.valid ? "fail" : "invalid"; } catch { return "error"; } };

// Where two canonical specifications first differ, as a path of element names.
function diffs(a, b, path = "", acc = []) {
  if (!a || !b) { acc.push(`${path} ${a ? "missing in tool" : "extra in tool"}`); return acc; }
  if (a.n !== b.n) { acc.push(`${path}/${a.n}->${b.n}`); return acc; }
  const p = `${path}/${a.n}`;
  for (const k of new Set([...Object.keys(a.a), ...Object.keys(b.a)])) if (a.a[k] !== b.a[k]) acc.push(`${p}@${k}: ${JSON.stringify(a.a[k] ?? null)} vs ${JSON.stringify(b.a[k] ?? null)}`);
  if ((a.t ?? "") !== (b.t ?? "")) acc.push(`${p} text: ${JSON.stringify(a.t)} vs ${JSON.stringify(b.t)}`);
  for (let i = 0; i < Math.max(a.c.length, b.c.length); i++) diffs(a.c[i], b.c[i], p, acc);
  return acc;
}
const shape = (d) => d.replace(/: .*$/, "").replace(/"[^"]*"/g, "\"...\"");

const per = new Map(); // set -> stats
const stat = (s) => { if (!per.has(s)) per.set(s, { books: 0, toolStoppedAsWritten: 0, noPurpose: 0, toolStopped: 0, specs: 0, same: 0, toolSameAsOriginal: 0, oursSameAsOriginal: 0, toolXsdBad: 0, oursXsdBad: 0, verdictRuns: 0, verdictTool: 0, verdictOurs: 0, toolInfoMilestone: 0 }); return per.get(s); };
const shapes = new Map(), examples = new Map(), stops = new Map(), infoDiffs = new Map(), infoExamples = new Map();
const tallyShape = (k, ex) => { shapes.set(k, (shapes.get(k) || 0) + 1); if (!examples.has(k)) examples.set(k, ex); };

for (const b of books) {
  const st = stat(b.set);
  st.books++;
  if (b.purposeMissing) st.noPurpose++;
  if (existsSync(join(asWritten, b.id + ".error.txt"))) st.toolStoppedAsWritten++;
  const err = join(withPurpose, b.id + ".error.txt");
  if (existsSync(err)) {
    st.toolStopped++;
    const first = readFileSync(err, "utf8").split("\n")[0];
    stops.set(first, (stops.get(first) || 0) + 1);
    if (verbose) console.log("STOP", b.source, first);
    continue;
  }
  const toolFile = join(withPurpose, `${b.id}_${b.purpose}.ids`);
  if (!existsSync(toolFile)) { st.toolStopped++; stops.set("no file written", (stops.get("no file written") || 0) + 1); continue; }
  const toolText = readFileSync(toolFile, "utf8");
  const rows = await xlsxToRows(readFileSync(join(withPurpose, b.id + ".xlsx")), inflateRawSync);
  const ours = excel2idsToIds(rows).files[0].text;
  if (structure(toolText) !== 0) st.toolXsdBad++;
  if (structure(ours) !== 0) st.oursXsdBad++;
  if (/<milestone>LOD400<\/milestone>/.test(toolText)) st.toolInfoMilestone++;
  // The <info> block, field by field (milestone counted above).
  const infoOf = (x) => Object.fromEntries((JSON.parse(normal(x)).c.find((c) => c.n === "info")?.c || []).map((f) => [f.n, f.t]));
  const ti = infoOf(toolText), ui = infoOf(ours);
  for (const k of new Set([...Object.keys(ti), ...Object.keys(ui)])) {
    if (k === "milestone" || ti[k] === ui[k]) continue;
    const key = `<${k}> ${ui[k] === undefined ? "only the tool writes one" : ti[k] === undefined ? "only the reader writes one" : "differs"}`;
    infoDiffs.set(key, (infoDiffs.get(key) || 0) + 1);
    if (!infoExamples.has(key)) infoExamples.set(key, `${JSON.stringify(ui[k] ?? null).slice(0, 80)} vs ${JSON.stringify(ti[k] ?? null).slice(0, 80)}`);
  }
  const o = specsOf(JSON.parse(normal(b.text, b.keptIndex)));
  const t = specsOf(JSON.parse(normal(toolText)));
  const u = specsOf(JSON.parse(normal(ours)));
  for (let i = 0; i < o.length; i++) {
    st.specs++;
    const [os, ts, us] = [o[i], t[i], u[i]].map((x) => JSON.stringify(x ?? null));
    if (ts === us) st.same++;
    if (ts === os) st.toolSameAsOriginal++;
    if (us === os) st.oursSameAsOriginal++;
    if (ts !== us) {
      const d = diffs(u[i], t[i]);
      for (const k of new Set(d.map(shape))) tallyShape(k, `${b.source.replace(here, "eval/")}: ${d.find((x) => shape(x) === k)}`);
      if (verbose) console.log("DIFF", b.source, d.slice(0, 4).join(" | "));
    }
  }
  if (/TestCases/.test(b.source)) {
    const ifc = b.source.replace(/\.ids$/, ".ifc");
    if (existsSync(ifc)) {
      const model = readFileSync(ifc, "utf8");
      const v0 = verdict(b.text, model);
      st.verdictRuns++;
      if (verdict(toolText, model) === v0) st.verdictTool++; else if (verbose) console.log("VERDICT tool", b.source, v0, verdict(toolText, model));
      if (verdict(ours, model) === v0) st.verdictOurs++;
    }
  }
}

console.log("\nPer set (workbooks with at least one specification that fits the template):");
for (const [label, s] of per) {
  console.log(`${label}: ${s.books} workbooks; tool stops on ${s.toolStoppedAsWritten} as written (${s.noPurpose} have no purpose), ${s.toolStopped} with the purpose filled; ` +
    `of ${s.specs} specifications in the workbooks it read, tool and reader agree on ${s.same}; same as the original IDS: tool ${s.toolSameAsOriginal}, reader ${s.oursSameAsOriginal}; ` +
    `outputs breaking ids.xsd: tool ${s.toolXsdBad}, reader ${s.oursXsdBad}; tool files with <milestone>LOD400</milestone>: ${s.toolInfoMilestone}` +
    (s.verdictRuns ? `; checker verdict same as the original: tool ${s.verdictTool} of ${s.verdictRuns}, reader ${s.verdictOurs} of ${s.verdictRuns}` : ""));
}
console.log("\nWhere the tool stopped (with the purpose filled):");
for (const [k, v] of [...stops].sort((x, y) => y[1] - x[1])) console.log(String(v).padStart(5), k);
console.log("\nWhere tool and reader differ (count of specifications; reader first, tool second; one example each):");
for (const [k, v] of [...shapes].sort((x, y) => y[1] - x[1])) console.log(String(v).padStart(5), k, "\n        e.g.", examples.get(k).slice(0, 300));

console.log("\nWhere the <info> blocks differ (count of IDS files; reader first, tool second; one example each; <milestone>LOD400</milestone> left out):");
for (const [k, v] of [...infoDiffs].sort((x, y) => y[1] - x[1])) console.log(String(v).padStart(5), k, "\n        e.g.", infoExamples.get(k));

// 4. The template's own sample.
console.log("\nThe template's sample workbook:");
const sampleRows = await xlsxToRows(readFileSync(sample), inflateRawSync);
const oursSample = excel2idsToIds(sampleRows).files;
if (existsSync(join(withPurpose, "sample.error.txt"))) console.log("  tool stopped:", readFileSync(join(withPurpose, "sample.error.txt"), "utf8").split("\n")[0]);
for (const f of oursSample) {
  const tf = join(withPurpose, `sample_${f.purpose}.ids`);
  if (!existsSync(tf)) { console.log(`  ${f.suffix}: no tool file`); continue; }
  const t = specsOf(JSON.parse(normal(readFileSync(tf, "utf8")))), u = specsOf(JSON.parse(normal(f.text)));
  let same = 0;
  for (let i = 0; i < Math.max(t.length, u.length); i++) {
    if (JSON.stringify(t[i]) === JSON.stringify(u[i])) same++;
    else console.log(`  ${f.suffix} spec ${i + 1}:`, diffs(u[i], t[i]).slice(0, 6).join(" | "));
  }
  console.log(`  ${f.suffix}: ${same} of ${Math.max(t.length, u.length)} specifications agree; ids.xsd findings tool ${structure(readFileSync(tf, "utf8"))}, reader ${structure(f.text)}`);
}
void fileSuffix;
