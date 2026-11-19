#!/usr/bin/env node
// Scores the downloaded workbook's dropdown lists (sheet.mjs, rowsToXlsx with
// sheetLists) on real IDS files: every cell of a listed column is compared
// with its list the way Excel's list validation compares (case-insensitive,
// whole cell), and counted as in the list, or out of it by how the column is
// held (stop, warning, suggest). A cell out of a "stop" list in a file that
// round-trips would be a dropdown refusing a correct IDS.
//
// With --write DIR, each workbook is also written to DIR with its expected
// out-of-list count in DIR/expected.json, for eval/sheet-dropdowns-lo.py to
// compare with LibreOffice's own "Mark invalid data" (which, like Excel's
// "Circle Invalid Data", marks suggest-only columns too: the alert setting
// does not change what is invalid).
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh
//   node eval/sheet-dropdowns.mjs [--write DIR] [--verbose]
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { idsToRows, rowsToXlsx, sheetLists, sheetVersions } from "../sheet.mjs";

const here = new URL(".", import.meta.url).pathname;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const outDir = arg("--write");
const verbose = process.argv.includes("--verbose");
const load = (f) => JSON.parse(readFileSync(join(here, "../schema", f), "utf8"));
const S = { IFC2X3: [load("ifc2x3.json"), load("psets-ifc2x3.json")], IFC4: [load("ifc4.json"), load("psets-ifc4.json")], IFC4X3: [load("ifc4x3.json"), load("psets-ifc4x3.json")] };

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) walk(join(dir, d.name), out);
    else if (/\.ids(\.xml)?$/i.test(d.name)) out.push(join(dir, d.name));
  }
  return out;
}
const sets = [
  ["public IDS files (eval/corpus/real)", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool test files", walk(join(here, "corpus/IDS-Audit-tool/testing.shared"))],
  ["buildingSMART test pairs", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases"))],
  ["this venture's samples", walk(join(here, "../samples")).filter((f) => !f.includes("bsi-ifc43"))],
];

// Kept in step with sheet.mjs VALIDATION.
const STYLE = { section: "stop", facet: "warning", cardinality: "warning", relation: "warning", ifcVersion: "suggest", entity: "suggest", propertySet: "suggest", dataType: "suggest" };
const BASE = { section: ["info", "specification", "applicability", "requirements"], facet: ["entity", "partOf", "classification", "attribute", "property", "material", "title", "copyright", "version", "description", "author", "date", "purpose", "milestone"], cardinality: ["required", "optional", "prohibited"], relation: ["IFCRELAGGREGATES", "IFCRELASSIGNSTOGROUP", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELNESTS", "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"], ifcVersion: ["IFC2X3", "IFC4", "IFC4X3_ADD2"] };

if (outDir) mkdirSync(outDir, { recursive: true });
const expected = {};
const total = {};
const outVals = {};
let n = 0;
for (const [label, files] of sets) {
  const t = { files: 0, unreadable: 0, cols: {} };
  for (const f of files) {
    let rows;
    try { rows = idsToRows(readFileSync(f, "utf8")); } catch { t.unreadable++; continue; }
    t.files++;
    const v = sheetVersions(rows);
    const lists = { ...BASE, ...sheetLists({ schemas: v.map((x) => S[x][0]), psets: v.map((x) => S[x][1]) }) };
    let held = 0;
    for (const col of Object.keys(STYLE)) {
      const ci = rows[0].indexOf(col);
      const set = new Set(lists[col].map((x) => x.toLowerCase()));
      const c = (t.cols[col] ||= { cells: 0, inList: 0, out: 0 });
      for (const r of rows.slice(1)) {
        const cell = String(r[ci] ?? "");
        if (cell === "") continue;
        c.cells++;
        if (set.has(cell.toLowerCase())) c.inList++;
        else {
          c.out++;
          held++;
          const k = `${col}: ${cell.length > 40 ? cell.slice(0, 40) + "..." : cell}`;
          (outVals[label] ||= {})[k] = ((outVals[label] ||= {})[k] || 0) + 1;
        }
      }
    }
    if (outDir) {
      const name = `${String(++n).padStart(4, "0")}-${basename(f).replace(/[^\w.-]/g, "_")}.xlsx`;
      writeFileSync(join(outDir, name), rowsToXlsx(rows, { lists: sheetLists({ schemas: v.map((x) => S[x][0]), psets: v.map((x) => S[x][1]) }) }));
      expected[name] = held;
    }
  }
  total[label] = t;
}
if (outDir) writeFileSync(join(outDir, "expected.json"), JSON.stringify(expected, null, 1));

for (const [label, t] of Object.entries(total)) {
  console.log(`\n## ${label}: ${t.files} files${t.unreadable ? ` (${t.unreadable} not readable as IDS)` : ""}\n`);
  console.log("| column | held as | filled cells | in the list | out of the list |\n| --- | --- | ---: | ---: | ---: |");
  for (const [col, c] of Object.entries(t.cols)) console.log(`| ${col} | ${STYLE[col]} | ${c.cells} | ${c.inList} | ${c.out} |`);
  const o = Object.entries(outVals[label] || {}).filter(([k]) => verbose || STYLE[k.split(":")[0]] !== "suggest").sort((a, b) => b[1] - a[1]);
  if (o.length) console.log(`\nOut of a held list${verbose ? " (and suggest lists)" : ""}: ${o.slice(0, 30).map(([k, x]) => `\`${k}\` ${x}`).join("; ")}`);
}
