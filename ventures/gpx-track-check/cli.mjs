#!/usr/bin/env node
// Zero-dependency CLI: check GPX track files in a terminal or CI job.
// Files are read from disk and never sent anywhere; this tool makes no network calls.
//
//   node cli.mjs check ride.gpx
//   node cli.mjs check routes/            # every .gpx under a directory
//   node cli.mjs check ride.gpx --json
//   node cli.mjs check ride.gpx --strict  # warnings fail the run too
//   node cli.mjs thin ride.gpx --max-points=500   # write ride.thin.gpx
//   node cli.mjs fix ride.gpx             # write ride.fixed.gpx; --in-place overwrites
//
// Exit codes: 0 clean, 1 findings at the failing level, 2 usage or read error.

import fs from "node:fs/promises";
import path from "node:path";
import { decodeBuffer, validate, repair, thin } from "./calc.mjs";

const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const HELP = `gpx-track-check: check GPX track files

  check <file|dir>...   report problems (errors fail; --strict makes warnings fail)
  fix <file>...         write <name>.fixed.gpx with provable fixes (--in-place overwrites)
  thin <file>...        write <name>.thin.gpx with at most --max-points points (default 1000)
  --json                machine-readable output
`;

export function parseArgs(argv) {
  const a = { json: false, maxPoints: 1000, strict: false, inPlace: false, positional: [] };
  for (const x of argv) {
    if (x === "--json") a.json = true;
    else if (x === "--strict") a.strict = true;
    else if (x === "--in-place") a.inPlace = true;
    else if (x.startsWith("--max-points=")) { a.maxPoints = Number(x.slice(13)); if (!(a.maxPoints >= 2)) a.unknown = x; }
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
    else if (e.isFile() && /\.gpx$/i.test(e.name)) out.push(full);
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
  if (a.unknown || !["check", "fix", "thin"].includes(a.sub) || !a.positional.length) {
    deps.err(a.unknown ? `unknown option ${a.unknown}` : "usage: check|fix|thin <file|dir>...");
    return 2;
  }
  let files;
  try { files = await expand(a.positional, deps); } catch (e) { deps.err(e.message); return 2; }
  if (!files.length) { deps.err("no .gpx files found"); return 2; }

  let failed = false;
  const report = [];
  for (const f of files) {
    let text;
    try { text = decodeBuffer(await deps.readFile(f)); } catch (e) { deps.err(`${f}: ${e.message}`); return 2; }
    if (a.sub === "thin") {
      const t = thin(text, a.maxPoints);
      const dest = a.inPlace ? f : f.replace(/(\.gpx)?$/i, ".thin.gpx");
      await deps.writeFile(dest, t.text);
      report.push({ file: f, wrote: dest, kept: t.kept, removed: t.removed, toleranceM: t.toleranceM, changes: [] });
    } else if (a.sub === "fix") {
      const { text: fixed, changes } = repair(text);
      const dest = a.inPlace ? f : f.replace(/(\.gpx)?$/i, ".fixed.gpx");
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
    if (r.wrote && r.kept !== undefined) { deps.out(`${r.file}: wrote ${r.wrote} (${r.kept} points kept, ${r.removed} removed, within ~${r.toleranceM} m)`); continue; }
    if (r.wrote) { deps.out(`${r.file}: wrote ${r.wrote} (${r.changes.length} fixes, ${r.remainingErrors} errors and ${r.remainingWarnings} warnings remain)`); continue; }
    deps.out(`${r.file}: ${r.summary.points} points, ${r.summary.errors} errors, ${r.summary.warnings} warnings`);
    for (const x of r.findings) deps.out(`  ${x.severity.padEnd(7)} line ${x.line || "-"}: ${x.message}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
