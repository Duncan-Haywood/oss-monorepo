#!/usr/bin/env node
// Zero-dependency CLI: check whether one or more local HTML files carry an
// affiliate/sponsored-content disclosure before their first recognised
// affiliate link. No network call -- reads only the local files/directories
// named on the command line (e.g. a built static blog's output directory).
//
//   node cli.mjs check post.html
//   node cli.mjs check dist                       # walk a whole build output dir
//   node cli.mjs check dist --json
//   node cli.mjs check dist --strict               # also fail on a missing Amazon-required phrase

import fs from "node:fs/promises";
import path from "node:path";
import { checkDisclosure, summarize } from "./engine.mjs";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "vendor"]);

function parseArgs(argv) {
  const args = { json: false, strict: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

/** Recursively lists .html/.htm files under `root`, skipping IGNORE_DIRS and dotdirs. */
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
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

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

function isFailure(report, strict) {
  if (report.status === "missing-disclosure" || report.status === "disclosure-too-late") return true;
  if (strict && report.missingAmazonRequiredPhrase) return true;
  return false;
}

function renderReport(file, report) {
  const { text } = summarize(report);
  const lines = [`${file}: ${text}`];
  for (const link of report.affiliateLinks) {
    lines.push(`  LINK  ${link.href}  (${link.reason})`);
  }
  for (const d of report.disclosures) {
    lines.push(`  FOUND "${d.phrase}"  (${d.kind}, at char ${d.position})`);
  }
  return lines;
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stat = (p) => fs.stat(p), readdir = (p) => fs.readdir(p, { withFileTypes: true }) } = {}) {
  const args = parseArgs(argv);
  const deps = { stat, readdir };

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check <file-or-dir> [<file-or-dir> ...] [--json] [--strict]",
        "",
        "Scans HTML for recognised affiliate-link signals (Amazon Associates tag=",
        "links, amzn.to, rel=\"sponsored\", known affiliate-network tracking domains,",
        "and generic affiliate tracking parameters) and reports whether a disclosure",
        "phrase appears before the first one found. No network call -- reads only",
        "the local files/directories named. Exit 1 if any file is missing a",
        "disclosure or discloses only after the first affiliate link (or, with",
        "--strict, also if an Amazon link lacks Amazon's own required exact phrase).",
      ].join("\n"),
    };
  }

  if (args.sub !== "check") {
    return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  }
  if (args.positional.length === 0) {
    return { exitCode: 2, output: "Usage: node cli.mjs check <file-or-dir> [<file-or-dir> ...]" };
  }

  let files;
  try {
    files = await resolveTargets(args.positional, deps);
  } catch (err) {
    return { exitCode: 2, output: err.message };
  }

  const results = [];
  for (const file of files) {
    let html;
    try {
      html = await readFile(file);
    } catch {
      continue; // unreadable file: skip rather than fail the whole run
    }
    results.push({ file, report: checkDisclosure(html) });
  }

  const exitCode = results.some(({ report }) => isFailure(report, args.strict)) ? 1 : 0;

  if (args.json) {
    return { exitCode, output: JSON.stringify(results, null, 2) };
  }

  const lines = [`Scanned ${results.length} file(s)`];
  for (const { file, report } of results) lines.push(...renderReport(file, report));
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
