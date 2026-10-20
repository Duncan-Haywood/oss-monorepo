#!/usr/bin/env node
// Zero-dependency CLI: checks that every literal file target named in a
// package.json "exports" map actually exists on disk, relative to the
// package.json's own directory. No network call, ever -- reads only the
// package.json file named on the command line.
//
//   node cli.mjs check                          # ./package.json
//   node cli.mjs check path/to/package.json
//   node cli.mjs check --json
//
// Run this AFTER your build step and BEFORE `npm publish` -- it checks what
// is on disk right now, so run it before the build has produced anything and
// every export will read as missing.

import fs from "node:fs/promises";
import path from "node:path";
import {
  parsePackageJson,
  extractExportEntries,
  classifyExportEntries,
  diffExports,
  summarize,
} from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [] };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

function renderReport(report, { wildcard, external }) {
  const { status, text } = summarize(report, { wildcardCount: wildcard.length, externalCount: external.length });
  const lines = [text];
  for (const m of report.missing) {
    const cond = m.condition ? ` [${m.condition}]` : "";
    lines.push(`  MISSING  ${m.subpath}${cond}  ->  ${m.target}`);
  }
  return { status, lines };
}

export async function run(
  argv,
  {
    readFile = (p) => fs.readFile(p, "utf8"),
    stat = (p) => fs.stat(p),
  } = {},
) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check [path/to/package.json] [--json]",
        "",
        "Flattens the package.json \"exports\" map (subpaths, nested conditions,",
        "and fallback arrays) and checks that every literal file target actually",
        "exists on disk, relative to the package.json's own directory. Wildcard",
        "targets (\"./features/*\") and bare-specifier re-exports of another",
        "package are listed as not checked, not as missing. No network call --",
        "reads only the named file. Run this after your build step and before",
        "`npm publish`. Exit 1 if any literal target is missing.",
      ].join("\n"),
    };
  }

  if (args.sub !== "check") {
    return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  }

  const pkgPath = args.positional[0] || "package.json";
  let pkgText;
  try {
    pkgText = await readFile(pkgPath);
  } catch (err) {
    return { exitCode: 2, output: `Cannot read ${pkgPath}: ${err.message}` };
  }

  let pkg;
  try {
    pkg = parsePackageJson(pkgText);
  } catch (err) {
    return { exitCode: 2, output: `${pkgPath}: ${err.message}` };
  }

  const entries = extractExportEntries(pkg.exports);
  if (entries.length === 0) {
    return { exitCode: 0, output: `${pkgPath}: no "exports" field (or it is empty) -- nothing to check.` };
  }

  const { literal, wildcard, external } = classifyExportEntries(entries);
  const baseDir = path.dirname(pkgPath);

  const targetExists = new Map();
  for (const entry of literal) {
    if (targetExists.has(entry.target)) continue;
    try {
      await stat(path.join(baseDir, entry.target));
      targetExists.set(entry.target, true);
    } catch {
      targetExists.set(entry.target, false);
    }
  }
  const existsFn = (target) => targetExists.get(target) === true;

  const report = diffExports({ literal, fileExists: existsFn });
  const exitCode = report.missing.length > 0 ? 1 : 0;

  if (args.json) {
    return {
      exitCode,
      output: JSON.stringify(
        {
          packageJson: pkgPath,
          missing: report.missing,
          matched: report.matched,
          wildcardSkipped: wildcard,
          externalSkipped: external,
        },
        null,
        2,
      ),
    };
  }

  const { lines } = renderReport(report, { wildcard, external });
  lines.unshift(`${pkgPath}: checked ${literal.length} export target(s)`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
