// Measures fix.mjs (eval/fix-structure-2026-11-18.md):
//   node eval/fix-structure.mjs OUT_DIR FILE...
// For each IDS file: runs fixStructure, writes the repaired copy to OUT_DIR
// (same base name, prefixed with its index), and checks
//   - a file with no ids.xsd fault comes back byte for byte;
//   - the checker reads the same specifications from the repaired copy
//     (parseIds, every facet, value and cardinality; IFC4X3 and IFC4X3_ADD2
//     compared as one, as the checker matches them; applicability facets as a
//     set, since an element must meet all of them in any order);
//   - what structure.mjs still reports afterwards.
// Writes OUT_DIR/fixed.txt, the list of repaired copies, for eval/ids-xsd-truth.py.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fixStructure } from "../fix.mjs";
import { parseIds } from "../ids.mjs";
import { parseXml } from "../xml.mjs";
import { parseXsdRegex, repairXsdRegex } from "../xsdregex.mjs";
import { structureIssues } from "../structure.mjs";

const [out, ...files] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const reading = (t) => {
  const r = parseIds(t);
  return JSON.stringify({ title: r.title, info: r.info, specs: r.specs.map((s) => ({ ...s, ifcVersion: s.ifcVersion.map((v) => (v.startsWith("IFC4X3") ? "IFC4X3" : v)), applicability: s.applicability.map((f) => JSON.stringify(f)).sort() })) });
};
const t = { files: 0, unreadable: 0, clean: 0, cleanSame: 0, broken: 0, touched: 0, nowClean: 0, sameReading: 0, readingDiff: [], codes: {}, left: {} };
const unxml = (v) => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const xml = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const patternsRepaired = (text) => text.replace(/(<(?:[\w-]+:)?pattern\s+value=")([^"]*)"/g, (m, a, v) => { const p = unxml(v), r = parseXsdRegex(p), fx = repairXsdRegex(p); return fx !== null && (!r.ok || r.notes.some((n) => n.fix)) ? a + xml(fx) + '"' : m; });
const written = [];
for (const [i, f] of files.entries()) {
  const text = readFileSync(f, "utf8");
  t.files++;
  let before;
  try { before = structureIssues(parseXml(text, { spans: true }), text); } catch { t.unreadable++; continue; }
  const r = fixStructure(text);
  // xs:pattern rewrites (pattern-xsd, eval/xsd-regex-2026-11-18.md) change what a
  // pattern means on purpose, so the reading is compared with the patterns
  // rewritten the same way, and a clean file with only those is counted apart.
  const pfix = r.fixes.filter((x) => x.code === "pattern-xsd").length;
  t.patternFixes = (t.patternFixes || 0) + pfix;
  if (!before.length) {
    t.clean++;
    if (r.text === text && !r.fixes.length) t.cleanSame++;
    else if (pfix === r.fixes.length && reading(patternsRepaired(text)) === reading(r.text)) t.cleanPatternOnly = (t.cleanPatternOnly || 0) + 1;
    else console.log("CHANGED A CLEAN FILE", f);
    continue;
  }
  t.broken++;
  if (!r.fixes.length) { for (const x of before) t.left[x.code] = (t.left[x.code] || 0) + 1; continue; }
  t.touched++;
  for (const x of r.fixes) t.codes[x.code] = (t.codes[x.code] || 0) + 1;
  for (const x of r.remaining) t.left[x.code] = (t.left[x.code] || 0) + 1;
  if (!r.remaining.length) t.nowClean++;
  let same = false;
  try { same = reading(pfix ? patternsRepaired(text) : text) === reading(r.text); } catch (e) { same = false; }
  if (same) t.sameReading++; else t.readingDiff.push(f);
  const dest = join(out, `${String(i).padStart(4, "0")}-${basename(f)}`);
  writeFileSync(dest, r.text);
  written.push(dest);
  if (process.env.SHOW) { console.log(f, r.fixes.length, "fixes,", r.remaining.length, "left"); for (const x of r.remaining.slice(0, 2)) console.log("   left:", x.message); }
}
writeFileSync(join(out, "fixed.txt"), written.join("\n") + "\n");
console.log(`${t.files} files: ${t.unreadable} not XML the reader opens, ${t.clean} without an ids.xsd fault (${t.cleanSame} returned unchanged, ${t.cleanPatternOnly || 0} changed only in xs:pattern values, read the same as the original with those patterns rewritten), ${t.broken} with one; ${t.patternFixes} pattern rewrites in all`);
console.log(`of the ${t.broken}: ${t.touched} repaired in part or whole, ${t.nowClean} with nothing left that structure.mjs reports; same reading after repair ${t.sameReading} of ${t.touched}`);
for (const f of t.readingDiff) console.log("READING CHANGED", f);
console.log("fixes by code:", JSON.stringify(t.codes));
console.log("left by code:", JSON.stringify(t.left));
