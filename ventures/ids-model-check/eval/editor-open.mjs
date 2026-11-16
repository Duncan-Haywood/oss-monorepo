#!/usr/bin/env node
// Opens IDS files written by others in the editor (importIds), writes each back
// (stateToDoc + buildIds) and checks the written file asks for what the opened
// one asked: same title and info, and per specification the same name,
// description, instructions, ifcVersion, optionality and the same facets
// (kind, cardinality, dataType and every value, compared as ids.mjs reads them).
// Also counts how many facets the page can edit and how many it holds as written.
//
//   sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh
//   node eval/editor-open.mjs [--list] [--write DIR]
//   --write DIR saves each opened file and its written-back copy as
//   DIR/<n>.orig.ids and DIR/<n>.back.ids, for eval/editor-xsd-compare.py.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources } from "../node.mjs";
import { importIds, stateToDoc, buildIds } from "../editor.mjs";

const here = new URL(".", import.meta.url).pathname;
const list = process.argv.includes("--list");
const wi = process.argv.indexOf("--write");
const outDir = wi > 0 ? process.argv[wi + 1] : null;
if (outDir) mkdirSync(outDir, { recursive: true });
let saved = 0;
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });

const ORDER = ["entity", "partOf", "classification", "attribute", "property", "material"];
// A class list matches as a set (one name, or an enumeration of names in any order).
const entityNames = (f) => (f.name.simple !== undefined ? [f.name.simple] : f.name.r && f.name.r.enumeration.length && !f.name.r.pattern.length ? [...new Set(f.name.r.enumeration)].sort() : null);
const canonFacet = (f, req) => f.kind === "entity" && entityNames(f) ? `entity: ${entityNames(f).join("|")}${f.predefinedType.present ? " of " + f.predefinedType : ""}` : `${f.kind}${req && f.kind !== "entity" ? " " + f.cardinality : ""}${f.dataType ? " [" + f.dataType + "]" : ""}: ${f.describe()}`;
const canonSpec = (s) => JSON.stringify({
  name: s.name, description: s.description, instructions: s.instructions, ifcVersion: s.ifcVersion, optionality: s.optionality,
  requirementsDescription: s.requirementsDescription || null,
  app: s.applicability.map((f) => canonFacet(f, false)).sort((a, b) => ORDER.indexOf(a.split(/[ :]/)[0]) - ORDER.indexOf(b.split(/[ :]/)[0]) || a.localeCompare(b)),
  // A prohibited specification's requirements are not written (the audit's rule).
  req: s.optionality === "prohibited" ? [] : s.requirements.map((f) => canonFacet(f, true)).sort(),
});
const errorCodes = (ids) => auditIds(ids, R).filter((x) => x.level === "error").map((x) => x.code).sort().join(",");

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
  ["public IDS files (eval/real-ids-files.txt)", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool ValidFiles", walk(join(here, "corpus/IDS-Audit-tool/testing.shared/ValidFiles"))],
  ["buildingSMART test cases (pass-*)", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases")).filter((f) => /[\/]pass-/.test(f))],
];
if (!groups[0][1].length) { console.error("run eval/fetch-audit-corpus.sh (and eval/fetch-testcases.sh) first"); process.exit(2); }

let bad = 0;
const t0 = Date.now();
for (const [label, files] of groups) {
  let n = 0, unread = 0, same = 0, specs = 0, specsSame = 0, rows = 0, kept = 0, dropped = 0, newErrors = 0, fullyEditable = 0;
  const misses = [];
  for (const f of files) {
    let orig;
    const text = readFileSync(f, "utf8");
    try { orig = parseIds(text); } catch { unread++; continue; }
    n++;
    const imp = importIds(orig, loadFor);
    const L = loadFor(imp.state.schema);
    const backXml = buildIds(stateToDoc(imp.state, L), L.S);
    const back = parseIds(backXml);
    if (outDir) { const k = String(++saved).padStart(3, "0"); writeFileSync(join(outDir, `${k}.orig.ids`), text); writeFileSync(join(outDir, `${k}.back.ids`), backXml); writeFileSync(join(outDir, `${k}.name`), f.replace(here, "")); }
    rows += imp.rows; kept += imp.kept; dropped += imp.dropped;
    if (!imp.kept) fullyEditable++;
    let ok = back.title === (orig.title || "Untitled IDS") || (!orig.title && back.title === "Untitled IDS");
    ok = ok && JSON.stringify({ ...back.info, title: 0 }) === JSON.stringify({ ...orig.info, title: 0 }) && back.specs.length === orig.specs.length;
    specs += orig.specs.length;
    for (let i = 0; i < orig.specs.length; i++) {
      const o = { ...orig.specs[i], name: orig.specs[i].name === "(unnamed)" ? "Unnamed specification" : orig.specs[i].name };
      const b = back.specs[i];
      if (b && canonSpec(o) === canonSpec(b)) specsSame++;
      else { ok = false; if (misses.length < 8) misses.push(`${f.replace(here, "")} spec ${i + 1}:\n    was ${canonSpec(o)}\n    now ${b ? canonSpec(b) : "(missing)"}`); }
    }
    // Writing back must not change which audit errors the file has.
    // The one expected change: requirements of a prohibited specification are
    // not written, so the audit's prohibited-requirements error goes.
    const eo = errorCodes(orig).split(",").filter((c) => c && !(imp.dropped && c === "prohibited-requirements")).join(","), eb = errorCodes(back);
    if (eb !== eo) { newErrors++; if (misses.length < 8) misses.push(`${f.replace(here, "")}: audit errors were [${eo}], now [${eb}]`); }
    if (ok) same++;
  }
  bad += n - same + newErrors;
  console.log(`${label}: ${n} opened${unread ? `, ${unread} unreadable` : ""}; ${same} of ${n} write back asking the same (${specsSame} of ${specs} specifications); audit errors changed on ${newErrors}`);
  console.log(`  facets editable in the page ${rows}, held as written ${kept} (${(100 * rows / Math.max(1, rows + kept)).toFixed(1)}% editable); files with every facet editable ${fullyEditable} of ${n}; prohibited-spec requirements not written ${dropped}`);
  if (misses.length && (list || n - same || newErrors)) for (const m of misses) console.log("  " + m);
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad ? 1 : 0);
