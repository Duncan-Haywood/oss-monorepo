#!/usr/bin/env node
// Zero-dependency CLI: lint iCalendar (.ics) files or a published feed URL in CI.
// Local files are read from disk and never sent anywhere; a URL argument is fetched
// with one GET, which is the only network call this tool makes.
//
//   node cli.mjs check calendar.ics
//   node cli.mjs check public/            # every .ics under a directory
//   node cli.mjs check https://example.com/events.ics
//   node cli.mjs check feed.ics --json
//   node cli.mjs check feed.ics --strict  # warnings fail the run too
//   node cli.mjs fix feed.ics             # write feed.fixed.ics; --in-place overwrites
//
// Exit codes: 0 clean, 1 findings at the failing level, 2 usage or read error.

import fs from "node:fs/promises";
import path from "node:path";
import { decodeBuffer, validate, repair } from "./calc.mjs";

const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const HELP = `ics-calendar-check: lint .ics files and feeds

  check <file|dir|url>...   report problems (errors fail; --strict makes warnings fail)
  fix <file>...             write <name>.fixed.ics with provable fixes (--in-place overwrites)
  --json                    machine-readable output
`;

export function parseArgs(argv) {
  const a = { json: false, strict: false, inPlace: false, positional: [] };
  for (const x of argv) {
    if (x === "--json") a.json = true;
    else if (x === "--strict") a.strict = true;
    else if (x === "--in-place") a.inPlace = true;
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
    else if (e.isFile() && /\.ics$/i.test(e.name)) out.push(full);
  }
  return out;
}

const defaults = {
  readFile: (p) => fs.readFile(p),
  writeFile: (p, t) => fs.writeFile(p, t),
  stat: (p) => fs.stat(p),
  readdir: (p) => fs.readdir(p, { withFileTypes: true }),
  fetch: (u) => globalThis.fetch(u),
  out: (s) => process.stdout.write(s + "\n"),
  err: (s) => process.stderr.write(s + "\n"),
};

async function load(target, deps) {
  if (/^https?:\/\//i.test(target)) {
    const res = await deps.fetch(target.replace(/^webcals?:/i, "https:"));
    if (!res.ok) throw new Error(`${target}: HTTP ${res.status}`);
    return decodeBuffer(await res.arrayBuffer());
  }
  return decodeBuffer(await deps.readFile(target));
}

async function expand(targets, deps) {
  const files = [];
  for (const t of targets) {
    if (/^https?:\/\//i.test(t)) { files.push(t); continue; }
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
    deps.err(a.unknown ? `unknown option ${a.unknown}` : "usage: check|fix <file|dir|url>...");
    return 2;
  }
  let files;
  try { files = await expand(a.positional, deps); } catch (e) { deps.err(e.message); return 2; }
  if (!files.length) { deps.err("no .ics files found"); return 2; }

  let failed = false;
  const report = [];
  for (const f of files) {
    let text;
    try { text = await load(f, deps); } catch (e) { deps.err(`${f}: ${e.message}`); return 2; }
    if (a.sub === "fix") {
      if (/^https?:/i.test(f)) { deps.err("fix works on local files; download the feed first"); return 2; }
      const { text: fixed, changes } = repair(text);
      const dest = a.inPlace ? f : f.replace(/(\.ics)?$/i, ".fixed.ics");
      await deps.writeFile(dest, fixed);
      const left = validate(fixed).summary;
      report.push({ file: f, wrote: dest, changes, remainingErrors: left.errors, remainingWarnings: left.warnings });
      if (left.errors || (a.strict && left.warnings)) failed = true;
    } else {
      const r = validate(text);
      report.push({ file: f, summary: r.summary, findings: r.findings });
      if (r.summary.errors || (a.strict && r.summary.warnings)) failed = true;
    }
  }
  if (a.json) deps.out(JSON.stringify(report, null, 2));
  else for (const r of report) {
    if (r.wrote) { deps.out(`${r.file}: wrote ${r.wrote} (${r.changes.length} fixes, ${r.remainingErrors} errors and ${r.remainingWarnings} warnings remain)`); continue; }
    deps.out(`${r.file}: ${r.summary.events} events, ${r.summary.errors} errors, ${r.summary.warnings} warnings`);
    for (const x of r.findings) deps.out(`  ${x.severity.padEnd(7)} line ${x.line || "-"}: ${x.title}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
