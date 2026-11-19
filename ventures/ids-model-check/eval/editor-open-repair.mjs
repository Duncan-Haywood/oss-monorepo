#!/usr/bin/env node
// The editor opening an IDS file: as written, or repaired first (repairOnOpen,
// fix.mjs's one-answer ids.xsd repairs). For each file: does it open, how many
// facets are editable, and does the editor's written-back file break ids.xsd
// (structure.mjs, which gives IfcTester's verdict on 3,080 of 3,080 files,
// eval/ids-structure-2026-11-18.md)? Also checks the repaired open writes back
// a file that asks for what the original asked (the specifications parseIds
// reads, as eval/editor-open.mjs compares them).
//
//   sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh
//   node eval/editor-open-repair.mjs [--list]
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseIds } from "../ids.mjs";
import { parseXml } from "../xml.mjs";
import { structureIssues } from "../structure.mjs";
import { resources } from "../node.mjs";
import { auditIds } from "../audit.mjs";
import { importIds, stateToDoc, buildIds, repairOnOpen } from "../editor.mjs";

const here = new URL(".", import.meta.url).pathname;
const list = process.argv.includes("--list");
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const faults = (text) => { try { return structureIssues(parseXml(text, { spans: true }), text).length; } catch { return Infinity; } };

const ORDER = ["entity", "partOf", "classification", "attribute", "property", "material"];
const entityNames = (f) => (f.name.simple !== undefined ? [f.name.simple] : f.name.r && f.name.r.enumeration.length && !f.name.r.pattern.length ? [...new Set(f.name.r.enumeration)].sort() : null);
const canonFacet = (f, req) => f.kind === "entity" && entityNames(f) ? `entity: ${entityNames(f).join("|")}${f.predefinedType.present ? " of " + f.predefinedType : ""}` : `${f.kind}${req && f.kind !== "entity" ? " " + f.cardinality : ""}${f.dataType ? " [" + f.dataType + "]" : ""}: ${f.describe()}`;
// The audit's xs:pattern findings (xsdregex.mjs): a pattern that means something
// else, or nothing, to an XML Schema regex engine such as IfcTester's.
const patternFaults = (xml) => { try { return auditIds(parseIds(xml), R).filter((x) => /^pattern-/.test(x.code)).length; } catch { return 0; } };
const v = (x) => (x === "IFC4X3" ? "IFC4X3_ADD2" : x);
const canonSpec = (s) => JSON.stringify({
  name: s.name === "(unnamed)" ? "Unnamed specification" : s.name, ifcVersion: [].concat(s.ifcVersion || []).map(v), optionality: s.optionality,
  app: s.applicability.map((f) => canonFacet(f, false)).sort((a, b) => ORDER.indexOf(a.split(/[ :]/)[0]) - ORDER.indexOf(b.split(/[ :]/)[0]) || a.localeCompare(b)),
  req: s.optionality === "prohibited" ? [] : s.requirements.map((f) => canonFacet(f, true)).sort(),
});
// The same specification with every xs:pattern blanked: equal when two readings
// differ only in their patterns.
const canonNoPatterns = (s) => JSON.stringify({ ...JSON.parse(canonSpec({ ...s, applicability: [], requirements: [] })), facets: [...s.applicability, ...(s.optionality === "prohibited" ? [] : s.requirements)].map((f) => JSON.stringify(f, (k, x) => (k === "pattern" ? "P" : x))).sort() });

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.ids$/i.test(n)) out.push(p);
  }
  return out.sort();
}
const groups = [
  ["public IDS files", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool files", walk(join(here, "corpus/IDS-Audit-tool/testing.shared"))],
  ["buildingSMART test cases (pass-*)", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases")).filter((f) => /[\/]pass-/.test(f))],
];
if (!groups[0][1].length) { console.error("run eval/fetch-audit-corpus.sh first"); process.exit(2); }

function open(text) {
  let parsed;
  try { parsed = parseIds(text); } catch { return null; }
  const imp = importIds(parsed, loadFor);
  const L = loadFor(imp.state.schema);
  const back = buildIds(stateToDoc(imp.state, L), L.S);
  return { parsed, imp, back, backFaults: faults(back), backPatterns: patternFaults(back) };
}

let bad = 0;
for (const [label, files] of groups) {
  if (!files.length) continue;
  const c = { files: 0, faulty: 0, repaired: 0, fixes: 0, opened: [0, 0], backBreaks: [0, 0], backPatterns: [0, 0], backClean: [0, 0], roundTrip: 0, roundTripBefore: 0, patternOnly: 0, rows: [0, 0], kept: [0, 0], unchanged: 0, sameAsk: 0, specs: 0 };
  const lines = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    c.files++;
    const name = f.replace(here, "");
    const rep = repairOnOpen(text, parseIds);
    const a = open(text), b = open(rep.text);
    if (faults(text) > 0) c.faulty++;
    if (!rep.fixes.length) {
      // No repair: the editor must open exactly what it opened before.
      if (rep.text === text) c.unchanged++; else { bad++; lines.push(`${name}: text changed with no fix listed`); }
    } else { c.repaired++; c.fixes += rep.fixes.length; }
    [a, b].forEach((o, i) => { if (o) { c.opened[i]++; c.rows[i] += o.imp.rows; c.kept[i] += o.imp.kept; if (o.backFaults) c.backBreaks[i]++; c.backPatterns[i] += o.backPatterns; if (!o.backFaults && !o.backPatterns) c.backClean[i]++; } });
    if (rep.fixes.length && b) {
      // The repaired open asks for what the original (as the checker reads it) asked.
      let orig = null;
      try { orig = parseIds(text); } catch {}
      const back = parseIds(b.back);
      // The editor writes back what the repaired file asks, and the repaired file asks
      // what the original asked, apart from patterns fix.mjs rewrote (pattern-xsd).
      const rt = parseIds(rep.text);
      const sameAs = (x, y) => x.specs.length === y.specs.length && x.specs.every((s, i) => canonSpec(s) === canonSpec(y.specs[i]));
      const rtOk = sameAs(rt, back), beforeOk = !a || (orig && sameAs(orig, parseIds(a.back)));
      if (rtOk) c.roundTrip++;
      if (beforeOk) c.roundTripBefore++;
      // The editor's own write-back rules (a specification with no ifcVersion is
      // written with the schema it opened in) are eval/editor-open.mjs's business:
      // the repair must not add a difference that opening the file as written lacks.
      if (!rtOk && beforeOk) { bad++; lines.push(`${name}: the editor writes back something other than the repaired file asks`); }
      if (orig) {
        const strict = orig.specs.length === rt.specs.length && orig.specs.every((s, i) => canonSpec(s) === canonSpec(rt.specs[i]));
        const loose = orig.specs.length === rt.specs.length && orig.specs.every((s, i) => canonNoPatterns(s) === canonNoPatterns(rt.specs[i]));
        const patternFix = rep.fixes.some((x) => x.code === "pattern-xsd");
        c.specs++;
        if (strict) c.sameAsk++;
        else if (loose && patternFix) c.sameAsk++, c.patternOnly++;
        else { bad++; lines.push(`${name}: repaired open asks for something else`); }
      } else c.specs++, c.sameAsk++; // unreadable before: nothing to compare with
      lines.push(`${name}: ${rep.fixes.length} repaired [${[...new Set(rep.fixes.map((x) => x.code))].join(", ")}]; ${a ? `opened, ${a.imp.rows} rows/${a.imp.kept} kept, written back ${a.backFaults ? `breaks ids.xsd (${a.backFaults})` : "valid"}${a.backPatterns ? `, ${a.backPatterns} pattern finding(s)` : ""}` : "did not open"} -> ${b.imp.rows} rows/${b.imp.kept} kept, written back ${b.backFaults ? `breaks ids.xsd (${b.backFaults}: ${structureIssues(parseXml(b.back, { spans: true }), b.back).map((x) => x.code).join(", ")})` : "valid"}${b.backPatterns ? `, ${b.backPatterns} pattern finding(s)` : ""}; left for a person in the file: ${rep.remaining.length}`);
    } else if (a && a.backFaults && (list || true)) {
      lines.push(`${name}: no repair; written back breaks ids.xsd (${a.backFaults}: ${structureIssues(parseXml(a.back, { spans: true }), a.back).map((x) => x.code).join(", ")})`);
    }
  }
  console.log(`${label}: ${c.files} files, ${c.faulty} break ids.xsd as published, ${c.repaired} repaired on open (${c.fixes} fixes), ${c.unchanged} opened unchanged`);
  console.log(`  opened: ${c.opened[0]} as written, ${c.opened[1]} repaired first`);
  console.log(`  written back by the editor and breaking ids.xsd: ${c.backBreaks[0]} as written, ${c.backBreaks[1]} repaired first`);
  console.log(`  xs:pattern findings (audit) in the written-back files: ${c.backPatterns[0]} as written, ${c.backPatterns[1]} repaired first`);
  console.log(`  written back clean (ids.xsd and patterns): ${c.backClean[0]} as written, ${c.backClean[1]} repaired first`);
  console.log(`  facets editable ${c.rows[0]} -> ${c.rows[1]}, kept as written ${c.kept[0]} -> ${c.kept[1]}`);
  console.log(`  written back asking what the opened file asks: ${c.roundTripBefore} of ${c.repaired} as written, ${c.roundTrip} of ${c.repaired} repaired first`);
  console.log(`  repaired files asking what the original asked: ${c.sameAsk} of ${c.specs} (${c.patternOnly} differ only in the patterns fix.mjs rewrote to mean what their authors wrote)`);
  for (const l of lines) console.log("  " + l);
}
process.exit(bad ? 1 : 0);
