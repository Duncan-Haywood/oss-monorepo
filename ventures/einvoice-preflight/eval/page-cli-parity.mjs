#!/usr/bin/env node
// Do the page and the Python CLI report the same rules on the same file?
//
// Four quality audits (2026-11-19 and earlier) said they do not, while the page
// and checks.mjs said "the same checks". This runs every invoice file shipped in
// the venture (examples/, fixtures/, tests/) through both:
//   - the page's built-in route: preflightDocuments() from page-engine.mjs, one
//     file at a time, default options (no official Schematron box, no profile);
//   - the Python CLI: `python3 -m einvoice_preflight <file> --format json`.
// and compares the set of rule ids each reports. A file the CLI cannot read
// (a format only the page knows) is counted apart, not as a rule difference.
//
//   node eval/page-cli-parity.mjs            # table on stdout
//   node eval/page-cli-parity.mjs --json     # machine-readable
//
// Exit code: 0 always (it is a measurement, not a gate).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preflightDocuments } from "../page-engine.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["examples", "fixtures", "tests"];
const EXT = new Set([".json", ".xml", ".pdf"]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (EXT.has(path.extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

function looksLikeInvoiceJson(text) {
  // Test fixtures that are tables (endpoint cases, expected outputs) are not invoices.
  try {
    const o = JSON.parse(text);
    return o && typeof o === "object" && !Array.isArray(o) && ("lines" in o || "totals" in o || "seller" in o);
  } catch { return false; }
}

async function pageRules(file) {
  const ext = path.extname(file).toLowerCase();
  const source = ext === ".pdf" ? new Uint8Array(readFileSync(file)) : readFileSync(file, "utf8");
  const r = await preflightDocuments([{ name: path.basename(file), source }]);
  if (r.readErrors?.length) return { read: false, error: r.readErrors[0].error, rules: [] };
  const rules = new Set((r.reports[0]?.errors ?? []).map((e) => e.rule));
  return { read: true, rules: [...rules].sort() };
}

function cliRules(file) {
  const p = spawnSync("python3", ["-m", "einvoice_preflight", file, "--format", "json"], {
    cwd: ROOT, env: { ...process.env, PYTHONPATH: path.join(ROOT, "src") }, encoding: "utf8", timeout: 60_000,
  });
  let d;
  try { d = JSON.parse(p.stdout); } catch { return { read: false, error: (p.stderr || p.stdout).trim().split("\n").pop(), rules: [] }; }
  if (d.read_errors?.length) return { read: false, error: String(d.read_errors[0].error ?? d.read_errors[0]), rules: [] };
  const rules = new Set((d.reports?.[0]?.errors ?? []).map((e) => e.rule));
  return { read: true, rules: [...rules].sort() };
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => path.extname(f) !== ".json" || looksLikeInvoiceJson(readFileSync(f, "utf8")));

const rows = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const page = await pageRules(f);
  const cli = cliRules(f);
  const onlyPage = page.rules.filter((r) => !cli.rules.includes(r));
  const onlyCli = cli.rules.filter((r) => !page.rules.includes(r));
  let kind;
  if (!page.read && !cli.read) kind = "neither reads";
  else if (!cli.read) kind = "page only reads";
  else if (!page.read) kind = "CLI only reads";
  else kind = onlyPage.length || onlyCli.length ? "rules differ" : "same";
  rows.push({ file: rel, kind, page: page.rules, cli: cli.rules, onlyPage, onlyCli, cliError: cli.read ? undefined : cli.error, pageError: page.read ? undefined : page.error });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  const count = (k) => rows.filter((r) => r.kind === k).length;
  console.log(`files: ${rows.length}`);
  for (const k of ["same", "rules differ", "page only reads", "CLI only reads", "neither reads"]) console.log(`  ${k}: ${count(k)}`);
  const tally = new Map();
  for (const r of rows.filter((x) => x.kind === "rules differ")) {
    for (const id of r.onlyPage) tally.set(`page only ${id}`, (tally.get(`page only ${id}`) ?? 0) + 1);
    for (const id of r.onlyCli) tally.set(`CLI only ${id}`, (tally.get(`CLI only ${id}`) ?? 0) + 1);
  }
  console.log("\nrule ids reported by one side only, on files both read (files):");
  for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`  ${k}: ${n}`);
  const formats = new Map();
  for (const r of rows.filter((x) => x.kind === "page only reads")) formats.set(path.dirname(r.file), (formats.get(path.dirname(r.file)) ?? 0) + 1);
  console.log("\nfiles only the page reads, by folder:");
  for (const [d, n] of [...formats].sort()) console.log(`  ${d}: ${n}`);
  console.log("\nfiles where the rules differ:");
  for (const r of rows.filter((x) => x.kind === "rules differ")) console.log(`  ${r.file}: page only [${r.onlyPage}] CLI only [${r.onlyCli}]`);
}
