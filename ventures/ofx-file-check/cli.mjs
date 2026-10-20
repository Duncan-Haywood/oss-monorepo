#!/usr/bin/env node
// Zero-dependency CLI for ofx-file-check: check (and optionally repair) local OFX/QFX files, one
// by one or a whole folder. Reads only the paths named on the command line; no network call.
//
//   node cli.mjs check statement.qfx
//   node cli.mjs check downloads/ --json
//   node cli.mjs check downloads/ --strict          # warnings fail the run too
//   node cli.mjs fix statement.qfx                  # writes statement.fixed.qfx (never overwrites)
//   node cli.mjs fix statement.qfx --out fixed.qfx  # or --out-dir for several files

import fs from "node:fs/promises";
import path from "node:path";
import { decodeBuffer, validate, repair, findingsCsv, diffLines } from "./calc.mjs";

const IGNORE_DIRS = new Set(["node_modules", ".git"]);
const EXT = /\.(ofx|qfx)$/i;

export function parseArgs(argv) {
  const args = { json: false, csv: false, strict: false, diff: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--csv") args.csv = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--diff") args.diff = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("-")) args.unknown = a;
    else if (!args.sub) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

export async function walk(root, out = []) {
  const st = await fs.stat(root).catch(() => null);
  if (!st) return out;
  if (st.isFile()) { out.push(root); return out; }
  for (const e of (await fs.readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith(".")) await walk(full, out); }
    else if (e.isFile() && EXT.test(e.name)) out.push(full);
  }
  return out;
}

const HELP = `ofx-file-check CLI
  check <file|dir>...   list what would make an OFX/QFX import fail (exit 1 on errors)
  fix <file|dir>...     write <name>.fixed.<ext> with every provable fix applied
Options: --json  --csv  --strict (warnings fail)  --diff (fix: print the diff)  --out <file>  --out-dir <dir>
Files are read locally and never uploaded. Not financial advice; no warranty.`;

export async function run(argv, io = { out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) }) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) { io.out(HELP + "\n"); return args.help ? 0 : 2; }
  if (args.unknown) { io.err(`unknown option ${args.unknown}\n`); return 2; }
  if (!["check", "fix"].includes(args.sub) || !args.positional.length) { io.err(HELP + "\n"); return 2; }
  const files = [];
  for (const p of args.positional) {
    const found = await walk(p);
    if (!found.length) { io.err(`no OFX/QFX files at ${p}\n`); return 2; }
    files.push(...found);
  }
  if (args.sub === "fix" && args.out && files.length > 1) { io.err("--out takes one file; use --out-dir for several\n"); return 2; }
  const results = [];
  let failed = false;
  for (const file of files) {
    const text = decodeBuffer(await fs.readFile(file));
    const res = validate(text);
    const entry = { file, summary: res.summary, findings: res.findings };
    if (res.summary.errors || (args.strict && res.summary.warnings)) failed = true;
    if (args.sub === "fix") {
      const fixed = repair(text);
      entry.changes = fixed.changes;
      if (fixed.changes.length) {
        const ext = path.extname(file);
        const dest = args.out || path.join(args.outDir || path.dirname(file), path.basename(file, ext) + ".fixed" + ext);
        if (path.resolve(dest) === path.resolve(file)) { io.err(`refusing to overwrite ${file}\n`); return 2; }
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, fixed.text);
        entry.written = dest;
        if (args.diff) entry.diff = diffLines(text, fixed.text);
      }
    }
    results.push(entry);
  }
  if (args.json) io.out(JSON.stringify(results, null, 2) + "\n");
  else if (args.csv) io.out(results.map((r) => `# ${r.file}\n` + findingsCsv(r)).join(""));
  else {
    for (const r of results) {
      io.out(`${r.file}: ${r.summary.errors} error(s), ${r.summary.warnings} warning(s), ${r.summary.fixable} auto-fixable\n`);
      for (const f of r.findings) io.out(`  ${f.severity.padEnd(7)} line ${f.line || "-"}: ${f.title}\n`);
      if (r.written) io.out(`  wrote ${r.written} (${r.changes.length} change(s)); confirm duplicates and dates yourself before importing\n`);
      if (r.diff) for (const d of r.diff) io.out(`    ${d}\n`);
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exitCode = await run(process.argv.slice(2));
}
