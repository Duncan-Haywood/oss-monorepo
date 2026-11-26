// Lexical sweep for xmlvalues.mjs's CASTABLE (2026-11-18): writes DIR/leaves.jsonl with
// dates, times and dateTimes built from edge-case parts (years 0000, -0004, 12024, 02024;
// months 00..13; days 28..32 and 00; 24:00:00; seconds 60; zones Z, +14:00, +14:01, +15:00,
// +01:60) plus number and boolean shapes, each with CASTABLE's verdict, for
//   python3 -I eval/castable-coverage-saxonc.py DIR
// which asks SaxonC-HE the same question. Deterministic (no randomness).
//   node eval/castable-sweep.mjs DIR --files path ...   instead writes every distinct leaf value
// of the XML files under the paths (any format: UBL, CII, PINT, national), for the same check.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CASTABLE } from "../xmlvalues.mjs";
import { leaves } from "./xml-leaves.mjs";

const [dir, flag, ...paths] = process.argv.slice(2);
if (!dir) throw new Error("usage: node eval/castable-sweep.mjs DIR [--files path ...]");
if (flag === "--files") {
  const XML_TRIM = /^[ \t\n\r]+|[ \t\n\r]+$/g;
  const seen = new Map();
  const walk = (p) => statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((n) => walk(join(p, n))) : /\.(xml|isdoc)$/i.test(p) ? [p] : [];
  let files = 0;
  for (const file of paths.flatMap(walk)) {
    files++;
    for (const leaf of leaves(readFileSync(file, "utf8"))) {
      const value = leaf.raw.replace(XML_TRIM, "");
      if (!value || value.includes("&") || value.length > 64 || seen.has(value)) continue;
      seen.set(value, { format: "files", element: leaf.name, value, castable: CASTABLE.test(value), file: file.split("/").pop() });
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "leaves.jsonl"), [...seen.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${files} files, ${seen.size} distinct values`);
  process.exit(0);
}
const years = ["0000", "0001", "1900", "2000", "2023", "2024", "2100", "-0001", "-0004", "12024", "02024", "999"];
const monthDays = [["00", "10"], ["01", "31"], ["01", "32"], ["02", "28"], ["02", "29"], ["02", "30"], ["04", "30"], ["04", "31"], ["12", "31"], ["13", "01"], ["06", "00"]];
const times = ["00:00:00", "23:59:59", "23:59:59.999", "24:00:00", "24:00:00.0", "24:00:00.5", "24:00:01", "25:00:00", "10:60:00", "10:00:60", "10:00:59.5", "10:00", "1:00:00"];
const zones = ["", "Z", "+00:00", "+14:00", "-14:00", "+14:01", "+13:59", "+15:00", "+01:60", "-05:30", "z", "+1:00"];
const values = new Set();
for (const y of years) for (const [m, d] of monthDays) for (const z of zones) {
  values.add(`${y}-${m}-${d}${z}`);
  for (const t of ["10:00:00", "24:00:00"]) values.add(`${y}-${m}-${d}T${t}${z}`);
}
for (const t of times) for (const z of zones) {
  values.add(`${t}${z}`);
  values.add(`2024-02-29T${t}${z}`);
}
for (const v of ["0", "1", "-0", "+1.5", ".5", "5.", "1e3", "1E3", "INF", "NaN", "TRUE", "True", "00012", "1,5", "20240131", "20241331", "+", "-", ".", "T10:00:00", "2024-1-31", "2024-01-31T", "2024-01-31 10:00:00"]) values.add(v);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "leaves.jsonl"), [...values].map((value) => JSON.stringify({ format: "sweep", element: "-", value, castable: CASTABLE.test(value), file: "-" })).join("\n") + "\n");
console.log(`${values.size} values`);
