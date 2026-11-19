#!/usr/bin/env node
// Real IDS files through the Excel2IDS template layout and back:
//   IDS -> (fix.mjs repairs, as the page makes them) -> idsToExcel2Ids -> .xlsx
//   -> xlsxToRows -> excel2idsToIds -> IDS, one file per purpose (and phase);
// each specification the writer kept must come back with the same content.
// Content is canonicalIds with what the template writes out by its own rule
// treated as the same: an applicability with no minOccurs/maxOccurs reads as
// required (1..unbounded), a requirement facet with no cardinality as
// required, the order of facets inside an applicability or requirements, and
// of the versions in ifcVersion. Also, with --checker, on buildingSMART's test
// pairs the round-tripped IDS must give the checker's original verdict.
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh
//   node eval/excel2ids-roundtrip.mjs [--checker] [--verbose]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { xlsxToRows, canonicalIds } from "../sheet.mjs";
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

// The canonical tree with the template's written-out defaults applied.
let upperCased = 0;
function normal(text, keepIndex) {
  const t = JSON.parse(canonicalIds(text));
  const specsNode = t.c.find((c) => c.n === "specifications");
  if (specsNode) {
    if (keepIndex) specsNode.c = keepIndex.map((i) => specsNode.c[i]);
    for (const s of specsNode.c) {
      // An empty text attribute is no attribute: a template cell cannot tell them apart.
      for (const k of ["description", "instructions", "identifier"]) if (s.a[k] === "") delete s.a[k];
      if (s.a.ifcVersion) s.a.ifcVersion = s.a.ifcVersion.trim().split(/\s+/).sort().join(" ");
      for (const part of s.c) {
        if (part.n === "applicability") {
          // As the checker reads them (ids.mjs): maxOccurs 0 prohibited, minOccurs 0 optional, else required.
          const mn = part.a.minOccurs, mx = part.a.maxOccurs;
          part.a.occurs = mx === "0" ? "prohibited" : mn === "0" ? "optional" : mx === undefined || mx === "unbounded" ? "required" : `${mn}..${mx}`;
          delete part.a.minOccurs; delete part.a.maxOccurs;
        }
        // A one-item string list allows what its value allows; the template writes it plain.
        const oneItem = (n) => {
          for (const k of n.c) oneItem(k);
          n.c = n.c.map((k) => (k.n === "restriction" && (k.a.base ?? "string") === "string" && k.c.length === 1 && k.c[0].n === "enumeration" ? { n: "simpleValue", a: {}, t: k.c[0].a.value, c: [] } : k));
        };
        oneItem(part);
        // IDS entity names are upper case; the reader writes them so.
        if (keepIndex) for (const f of part.c) if (f.n === "entity") for (const nm of f.c) if (nm.n === "name") for (const v of nm.c) {
          if (v.n === "simpleValue" && v.t !== v.t.toUpperCase()) { v.t = v.t.toUpperCase(); upperCased++; }
          if (v.n === "restriction") for (const e of v.c) if (e.n === "enumeration" && e.a.value !== e.a.value.toUpperCase()) { e.a.value = e.a.value.toUpperCase(); upperCased++; }
        }
        if (part.n === "requirements") for (const f of part.c) if (f.n !== "entity" && f.n !== "partOf" && f.a.cardinality === undefined) f.a.cardinality = "required";
        for (const f of part.c) { if (f.a.instructions === "") delete f.a.instructions; f.a = Object.fromEntries(Object.entries(f.a).sort()); }
        // The same facet twice in one part asks for the same thing once.
        if (part.n === "requirements") { const seen = new Set(); part.c = part.c.filter((f) => { const k = JSON.stringify(f); if (seen.has(k)) return false; seen.add(k); return true; }); }
        if (part.n === "applicability" || part.n === "requirements") { part.c.sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)); part.a = Object.fromEntries(Object.entries(part.a).sort()); }
      }
    }
  }
  const info = t.c.find((c) => c.n === "info");
  if (info) { for (const f of info.c) f.t = f.t.trim(); }
  return JSON.stringify(t);
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
    const infoSame = JSON.stringify(a.c.find((c) => c.n === "info")) === JSON.stringify(b.c.find((c) => c.n === "info"));
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
console.log(`\nEntity names written in upper case (counted the same): ${upperCased}`);
console.log("\nWhy specifications were left out (count of specifications, each reason list as written):");
for (const [k, v] of [...reasons].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(String(v).padStart(5), k);
