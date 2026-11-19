#!/usr/bin/env node
// @ts-check
// Submittal register from a project manual: node cli.mjs <book.pdf|book.txt> [more files] [--csv out.csv] [--json]
// A .txt file is read with form feeds as page breaks (pdftotext's output).
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, constants as zlibConstants } from "node:zlib";
import { extractPdfLines } from "./pdf-text.mjs";
import { buildRegister, linesFromPdf, linesFromText, report, toCsv } from "./engine.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(`usage: node cli.mjs <project-manual.pdf|.txt> [more files] [--csv out.csv] [--json]

Reads each section's Part 1 submittal articles and writes one row per submittal.
Nothing is uploaded anywhere.

No warranty. This tool is provided free and as-is, without warranty of any kind. It is not
legal, construction, engineering or professional advice. It reads the text of the book you
give it and can miss or misread requirements; the specifications and the design team's
instructions govern. You are responsible for reviewing and verifying its output before
relying on it. To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.`);
  process.exit(args.length ? 0 : 2);
}
const csvAt = args.indexOf("--csv");
const csvOut = csvAt >= 0 ? args[csvAt + 1] : null;
const files = args.filter((a, i) => !a.startsWith("--") && (csvAt < 0 || i !== csvAt + 1));

const inflate = async (b) => { try { return new Uint8Array(inflateSync(b, { finishFlush: zlibConstants.Z_SYNC_FLUSH })); } catch { return null; } };
let lines = [];
let pageBase = 0;
for (const f of files) {
  const bytes = readFileSync(f);
  let ls;
  if (/\.pdf$/i.test(f) || bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    const { pages, flags } = await extractPdfLines(new Uint8Array(bytes), inflate);
    if (flags.encrypted) { console.error(`${f}: encrypted PDF, cannot read`); continue; }
    if (!flags.pagesWithText) { console.error(`${f}: no text layer (scanned?). Run OCR first.`); continue; }
    ls = linesFromPdf(pages);
  } else ls = linesFromText(bytes.toString("utf8"));
  for (const l of ls) { l.file = f.split(/[\\/]/).pop(); l.filePage = l.page; l.page += pageBase; }
  for (const l of ls) if (l.page > pageBase) pageBase = l.page;
  lines = lines.concat(ls);
}
const reg = buildRegister(lines);
if (args.includes("--json")) console.log(JSON.stringify(reg, null, 1));
else console.log(report(reg));
if (csvOut) { writeFileSync(csvOut, toCsv(reg)); console.error(`wrote ${reg.items.length} rows to ${csvOut}`); }
process.exit(reg.items.length ? 0 : 1);
