#!/usr/bin/env node
// excel-model-audit: audit .xlsx/.xlsm workbooks from the command line.
//   node cli.mjs model.xlsx [more.xlsx ...] [--csv out.csv] [--json] [--min high|medium|info]
// Exit code 1 when any finding at or above --fail-on (default: high) is found.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { auditBytes, findingsCsv } from "./audit.mjs";

const HELP = `Usage: node cli.mjs FILE.xlsx [FILE ...] [--json] [--csv OUT.csv] [--min high|medium|info] [--fail-on high|medium|info|none]

Audits Excel workbooks for inconsistent copied formulas, typed-over formulas,
SUM ranges that stop short, circular references, error sources, #REF!,
numbers stored as text, typed constants in formulas, hidden content and
external links. The file is read locally; nothing is sent anywhere.

No warranty. This tool is provided free and as-is, without warranty of any
kind. It is not accounting, financial, audit or engineering advice, and a
clean result does not mean a model is right. You are responsible for
reviewing and verifying its output before relying on it.`;

const ORDER = new Map([["high", 0], ["medium", 1], ["info", 2], ["none", -1]]);
const rank = (k) => ORDER.get(k) ?? 3;

export async function main(argv, out = process.stdout) {
  const files = [], opts = { min: "info", failOn: "high" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { out.write(HELP + "\n"); return 0; }
    else if (a === "--json") opts.json = true;
    else if (a === "--csv" || a === "--min" || a === "--fail-on") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) { out.write(`${a} needs a value.\n${HELP}\n`); return 2; }
      if (a === "--csv") opts.csv = v; else if (a === "--min") opts.min = v; else opts.failOn = v;
    }
    else files.push(a);
  }
  if (!files.length || !ORDER.has(opts.min) || !ORDER.has(opts.failOn)) { out.write(HELP + "\n"); return 2; }
  let worst = 99;
  const json = [];
  for (const file of files) {
    let r;
    try { r = await auditBytes(new Uint8Array(readFileSync(file))); }
    catch (e) { out.write(`${file}: ${e.message}\n`); worst = Math.min(worst, 0); continue; }
    const shown = r.findings.filter((f) => rank(f.severity) <= rank(opts.min));
    for (const f of r.findings) worst = Math.min(worst, rank(f.severity));
    if (opts.csv) writeFileSync(files.length > 1 ? opts.csv.replace(/(\.csv)?$/, `-${json.length + 1}.csv`) : opts.csv, findingsCsv(r));
    if (opts.json) { json.push({ file, summary: r.summary, sheets: r.sheets, findings: shown }); continue; }
    const s = r.summary;
    out.write(`${file}: ${s.sheets} sheets, ${s.formulas} formulas (${s.distinct} distinct), ${s.high} high, ${s.medium} medium, ${s.info} info\n`);
    for (const f of shown) {
      const where = f.sheet ? `${f.sheet}${f.cell ? "!" + f.cell : ""}` : "workbook";
      out.write(`  [${f.severity}] ${where}: ${f.title}${f.formula ? `  =${f.formula}` : ""}${f.expected ? `  (neighbours imply =${f.expected})` : ""}\n`);
    }
  }
  if (opts.json) out.write(JSON.stringify(files.length === 1 ? json[0] : json, null, 2) + "\n");
  return opts.failOn !== "none" && worst <= rank(opts.failOn) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(process.exitCode ?? 0); throw e; });
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
