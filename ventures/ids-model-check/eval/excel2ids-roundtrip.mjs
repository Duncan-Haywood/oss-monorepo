#!/usr/bin/env node
// Real IDS files through the Excel2IDS template layout and back:
//   IDS -> (fix.mjs repairs, as the page makes them) -> idsToExcel2Ids -> .xlsx
//   -> xlsxToRows -> excel2idsToIds -> IDS, one file per purpose (and phase);
// each specification the writer kept must come back with the same content.
// Content is canonicalIds with what the template writes out by its own rule
// treated as the same: an applicability with no minOccurs/maxOccurs reads as
// required (1..unbounded), a requirement facet with no cardinality as
// required, the order of facets inside an applicability or requirements, and
// of the versions in ifcVersion, and the purpose General the writer fills in
// for a file with none (Excel2IDS's tool stops on an empty one). Also, with --checker, on buildingSMART's test
// pairs the round-tripped IDS must give the checker's original verdict.
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh
//   node eval/excel2ids-roundtrip.mjs [--checker] [--verbose]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { xlsxToRows } from "../sheet.mjs";
import { normal, counts } from "./excel2ids-normal.mjs";
import { idsToExcel2Ids, excel2IdsToXlsx, excel2idsToIds } from "../excel2ids.mjs";
import { fixStructure } from "../fix.mjs";
import { parseXml } from "../xml.mjs";

const here = new URL(".", import.meta.url).pathname;
const verbose = process.argv.includes("--verbose");
const withChecker = process.argv.includes("--checker");
const inflate = (b) => inflateRawSync(b);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) walk(join(dir, d.name), out);
    else if (/\.ids(\.xml)?$/i.test(d.name)) out.push(join(dir, d.name));
  }
  return out.sort();
}

const sets = [
  ["public IDS files on GitHub (eval/corpus/real)", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool test files", walk(join(here, "corpus/IDS-Audit-tool/testing.shared"))],
  ["buildingSMART test pairs (suite 870f9c4)", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases"))],
];

let check = null;
if (withChecker) check = (await import("../node.mjs")).check;

const reasons = new Map();
const tally = (why) => reasons.set(why, (reasons.get(why) || 0) + 1);
for (const [label, files] of sets) {
  let read = 0, specsTotal = 0, specsKept = 0, specsSame = 0, filesAll = 0, rowsSaved = 0, facetRows = 0, verdictSame = 0, verdictRuns = 0;
  for (const f of files) {
    let text = readFileSync(f, "utf8");
    try { parseXml(text); } catch { continue; }
    try { text = fixStructure(text).text || text; } catch { /* as written */ }
    let w;
    try { w = idsToExcel2Ids(text); } catch { continue; }
    read++;
    specsTotal += w.total;
    specsKept += w.kept;
    for (const n of w.notes) tally(n.replace(/^specification "[^"]*" left out: /, "").split("; ").map((x) => x.replace(/"[^"]*"/g, "\"...\"").replace(/ \(.*$/, (m) => m)).join("; ").slice(0, 140));
    if (!w.kept) continue;
    const rows = await xlsxToRows(excel2IdsToXlsx(w.rows), inflate);
    const back = excel2idsToIds(rows, { byPhase: w.byPhase });
    if (!back || back.files.length !== 1 || !back.files[0].text) { if (verbose) console.log("NOT READ", f, back && back.files.map((x) => [x.suffix, x.errors])); continue; }
    const a = JSON.parse(normal(text, w.keptIndex)), b = JSON.parse(normal(back.files[0].text));
    const sa = a.c.find((c) => c.n === "specifications")?.c || [], sb = b.c.find((c) => c.n === "specifications")?.c || [];
    let same = 0;
    for (let i = 0; i < sa.length; i++) {
      if (JSON.stringify(sa[i]) === JSON.stringify(sb[i])) same++;
      else if (verbose) {
        const x = JSON.stringify(sa[i]), y = JSON.stringify(sb[i] ?? null);
        let k = 0;
        while (k < x.length && x[k] === y[k]) k++;
        console.log("DIFF", f, "\n   original:", x.slice(Math.max(0, k - 150), k + 150), "\n   back:    ", y.slice(Math.max(0, k - 150), k + 150));
      }
    }
    specsSame += same;
    // A file with no purpose is written with the tool's default, General (excel2ids.mjs).
    const infoB = b.c.find((c) => c.n === "info");
    if (w.purposeFilled && infoB) infoB.c = infoB.c.filter((c) => !(c.n === "purpose" && c.t === "General"));
    const infoSame = JSON.stringify(a.c.find((c) => c.n === "info")) === JSON.stringify(infoB);
    if (same === sa.length && sa.length === w.total && infoSame) filesAll++;
    else if (verbose && !infoSame && same === sa.length) console.log("INFO", f, JSON.stringify(a.c[0]), JSON.stringify(b.c[0]));
    const facets = sa.reduce((n, s) => n + (s.c.find((p) => p.n === "requirements")?.c.length || 0), 0);
    facetRows += facets;
    rowsSaved += facets - w.requirementRows;
    if (check && /TestCases/.test(f)) {
      const ifc = f.replace(/\.ids$/, ".ifc");
      if (existsSync(ifc)) {
        verdictRuns++;
        try {
          const model = readFileSync(ifc, "utf8");
          const v = (t) => { try { const r = check(t, model); return r.pass ? "pass" : r.valid ? "fail" : "invalid"; } catch { return "error"; } };
          if (v(text) === v(back.files[0].text)) verdictSame++; else if (verbose) console.log("VERDICT", f);
        } catch (e) { if (verbose) console.log("CHECK ERR", f, e.message); }
      }
    }
  }
  console.log(`${label}: ${read} files; ${specsKept} of ${specsTotal} specifications fit the template, ${specsSame} of ${specsKept} come back the same; ${filesAll} of ${read} files whole; requirement rows ${facetRows - rowsSaved} for ${facetRows} facets (shared rows)${check ? `; verdicts same ${verdictSame} of ${verdictRuns}` : ""}`);
}
console.log(`\nEntity names written in upper case (counted the same): ${counts.upperCased}`);
console.log("\nWhy specifications were left out (count of specifications, each reason list as written):");
for (const [k, v] of [...reasons].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(String(v).padStart(5), k);
