#!/usr/bin/env node
// How the editor opens a specification whose class list names several classes
// with their subclasses (IFCWALL IFCWALLSTANDARDCASE ... IFCSLAB
// IFCSLABSTANDARDCASE ...): per class with its subclass box ticked
// (classListBases, 2026-11-18), against before, when only the first class had
// a box and every other name stayed an exact class in "Also applies to".
// Counts, on the files editor-open.mjs reads: specifications whose class list
// opens as editable classes, the names the page lists (cls + also) before and
// after, and the boxes ticked on further classes. Writes back are checked by
// editor-open.mjs (same set of classes either way).
//
//   sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh
//   node eval/also-subclasses.mjs [--list]
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseIds } from "../ids.mjs";
import { resources } from "../node.mjs";
import { importIds, specClassNames, subclasses } from "../editor.mjs";

const here = new URL(".", import.meta.url).pathname;
const list = process.argv.includes("--list");
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
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
  ["IDS-Audit-tool ValidFiles", walk(join(here, "corpus/IDS-Audit-tool/testing.shared/ValidFiles"))],
  ["buildingSMART pass cases", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases")).filter((f) => /[\/]pass-/.test(f))],
];
if (!groups[0][1].length) { console.error("run eval/fetch-audit-corpus.sh (and eval/fetch-testcases.sh) first"); process.exit(2); }

// The old reading: one class and all its subclasses, or the first name then
// every other name exact.
function oldListed(S, names) {
  const up = [...new Set(names)];
  if (up.length < 2) return up.length;
  const base = up.find((c) => S.entities[c] && [c, ...subclasses(S, c)].sort().join() === [...up].sort().join());
  return base ? 1 : up.length;
}
let mismatched = 0;
for (const [label, files] of groups) {
  let multi = 0, changed = 0, before = 0, after = 0, boxes = 0, files_ = new Set();
  const lines = [];
  for (const f of files) {
    let ids;
    try { ids = parseIds(readFileSync(f, "utf8")); } catch { continue; }
    const imp = importIds(ids, loadFor);
    const L = loadFor(imp.state.schema);
    for (const sp of imp.state.specs) {
      if (!sp.cls) continue;
      const names = specClassNames(L.S, sp);
      if (names.length < 2) continue;
      multi++;
      const was = oldListed(L.S, names);
      const now = 1 + (sp.also || []).length;
      before += was; after += now; boxes += (sp.alsoSub || []).length;
      if (now !== was) {
        changed++; files_.add(f);
        if (lines.length < 40) lines.push(`  ${f.replace(here, "")} "${sp.name}": ${was} names -> ${now}: ${[sp.cls + (sp.withSub ? "+" : ""), ...sp.also.map((c) => c + ((sp.alsoSub || []).includes(c) ? "+" : ""))].join(" ")}`);
      }
    }
  }
  console.log(`${label}: ${multi} specifications open with several classes; ${changed} in ${files_.size} file(s) open differently; names listed ${before} -> ${after}; subclass boxes ticked on further classes ${boxes}`);
  if (list) for (const l of lines) console.log(l);
}
process.exit(mismatched ? 1 : 0);
