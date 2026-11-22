// Compares the formulas this tool reads (after shared-formula expansion)
// with openpyxl's reading of the same files, cell by cell.
//   node eval/crosscheck.mjs PYTHON BOOK.xlsx [...]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readWorkbook, addr } from "../xlsx.mjs";
import { auditWorkbook } from "../audit.mjs";

const [py, ...files] = process.argv.slice(2);
const script = fileURLToPath(new URL("./openpyxl_formulas.py", import.meta.url));
const norm = (f) => f.replace(/^=/, "").replace(/_xlfn\.|_xlws\./gi, "").replace(/\s+/g, "");
let total = 0, same = 0;
for (const file of files) {
  const theirs = JSON.parse(execFileSync(py, [script, file], { maxBuffer: 1 << 28 }).toString());
  const wb = await readWorkbook(new Uint8Array(readFileSync(file)));
  auditWorkbook(wb);
  const ours = {};
  for (const s of wb.sheets) for (const c of s.cells.values()) if (c.f) ours[`${s.name}!${addr(c.r, c.c)}`] = c.f;
  const keys = new Set([...Object.keys(theirs), ...Object.keys(ours)]);
  let n = 0, ok = 0; const diffs = [];
  for (const k of keys) {
    n++;
    if (ours[k] !== undefined && theirs[k] !== undefined && norm(ours[k]) === norm(theirs[k])) ok++;
    else if (diffs.length < 8) diffs.push(`${k}: ours ${ours[k] === undefined ? "(none)" : "=" + ours[k]} | openpyxl ${theirs[k] ?? "(none)"}`);
  }
  total += n; same += ok;
  console.log(`${file.split("/").pop()}: ${ok} of ${n} formula cells read the same`);
  for (const d of diffs) console.log("  " + d);
}
console.log(`all: ${same} of ${total}`);
