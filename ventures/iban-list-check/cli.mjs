#!/usr/bin/env node
// Zero-dependency CLI: check supplier or payroll IBAN lists (CSV/TSV) in CI or before a payment run.
// Files are read from disk and never sent anywhere; this tool makes no network calls.
//
//   node cli.mjs check suppliers.csv
//   node cli.mjs check exports/            # every .csv/.tsv/.txt under a directory
//   node cli.mjs check suppliers.csv --column iban --sepa-only
//   node cli.mjs check suppliers.csv --json
//   node cli.mjs check suppliers.csv --strict   # warnings (duplicates, blanks) fail too
//   node cli.mjs fix suppliers.csv         # write suppliers.fixed.csv; --in-place overwrites; --groups prints in fours
//
// Exit codes: 0 clean, 1 findings at the failing level, 2 usage or read error.

import fs from "node:fs/promises";
import path from "node:path";
import { decodeBuffer, validate, repair } from "./calc.mjs";

const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const HELP = `iban-list-check: check IBAN columns in CSV files

  check <file|dir>...   report problems (errors fail; --strict makes warnings fail)
  fix <file>...         write <name>.fixed.csv with normalised IBANs (--in-place overwrites)
  --column <name|n>     IBAN column (default: detected)
  --sepa-only           warn on IBANs outside the core SEPA countries
  --groups              fix: print IBANs in groups of four
  --json                machine-readable output
`;

export function parseArgs(argv) {
  const a = { json: false, strict: false, inPlace: false, sepaOnly: false, groups: false, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--json") a.json = true;
    else if (x === "--strict") a.strict = true;
    else if (x === "--in-place") a.inPlace = true;
    else if (x === "--sepa-only") a.sepaOnly = true;
    else if (x === "--groups") a.groups = true;
    else if (x === "--column") { a.column = argv[++i]; if (a.column === undefined) a.unknown = "--column (needs a value)"; }
    else if (x === "-h" || x === "--help") a.help = true;
    else if (x.startsWith("-")) a.unknown = x;
    else if (!a.sub) a.sub = x;
    else a.positional.push(x);
  }
  return a;
}

async function walk(root, deps, out = []) {
  for (const e of await deps.readdir(root)) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith(".")) await walk(full, deps, out); }
    else if (e.isFile() && /\.(csv|tsv|txt)$/i.test(e.name) && !/\.fixed\./i.test(e.name)) out.push(full);
  }
  return out;
}

const defaults = {
  readFile: (p) => fs.readFile(p),
  writeFile: (p, t) => fs.writeFile(p, t),
  stat: (p) => fs.stat(p),
  readdir: (p) => fs.readdir(p, { withFileTypes: true }),
  out: (s) => process.stdout.write(s + "\n"),
  err: (s) => process.stderr.write(s + "\n"),
};

async function expand(targets, deps) {
  const files = [];
  for (const t of targets) {
    let st;
    try { st = await deps.stat(t); } catch (e) { throw new Error(`cannot read ${t}: ${e.message}`); }
    if (st.isDirectory()) files.push(...(await walk(t, deps)).sort());
    else files.push(t);
  }
  return files;
}

export async function main(argv, overrides = {}) {
  const deps = { ...defaults, ...overrides };
  const a = parseArgs(argv);
  if (a.help || !a.sub) { deps.out(HELP); return a.help ? 0 : 2; }
  if (a.unknown || !["check", "fix"].includes(a.sub) || !a.positional.length) {
    deps.err(a.unknown ? `unknown option ${a.unknown}` : "usage: check|fix <file|dir>...");
    return 2;
  }
  let files;
  try { files = await expand(a.positional, deps); } catch (e) { deps.err(e.message); return 2; }
  if (!files.length) { deps.err("no .csv, .tsv or .txt files found"); return 2; }

  const options = { column: a.column, sepaOnly: a.sepaOnly, groups: a.groups };
  let failed = false;
  const report = [];
  for (const f of files) {
    let text;
    try { text = decodeBuffer(await deps.readFile(f)); } catch (e) { deps.err(`${f}: ${e.message}`); return 2; }
    if (a.sub === "fix") {
      const { text: fixed, changes } = repair(text, options);
      const dest = a.inPlace ? f : f.replace(/(\.[^./\\]+)?$/, ".fixed$1");
      await deps.writeFile(dest, fixed);
      const left = validate(fixed, options).summary;
      report.push({ file: f, wrote: dest, changes, remainingErrors: left.errors, remainingWarnings: left.warnings });
      if (left.errors || (a.strict && left.warnings)) failed = true;
    } else {
      const r = validate(text, options);
      report.push({ file: f, summary: r.summary, findings: r.findings });
      if (r.summary.errors || (a.strict && r.summary.warnings)) failed = true;
    }
  }
  if (a.json) deps.out(JSON.stringify(report, null, 2));
  else for (const r of report) {
    if (r.wrote) { deps.out(`${r.file}: wrote ${r.wrote} (${r.changes.length} fixes, ${r.remainingErrors} errors and ${r.remainingWarnings} warnings remain)`); continue; }
    deps.out(`${r.file}: ${r.summary.codes} IBANs, ${r.summary.valid + r.summary.fixable} valid, ${r.summary.errors} errors, ${r.summary.warnings} warnings`);
    for (const x of r.findings) deps.out(`  ${x.severity.padEnd(7)} line ${x.line || "-"}: ${x.title}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
