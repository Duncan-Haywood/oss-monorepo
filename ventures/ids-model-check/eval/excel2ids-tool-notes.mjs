#!/usr/bin/env node
// Where Excel2IDS's own tool would read a workbook differently from
// excel2ids.mjs (excel2idsToolNotes: the tool's rules at 4eb7575, read from
// its source, not run), on two sets of workbooks:
//   - the template's own sample (eval/fetch-excel2ids.sh), as it ships;
//   - every workbook this venture writes from the round trip's IDS files
//     (idsToExcel2Ids, saved as .xlsx and read back), the "as an Excel2IDS
//     workbook" download, whose Read me says the tool reads it too.
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh; eval/fetch-excel2ids.sh
//   node eval/excel2ids-tool-notes.mjs [--verbose]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { xlsxToRows } from "../sheet.mjs";
import { idsToExcel2Ids, excel2IdsToXlsx, excel2idsToolNotes } from "../excel2ids.mjs";
import { fixStructure } from "../fix.mjs";
import { parseXml } from "../xml.mjs";

const here = new URL(".", import.meta.url).pathname;
const verbose = process.argv.includes("--verbose");
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) walk(join(dir, d.name), out);
    else if (/\.ids(\.xml)?$/i.test(d.name)) out.push(join(dir, d.name));
  }
  return out.sort();
};
const shape = (m) => m.replace(/"[^"]*"/g, "\"...\"").replace(/\b(row|column|rows?) [A-Z]*\d*\b/g, "$1 N").replace(/\bcolumn [A-Z]+\b/g, "column N").replace(/\([^)]*\)/g, "(...)").slice(0, 150);

const sample = join(here, "corpus/Excel2IDS/Excel2IDS.xlsx");
if (existsSync(sample)) {
  const rows = await xlsxToRows(readFileSync(sample), inflateRawSync, { sheet: "Requirements" });
  const t = excel2idsToolNotes(rows);
  console.log(`The template's sample workbook: ${t.stops.length} stop(s), ${t.notes.length} note(s)`);
  for (const x of [...t.stops, ...t.notes]) console.log(`  ${x.row ? `row ${x.row}, col ${x.col}: ` : ""}${x.message}`);
}

const sets = [
  ["public IDS files on GitHub", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool test files", walk(join(here, "corpus/IDS-Audit-tool/testing.shared"))],
  ["buildingSMART test pairs (suite 870f9c4)", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases"))],
];
const shapes = new Map();
for (const [label, files] of sets) {
  let books = 0, stopped = 0, clean = 0;
  for (const f of files) {
    let text = readFileSync(f, "utf8");
    try { parseXml(text); } catch { continue; }
    try { text = fixStructure(text).text || text; } catch { /* as written */ }
    let w;
    try { w = idsToExcel2Ids(text); } catch { continue; }
    if (!w.kept) continue;
    books++;
    const rows = await xlsxToRows(excel2IdsToXlsx(w.rows), inflateRawSync, { sheet: "Requirements" });
    const t = excel2idsToolNotes(rows);
    if (t.stops.length) stopped++;
    const other = t.notes.filter((n) => !/LOD400/.test(n.message));
    if (!t.stops.length && !other.length) clean++;
    for (const x of [...t.stops.map((s) => ({ ...s, stop: true })), ...other]) {
      const k = (x.stop ? "STOP " : "note ") + shape(x.message);
      if (!shapes.has(k)) shapes.set(k, { n: 0, files: new Set(), ex: `${f.replace(here, "eval/")}: ${x.message}` });
      shapes.get(k).n++; shapes.get(k).files.add(f);
    }
    if (verbose && (t.stops.length || other.length)) console.log(f, [...t.stops, ...other].map((x) => x.message).slice(0, 3));
  }
  console.log(`${label}: ${books} workbooks written; the tool would stop on ${stopped}; ${clean} read the same apart from the LOD400 milestone`);
}
console.log("\nKinds (count of cells, files, one example each):");
for (const [k, v] of [...shapes].sort((a, b) => b[1].n - a[1].n)) console.log(String(v.n).padStart(6), String(v.files.size).padStart(4), k, "\n          e.g.", v.ex.slice(0, 260));
