#!/usr/bin/env node
// Zero-dependency CLI: checks that every literal file target named in a
// package.json "exports" map actually exists on disk, relative to the
// package.json's own directory. No network call, ever -- reads only the
// package.json file named on the command line.
//
//   node cli.mjs check                          # ./package.json
//   node cli.mjs check path/to/package.json
//   node cli.mjs check --json
//   node cli.mjs resolve my-lib/feature [--require] [--conditions=development,browser] [path/to/package.json]
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
  checkWildcards,
  exportsConfigErrors,
  normalizePath,
  diffExports,
  summarize,
} from "./engine.mjs";
import { resolveSpecifier } from "./resolve.mjs";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = { json: false, positional: [], conditions: [], require: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--require") args.require = true;
    else if (a.startsWith("--conditions=") || a.startsWith("-C=")) args.conditions.push(...a.slice(a.indexOf("=") + 1).split(",").filter(Boolean));
    else if (a === "--conditions" || a === "-C") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) args.missingValue = a;
      else {
        i++;
        args.conditions.push(...value.split(",").filter(Boolean));
      }
    }
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

function renderReport(report, { wildcards, invalid, configErrors }) {
  const unmatched = wildcards.filter((w) => w.reached.length === 0);
  const { status, text } = summarize(report, {
    wildcardCount: wildcards.length,
    invalidCount: invalid.length,
    unmatchedWildcardCount: unmatched.length,
    configErrorCount: configErrors.length,
  });
  const cond = (m) => (m.condition ? ` [${m.condition}]` : "");
  const lines = [text];
  for (const e of configErrors) lines.push(`  CONFIG   ${e}`);
  for (const m of report.missing) lines.push(`  MISSING  ${m.subpath}${cond(m)}  ->  ${m.target}`);
  for (const m of invalid) lines.push(`  INVALID  ${m.subpath}${cond(m)}  ->  ${m.target}  (${m.reason})`);
  for (const w of unmatched) lines.push(`  NO FILE  ${w.subpath}${cond(w)}  ->  ${w.target}  (the pattern matches no file in the package)`);
  for (const w of wildcards.filter((x) => x.reached.length)) {
    lines.push(`  ok       ${w.subpath}${cond(w)}  ->  ${w.target}  reaches ${w.reached.length} file(s), e.g. ${w.examples[0].subpath} -> ./${w.examples[0].file}`);
  }
  return { status, lines };
}

// Lists the package's files relative to its folder, for wildcard targets.
// Skips node_modules and .git, which never ship.
async function walk(dir, readdir, prefix = "", out = new Set()) {
  let entries;
  try {
    entries = await readdir(path.join(dir, prefix));
  } catch {
    return out;
  }
  for (const d of entries) {
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    if (d.isDirectory()) {
      if (d.name !== "node_modules" && d.name !== ".git") await walk(dir, readdir, rel, out);
    } else out.add(rel);
  }
  return out;
}

function renderResolution(r, spec) {
  const lines = [];
  if (r.ok && r.external) lines.push(`${spec}  ->  another package: ${r.external}`);
  else if (r.ok) lines.push(`${spec}  ->  ${r.file}`);
  else lines.push(`${spec}  ->  ${r.code}: ${r.message}`);
  lines.push(`  conditions: ${r.conditions.join(", ")}, default`);
  for (const t of r.trace) lines.push(`  - ${t}`);
  for (const w of r.warnings) lines.push(`  warning: ${w}`);
  return lines;
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

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check [path/to/package.json] [--json]",
        "  node cli.mjs resolve <specifier> [path/to/package.json] [--require] [--conditions=a,b] [--json]",
        "",
        "resolve: which file Node picks for `import \"<specifier>\"` (the package's",
        "own name, a ./subpath, or a #import), with the keys and conditions that",
        "decided it, using Node 22's algorithm (checked against Node itself).",
        "",
        "Flattens the package.json \"exports\" map (subpaths, nested conditions,",
        "and fallback arrays) and checks that every literal file target actually",
        "exists on disk, relative to the package.json's own directory. A wildcard",
        "target (\"./features/*\": \"./src/*.js\") must reach at least one file. A",
        "target Node refuses (no leading \"./\", another package's name, a \"..\"",
        "segment) and a map mixing \".\" and condition keys are reported too. No",
        "network call. Run this after your build step and before `npm publish`.",
        "Exit 1 on any problem.",
      ].join("\n"),
    };
  }

  if (args.missingValue) {
    return { exitCode: 2, output: `${args.missingValue} needs a value, e.g. ${args.missingValue} development,browser` };
  }

  if (args.sub !== "check" && args.sub !== "resolve") {
    return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  }

  let spec;
  if (args.sub === "resolve") {
    spec = args.positional.shift();
    if (!spec) return { exitCode: 2, output: "resolve needs a specifier, e.g. node cli.mjs resolve my-lib/feature" };
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

  if (args.sub === "resolve") {
    const r = resolveSpecifier(pkg, spec, { mode: args.require ? "require" : "import", extraConditions: args.conditions });
    let exists = null;
    if (r.ok && r.file) {
      try {
        await stat(path.join(path.dirname(pkgPath), r.file));
        exists = true;
      } catch {
        exists = false;
      }
    }
    const exitCode = r.ok && exists !== false ? 0 : 1;
    if (args.json) return { exitCode, output: JSON.stringify({ specifier: spec, ...r, exists }, null, 2) };
    const lines = renderResolution(r, spec);
    if (exists === false) lines.push(`  MISSING: ${r.file} is not on disk next to ${pkgPath}`);
    return { exitCode, output: lines.join("\n") };
  }

  const entries = extractExportEntries(pkg.exports);
  const configErrors = exportsConfigErrors(pkg.exports);
  if (entries.length === 0 && configErrors.length === 0) {
    return { exitCode: 0, output: `${pkgPath}: no "exports" field (or it is empty) -- nothing to check.` };
  }

  const { literal, wildcard, invalid } = classifyExportEntries(entries);
  const baseDir = path.dirname(pkgPath);

  const targetExists = new Map();
  for (const entry of literal) {
    if (targetExists.has(entry.target)) continue;
    try {
      // A directory is not a target: Node refuses to import one
      // (ERR_UNSUPPORTED_DIR_IMPORT).
      const s = await stat(path.join(baseDir, entry.target));
      targetExists.set(entry.target, !(typeof s?.isDirectory === "function" && s.isDirectory()));
    } catch {
      targetExists.set(entry.target, false);
    }
  }
  const existsFn = (target) => targetExists.get(target) === true;

  const report = diffExports({ literal, fileExists: existsFn });
  const fileSet = wildcard.length ? new Set([...(await walk(baseDir, readdir))].map(normalizePath)) : new Set();
  const wildcards = checkWildcards(wildcard, fileSet);
  const problems = report.missing.length + invalid.length + configErrors.length + wildcards.filter((w) => w.reached.length === 0).length;
  const exitCode = problems > 0 ? 1 : 0;

  if (args.json) {
    return {
      exitCode,
      output: JSON.stringify(
        {
          packageJson: pkgPath,
          missing: report.missing,
          matched: report.matched,
          invalid,
          configErrors,
          wildcards: wildcards.map(({ reached, ...w }) => ({ ...w, reachedCount: reached.length })),
        },
        null,
        2,
      ),
    };
  }

  const { lines } = renderReport(report, { wildcards, invalid, configErrors });
  lines.unshift(`${pkgPath}: checked ${literal.length + wildcard.length + invalid.length} export target(s)`);
  return { exitCode, output: lines.join("\n") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
