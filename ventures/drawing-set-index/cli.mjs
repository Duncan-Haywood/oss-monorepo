#!/usr/bin/env node
// @ts-check
// Drawing set index from a construction drawing set PDF.
//   node cli.mjs set.pdf [more.pdf] [--csv index.csv] [--json]
//   node cli.mjs --compare old.pdf new.pdf [--csv changes.csv]
import { readFileSync, writeFileSync } from "node:fs";
import { readRuns } from "./read.mjs";
import { indexSet, checkSet, compareSets, indexCsv, compareCsv, report } from "./engine.mjs";

const args = process.argv.slice(2);
const DISCLAIMER = `No warranty. This tool is provided free and as-is, without warranty of any kind. It is not
legal, construction, engineering or professional advice. It reads the text layer of the PDF you
give it and can miss or misread sheet numbers, titles and changes; it does not compare linework.
The issued drawings govern. You are responsible for reviewing and verifying its output before
relying on it. To the maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.`;
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(`usage: node cli.mjs <set.pdf> [more.pdf ...] [--csv index.csv] [--json]
       node cli.mjs --compare <old.pdf> <new.pdf> [--csv changes.csv] [--json]

Lists every sheet of a drawing set (number, title, discipline, sheet type), checks the set
(missing or duplicate numbers, NCS order, the cover sheet's drawing index against the sheets),
or compares two issues sheet by sheet. Nothing is uploaded anywhere.

${DISCLAIMER}`);
  process.exit(args.length ? 0 : 2);
}
const csvAt = args.indexOf("--csv");
const csvOut = csvAt >= 0 ? args[csvAt + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && (csvAt < 0 || i !== csvAt + 1));

async function load(paths) {
  const pages = [];
  for (const f of paths) {
    const { pages: ps, flags } = await readRuns(new Uint8Array(readFileSync(f)));
    if (flags.notPdf) { console.error(`${f}: not a PDF`); continue; }
    if (flags.encrypted) { console.error(`${f}: encrypted PDF, cannot read`); continue; }
    if (!flags.pagesWithText) console.error(`${f}: no text layer (scanned?); sheet numbers cannot be read without OCR.`);
    for (const p of ps) pages.push(p);
  }
  return pages;
}

if (args.includes("--compare")) {
  if (files.length !== 2) { console.error("--compare takes two files: the older issue, then the newer"); process.exit(2); }
  const [a, b] = [indexSet(await load([files[0]])), indexSet(await load([files[1]]))];
  const rows = compareSets(a, b);
  if (args.includes("--json")) console.log(JSON.stringify(rows, null, 1));
  else {
    const n = (s) => rows.filter((r) => r.status === s).length;
    console.log(`${rows.length} sheets: ${n("added")} added, ${n("removed")} removed, ${n("retitled")} retitled, ${n("text changed")} with text changes, ${n("same text")} with the same text.`);
    for (const r of rows) console.log(`  ${r.number.padEnd(10)} ${r.status.padEnd(13)} ${r.newTitle || r.oldTitle}${r.status === "text changed" ? `  (+${r.added.length} / -${r.removed.length})` : ""}`);
  }
  if (csvOut) writeFileSync(csvOut, compareCsv(rows));
  process.exit(0);
}
const index = indexSet(await load(files), { file: files.length === 1 ? files[0].split(/[\\/]/).pop() : "" });
const findings = checkSet(index);
if (args.includes("--json")) console.log(JSON.stringify({ sheets: index.sheets.map(({ signature, ...s }) => s), drawingIndex: index.drawingIndex, findings }, null, 1));
else console.log(report(index, findings));
if (csvOut) { writeFileSync(csvOut, indexCsv(index)); console.error(`wrote ${index.sheets.length} rows to ${csvOut}`); }
process.exit(index.sheets.some((s) => s.number) ? 0 : 1);
