// Score sheet number and title reading against single-sheet PDFs whose file
// names carry the truth: Revit's "Project - Sheet - A-101 - First Floor.pdf"
// export names, and sheet files named "A101 - FLOOR PLAN - 1ST FLOOR.pdf".
// The PDFs come from OpeningDesign's public project repositories on GitHub
// (eval/README.md says how to fetch them); they are not stored here.
//   node eval/sheet-files.mjs <dir with index.tsv: local-name TAB repo path>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRuns } from "../read.mjs";
import { indexSet, canonicalId } from "../engine.mjs";

const dir = process.argv[2];
const rows = readFileSync(join(dir, "index.tsv"), "utf8").trim().split("\n").map((l) => l.split("\t"));
// Revit replaces characters a file name cannot hold (":" "." "/") with "-" or "_".
const words = (t) => t.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();
let n = 0, numOk = 0, titleOk = 0, skipped = 0, multi = 0;
const misses = [];
for (const [local, path] of rows) {
  const name = path.split("/").pop().replace(/\.pdf$/i, "");
  const m = /(?:^|Sheet[_ ]*-?\s*)([A-Z]{1,3}-?\d{2,4}(?:-[A-Z])?) - (.+)$/.exec(name);
  if (!m) { skipped++; continue; }
  const { pages, flags } = await readRuns(new Uint8Array(readFileSync(join(dir, local))));
  if (!flags.pagesWithText) { skipped++; misses.push(`${local}: no text layer (${name})`); continue; }
  if (pages.length !== 1) { multi++; continue; }
  n++;
  const s = indexSet(pages).sheets[0];
  const okN = s.canonical === canonicalId(m[1]);
  const okT = words(s.title) === words(m[2]);
  if (okN) numOk++;
  if (okN && okT) titleOk++;
  if (!okN || !okT) misses.push(`${local}: want ${m[1]} | ${m[2]} -- got ${s.number || "?"} | ${s.title}`);
}
const pct = (a) => `${(100 * a / n).toFixed(1)}%`;
console.log(`${n} single-sheet PDFs scored (${skipped} skipped: no truth in the name or no text; ${multi} with more than one page left out)`);
console.log(`sheet number right: ${numOk} of ${n} (${pct(numOk)})`);
console.log(`number and title right: ${titleOk} of ${n} (${pct(titleOk)})`);
if (misses.length) { console.log("\nmisses:"); for (const x of misses) console.log("  " + x); }
