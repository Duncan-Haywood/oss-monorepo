#!/usr/bin/env node
// @ts-check
// Submittal register from a project manual: node cli.mjs <book.pdf|book.txt> [more files] [--csv out.csv] [--json]
// With --schedule <file.xer|file.csv>: a submittal schedule (submit-by dates) worked back from the project schedule.
// A .txt file is read with form feeds as page breaks (pdftotext's output).
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync, constants as zlibConstants } from "node:zlib";
import { extractPdfLines } from "./pdf-text.mjs";
import { buildRegister, linesFromPdf, linesFromText, report, toCsv } from "./engine.mjs";
import { readReviewPeriod, readSchedule, scheduleCsv, scheduleRegister, scheduleReport } from "./schedule.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(`usage: node cli.mjs <project-manual.pdf|.txt> [more files] [--csv out.csv] [--json]
       [--schedule schedule.xer|activities.csv] [--review-days N] [--working] [--cycles N]
       [--lead "05 12=56, 08 71=70"] [--pin "09 68 00=A1230"] [--data-date YYYY-MM-DD]

Reads each section's Part 1 submittal articles and writes one row per submittal.
With --schedule, finds the first activity that installs each section's work and dates
every submittal: Submit By = that activity's start - lead days - review days x cycles
(review days from Division 01 when the book states them, else 14 calendar days;
cycles default 2, a first review and one resubmittal). Closeout submittals are due one
review period before the schedule's last finish. --pin sets a section's activity by ID.
Nothing is uploaded anywhere.

No warranty. This tool is provided free and as-is, without warranty of any kind. It is not
legal, construction, engineering or professional advice. It reads the text of the book you
give it and can miss or misread requirements; the specifications and the design team's
instructions govern. You are responsible for reviewing and verifying its output before
relying on it. To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.`);
  process.exit(args.length ? 0 : 2);
}
const VALUED = ["--csv", "--schedule", "--review-days", "--cycles", "--lead", "--pin", "--data-date"];
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const csvOut = opt("--csv") || null;
const valueAt = new Set(VALUED.map((k) => args.indexOf(k)).filter((i) => i >= 0).map((i) => i + 1));
const files = args.filter((a, i) => !a.startsWith("--") && !valueAt.has(i));

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
let sched = null;
if (opt("--schedule")) {
  const s = readSchedule(readFileSync(opt("--schedule"), "latin1"));
  if (opt("--data-date")) s.dataDate = opt("--data-date");
  if (!s.activities.length) { console.error(`${opt("--schedule")}: no activities with a start date found`); process.exit(2); }
  sched = scheduleRegister(reg, s, {
    review: readReviewPeriod(lines),
    reviewDays: opt("--review-days") != null ? Number(opt("--review-days")) : undefined,
    working: args.includes("--working") ? true : undefined,
    cycles: opt("--cycles") != null ? Number(opt("--cycles")) : undefined,
    leadTimes: opt("--lead"), pins: opt("--pin"),
  });
}
if (args.includes("--json")) console.log(JSON.stringify(sched ? { ...reg, schedule: sched } : reg, null, 1));
else { console.log(report(reg)); if (sched) console.log(scheduleReport(sched)); }
if (csvOut) { writeFileSync(csvOut, sched ? scheduleCsv(sched) : toCsv(reg)); console.error(`wrote ${reg.items.length} rows to ${csvOut}`); }
process.exit(reg.items.length ? 0 : 1);
