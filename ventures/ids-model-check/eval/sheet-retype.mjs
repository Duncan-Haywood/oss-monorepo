#!/usr/bin/env node
// Does the downloaded .xlsx keep an IDS when a person edits it? Each IDS goes
// to rowsToXlsx; eval/sheet-retype.py retypes every cell in LibreOffice Calc
// and saves; xlsxToRows reads it back and the IDS content is compared with the
// original (canonicalIds). WRITER=/other/sheet.mjs and READER=/other/sheet.mjs
// write and read with another copy (the "before" column: cells not formatted
// as Text, the reader before Excel's types were read).
//
//   eval/fetch-audit-corpus.sh; eval/fetch-testcases.sh
//   soffice --headless --accept='socket,host=localhost,port=2002;urp;' &
//   node eval/sheet-retype.mjs [--verbose]
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { idsToRows, rowsToIds, canonicalIds } from "../sheet.mjs";
import { check } from "../node.mjs";

const { rowsToXlsx } = await import(process.env.WRITER ? pathToFileURL(process.env.WRITER).href : "../sheet.mjs");
const { xlsxToRows } = await import(process.env.READER ? pathToFileURL(process.env.READER).href : "../sheet.mjs");
const here = new URL(".", import.meta.url).pathname;
const verbose = process.argv.includes("--verbose");
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) walk(join(dir, d.name), out);
    else if (/\.ids(\.xml)?$/i.test(d.name)) out.push(join(dir, d.name));
  }
  return out;
};
const sets = [
  ["public IDS files (eval/corpus/real)", walk(join(here, "corpus/real"))],
  ["IDS-Audit-tool test files", walk(join(here, "corpus/IDS-Audit-tool/testing.shared"))],
  ["buildingSMART test pairs", walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases"))],
  ["this venture's samples", walk(join(here, "../samples")).filter((f) => !f.includes("bsi-ifc43"))],
];
const verdict = (t, ifc) => { try { const r = check(t, readFileSync(ifc, "utf8")); return r.pass ? "pass" : r.valid ? "fail" : "invalid"; } catch { return "error"; } };
const tmp = mkdtempSync(join(tmpdir(), "ids-retype-"));
for (const [n, [label, files]] of sets.entries()) {
  const src = join(tmp, `in${n}`), dst = join(tmp, `out${n}`);
  mkdirSync(src); mkdirSync(dst);
  const items = [];
  files.forEach((f, i) => {
    let text, rows;
    try { text = readFileSync(f, "utf8"); rows = idsToRows(text); } catch { return; }
    // Score against what the untouched download gives back, so only the edit counts.
    const x = rowsToIds(rows);
    if (!x.text) return;
    writeFileSync(join(src, `f${i}.xlsx`), rowsToXlsx(rows));
    items.push({ f, i, base: x.text });
  });
  execFileSync("python3", [join(here, "sheet-retype.py"), src, dst], { stdio: "inherit", timeout: 3600000 });
  const s = { files: items.length, same: 0, verdicts: 0, verdictSame: 0 };
  for (const { f, i, base } of items) {
    let back = null;
    try { back = rowsToIds(await xlsxToRows(new Uint8Array(readFileSync(join(dst, `f${i}.xlsx`))), (b) => inflateRawSync(b))).text; } catch (e) { if (verbose) console.log("unread", f, e.message); }
    if (back && canonicalIds(back) === canonicalIds(base)) s.same++;
    else if (verbose) console.log("differs:", f.replace(here, "eval/"));
    const ifc = f.replace(/\.ids$/, ".ifc");
    if (n === 2 && existsSync(ifc)) {
      s.verdicts++;
      if (back && verdict(back, ifc) === verdict(base, ifc)) s.verdictSame++;
    }
  }
  console.log(`${label}: same IDS content after every cell is retyped ${s.same} of ${s.files}${s.verdicts ? `; checker verdict unchanged ${s.verdictSame} of ${s.verdicts}` : ""}`);
}
