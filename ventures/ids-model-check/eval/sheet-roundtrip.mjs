#!/usr/bin/env node
// Round-trips IDS files through the spreadsheet form (sheet.mjs) and scores
// what comes back:
//   1. IDS -> rows -> CSV -> rows -> IDS, and the same through .xlsx; the
//      result must be the same IDS content (canonicalIds: elements,
//      attributes and leaf text; layout, comments, namespace prefixes left out);
//   2. on buildingSMART's test pairs, the round-tripped IDS must get the same
//      verdict from the checker as the original, pair by pair;
//   3. with --libreoffice, the CSV is opened and re-saved as .xlsx by
//      LibreOffice (shared strings, its own zip), read back, and scored as 1.
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh
//   node eval/sheet-roundtrip.mjs [--libreoffice] [--verbose]
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { idsToRows, rowsToIds, rowsToCsv, csvToRows, rowsToXlsx, xlsxToRows, canonicalIds } from "../sheet.mjs";
import { check } from "../node.mjs";
import { fixStructure } from "../fix.mjs";

const here = new URL(".", import.meta.url).pathname;
const verbose = process.argv.includes("--verbose");
const libre = process.argv.includes("--libreoffice");
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

const tmp = mkdtempSync(join(tmpdir(), "ids-sheet-"));
const summary = [];
const noteKinds = {};
for (const [label, files] of sets) {
  const s = { label, files: files.length, notXml: 0, repairedSame: 0, repairTried: 0, csv: 0, xlsx: 0, lo: 0, loTried: 0, withNotes: 0, verdicts: 0, verdictSame: 0, diffs: [] };
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    let orig, rows, notes;
    try { orig = canonicalIds(text); ({ rows, notes } = idsToRows(text, { notes: true })); }
    catch { s.notXml++; continue; }
    if (notes.length) s.withNotes++;
    for (const n of notes) { const k = n.replace(/^spec \d+ ?/, ""); noteKinds[k] = (noteKinds[k] || 0) + 1; }
    const back = (r) => { const x = rowsToIds(r); return x.text ? canonicalIds(x.text) : "ERROR " + JSON.stringify(x.errors); };
    const viaCsv = back(csvToRows(rowsToCsv(rows)));
    const viaXlsx = back(await xlsxToRows(rowsToXlsx(rows), inflate));
    if (viaCsv === orig) s.csv++;
    else {
      // The page and the CLI repair ids.xsd faults with one right answer
      // (fix.mjs: IDS 0.9 minOccurs, <name> for <baseName>, ...) before the
      // sheet is made; score that path against the repaired file.
      const fx = fixStructure(text);
      let same = false;
      if (!fx.error && fx.fixes.length) {
        s.repairTried++;
        const rep = canonicalIds(fx.text);
        same = back(csvToRows(rowsToCsv(idsToRows(fx.text)))) === rep;
        if (same) s.repairedSame++;
      }
      s.diffs.push({ f, how: "csv", notes, repairedSame: same });
    }
    if (viaXlsx === orig) s.xlsx++;
    if (libre && label !== "buildingSMART test pairs") {
      s.loTried++;
      const csvPath = join(tmp, "t.csv");
      writeFileSync(csvPath, rowsToCsv(rows));
      try {
        // Every column as text (format 2), as a person importing a CSV would pick; UTF-8, comma.
        execFileSync("soffice", ["--headless", "--infilter=CSV:44,34,76,1,1/2/2/2/3/2/4/2/5/2/6/2/7/2/8/2/9/2/10/2/11/2/12/2/13/2/14/2/15/2/16/2/17/2/18/2/19/2", "--convert-to", "xlsx", "--outdir", tmp, csvPath], { stdio: "ignore", timeout: 60000 });
        if (back(await xlsxToRows(readFileSync(join(tmp, "t.xlsx")), inflate)) === orig) s.lo++;
        else if (verbose) console.log("libreoffice differs:", f);
      } catch (e) { if (verbose) console.log("libreoffice failed:", f, e.message); }
    }
    if (label === "buildingSMART test pairs") {
      const ifc = f.replace(/\.ids$/, ".ifc");
      if (existsSync(ifc)) {
        const x = rowsToIds(csvToRows(rowsToCsv(rows)));
        const verdict = (t) => { try { const r = check(t, readFileSync(ifc, "utf8")); return r.pass ? "pass" : r.valid ? "fail" : "invalid"; } catch (e) { return "error"; } };
        s.verdicts++;
        if (x.text && verdict(x.text) === verdict(text)) s.verdictSame++;
        else if (verbose) console.log("verdict differs:", f);
      }
    }
  }
  summary.push(s);
}

for (const s of summary) {
  console.log(`${s.label}: ${s.files} files${s.notXml ? ` (${s.notXml} not readable as XML, left out)` : ""}`);
  const n = s.files - s.notXml;
  console.log(`  same IDS content back: CSV ${s.csv} of ${n}, xlsx ${s.xlsx} of ${n}${s.loTried ? `, LibreOffice-saved xlsx ${s.lo} of ${s.loTried}` : ""}`);
  console.log(`  files with something a row cannot carry (noted, left out): ${s.withNotes}`);
  if (s.repairTried) console.log(`  of the ones that differ, repaired by fix.mjs first and then the same as the repaired file: ${s.repairedSame} of ${s.repairTried}`);
  if (s.verdicts) console.log(`  checker verdict on the pair unchanged: ${s.verdictSame} of ${s.verdicts}`);
  for (const d of s.diffs) console.log(`  differs${d.repairedSame ? " (same once repaired)" : ""}: ${d.f.replace(here, "eval/")}${d.notes.length ? ` (${d.notes.slice(0, 3).join("; ")}${d.notes.length > 3 ? "; ..." : ""})` : ""}`);
}
console.log("what rows could not carry, by kind:");
for (const [k, v] of Object.entries(noteKinds).sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
