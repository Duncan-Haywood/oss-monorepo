#!/usr/bin/env node
// What a spreadsheet's own typing does to an IDS sheet. A person who opens
// the CSV in a spreadsheet and types into it gets cells the program has
// turned into numbers, dates and booleans; that is what an .xlsx from Excel
// holds. This opens each IDS's CSV in LibreOffice Calc with its standard
// column type and special-number (date) detection, as Excel opens a CSV,
// saves it as .xlsx, reads it back with xlsxToRows and compares, cell by
// cell and as IDS content, with the same CSV read as text.
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh
//   node eval/sheet-typed.mjs [--verbose]
//   SHEET=/other/sheet.mjs node eval/sheet-typed.mjs   (another reader, the "before" column)
// Results: eval/excel-workbooks-2026-11-19.md.
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { idsToRows, rowsToIds, rowsToCsv, csvToRows, canonicalIds } from "../sheet.mjs";
import { check } from "../node.mjs";

const { xlsxToRows } = await import(process.env.SHEET ? pathToFileURL(process.env.SHEET).href : "../sheet.mjs");
const here = new URL(".", import.meta.url).pathname;
const verbose = process.argv.includes("--verbose");
const inflate = (b) => inflateRawSync(b);

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

// A cell's change, by kind: what the spreadsheet did and whether the reader undid it.
function kindOf(text, typed) {
  if (text.replace(/\r\n?/g, "\n") === typed.replace(/\r\n?/g, "\n")) return "line break CR LF to LF";
  if (/^(true|false)$/i.test(text) && /^(true|false)$/i.test(typed)) return "boolean";
  if (/^\d{4}-\d\d-\d\d/.test(text) || /^\d\d:\d\d/.test(text)) return "date or time";
  if (text.trim() !== "" && Number.isFinite(Number(text))) return "number written another way";
  return "other";
}

const back = (r) => { const x = rowsToIds(r); return x.text ? x.text : null; };
const verdict = (t, ifc) => { try { const r = check(t, readFileSync(ifc, "utf8")); return r.pass ? "pass" : r.valid ? "fail" : "invalid"; } catch { return "error"; } };
const tmp = mkdtempSync(join(tmpdir(), "ids-typed-"));
const cellKinds = {};
for (const [label, files] of sets) {
  const dir = join(tmp, String(sets.findIndex((s) => s[0] === label)));
  mkdirSync(dir);
  const items = [];
  files.forEach((f, i) => {
    let rows;
    try { rows = idsToRows(readFileSync(f, "utf8")); } catch { return; }
    writeFileSync(join(dir, `f${i}.csv`), rowsToCsv(rows));
    items.push({ f, i });
  });
  // Standard column type (numbers, booleans) and special numbers (dates) detected, as Excel opening a CSV does.
  const csvs = items.map((x) => join(dir, `f${x.i}.csv`));
  for (let k = 0; k < csvs.length; k += 100) {
    execFileSync("soffice", ["--headless", "--infilter=CSV:44,34,76,1,,1033,false,true", "--convert-to", "xlsx", "--outdir", dir, ...csvs.slice(k, k + 100)], { stdio: "ignore", timeout: 600000 });
  }
  const s = { files: 0, same: 0, cellsChanged: 0, filesTouched: 0, verdicts: 0, verdictSame: 0 };
  for (const { f, i } of items) {
    const asText = csvToRows(readFileSync(join(dir, `f${i}.csv`), "utf8"));
    const a = back(asText);
    if (!a) continue; // rows the text CSV cannot make into an IDS either: not the typing's doing
    s.files++;
    let typed;
    try { typed = await xlsxToRows(new Uint8Array(readFileSync(join(dir, `f${i}.xlsx`))), inflate); } catch (e) { if (verbose) console.log("unread:", f, e.message); continue; }
    let changed = 0;
    asText.forEach((row, r) => row.forEach((c, j) => {
      const t = typed[r]?.[j] ?? "";
      if (t === c) return;
      changed++;
      const k = kindOf(c, t);
      cellKinds[k] = (cellKinds[k] || 0) + 1;
      if (verbose) console.log(`  ${f.replace(here, "eval/")} r${r + 1}c${j + 1}: ${JSON.stringify(c)} -> ${JSON.stringify(t)}`);
    }));
    s.cellsChanged += changed;
    if (changed) s.filesTouched++;
    const b = back(typed);
    if (b && canonicalIds(a) === canonicalIds(b)) s.same++;
    const ifc = f.replace(/\.ids$/, ".ifc");
    if (label === "buildingSMART test pairs" && a && existsSync(ifc)) {
      s.verdicts++;
      if (b && verdict(a, ifc) === verdict(b, ifc)) s.verdictSame++;
      else if (verbose) console.log("verdict differs:", f);
    }
  }
  console.log(`${label}: same IDS content as the text CSV ${s.same} of ${s.files}; files with a cell the typing changed ${s.filesTouched}, cells ${s.cellsChanged}${s.verdicts ? `; checker verdict unchanged ${s.verdictSame} of ${s.verdicts}` : ""}`);
}
console.log("cells changed, by kind:", JSON.stringify(cellKinds));
