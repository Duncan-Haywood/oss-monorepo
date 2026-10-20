#!/usr/bin/env node
// Zero-dependency CLI: diff an .env.example file against the environment
// variables actually read by a repo's own source code. No network call --
// reads only the example file and the local source files/directories named
// on the command line.
//
//   node cli.mjs check --example .env.example src
//   node cli.mjs check --example .env.example .        # scan the whole tree (node_modules/.git etc skipped)
//   node cli.mjs check --example .env.example src --json
//   node cli.mjs check --example .env.example src --strict   # also fail on unused declared vars
//   node cli.mjs check --example .env.example src app.py lib/config.rb

import fs from "node:fs/promises";
import path from "node:path";
import { parseExampleFile, scanSource, mergeReferenced, diffEnv, summarize } from "./engine.mjs";

const SCAN_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".rb", ".java", ".go"]);
const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", "vendor",
  ".next", ".venv", "venv", "target", ".terraform", "__pycache__",
]);

function parseArgs(argv) {
  const args = { example: ".env.example", json: false, strict: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--example") args.example = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

/** Recursively lists scannable source files under `root`, skipping IGNORE_DIRS and dotdirs. */
async function walk(root, { readdir = (p) => fs.readdir(p, { withFileTypes: true }) } = {}, out = []) {
  let entries;
  try {
    entries = await readdir(root);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(full, { readdir }, out);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Expands each CLI target (file or directory) into a flat list of source files to scan. */
async function resolveTargets(targets, deps) {
  const files = [];
  for (const target of targets) {
    let stat;
    try {
      stat = await deps.stat(target);
    } catch (err) {
      throw new Error(`cannot read ${target}: ${err.message}`);
    }
    if (stat.isDirectory()) {
      files.push(...(await walk(target, deps)));
    } else {
      files.push(target);
    }
  }
  return files;
}

function renderReport(report) {
  const { status, text } = summarize(report);
  const lines = [text];
  for (const m of report.missing) {
    const first = m.occurrences[0];
    const where = first ? `${first.file}:${first.line}` : "";
    lines.push(`  MISSING  ${m.name}  (read at ${where}${m.occurrences.length > 1 ? ` +${m.occurrences.length - 1} more` : ""})`);
  }
  for (const name of report.unused) {
    lines.push(`  UNUSED   ${name}  (declared, never read)`);
  }
  return { status, lines };
}

export async function run(
  argv,
  {
    readFile = (p) => fs.readFile(p, "utf8"),
    stat = (p) => fs.stat(p),
    readdir = (p) => fs.readdir(p, { withFileTypes: true }),
  } = {},
) {
  const args = parseArgs(argv);
  const deps = { readdir, stat };

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check --example <.env.example> <dir-or-file> [<dir-or-file> ...] [--json] [--strict]",
        "",
        "Diffs the variable names declared in the example file against the",
        "environment-variable reads found in the given source files/directories",
        "(process.env.X / os.getenv / os.environ / ENV[] / System.getenv). No",
        "network call -- reads only the local files named or discovered by walking",
        "a named directory (node_modules, .git, dist, build, and similar are",
        "skipped). Exit 1 if any variable is read in code but missing from the",
        "example file (or, with --strict, also if any is declared but never read).",
      ].join("\n"),
    };
  }

  if (args.sub !== "check") {
    return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  }
  if (args.positional.length === 0) {
    return { exitCode: 2, output: "Usage: node cli.mjs check --example <.env.example> <dir-or-file> [<dir-or-file> ...]" };
  }

  let exampleText;
  try {
    exampleText = await readFile(args.example);
  } catch (err) {
    return { exitCode: 2, output: `Cannot read example file ${args.example}: ${err.message}` };
  }

  let sourceFiles;
  try {
    sourceFiles = await resolveTargets(args.positional, deps);
  } catch (err) {
    return { exitCode: 2, output: err.message };
  }

  const scanned = [];
  for (const file of sourceFiles) {
    let text;
    try {
      text = await readFile(file);
    } catch {
      continue; // unreadable file (permissions, symlink race): skip rather than fail the whole run
    }
    scanned.push(scanSource(text, file));
  }

  const declared = parseExampleFile(exampleText);
  const referenced = mergeReferenced(scanned);
  const report = diffEnv({ declared, referenced });

  const exitCode = report.missing.length > 0 || (args.strict && report.unused.length > 0) ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify({ example: args.example, filesScanned: sourceFiles.length, ...report }, null, 2) };
  }

  const { lines } = renderReport(report);
  lines.unshift(`${args.example}: scanned ${sourceFiles.length} source file(s)`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
