#!/usr/bin/env node
// Zero-dependency CLI: check your dependencies' licenses against how you ship.
// No network call -- `scan` reads only package.json files already on disk and
// `check` reads only the file you name.
//
//   node cli.mjs scan --out deps.json                       # from ./node_modules
//   node cli.mjs check deps.json --project proprietary-distributed
//   node cli.mjs check deps.json --project gpl-3.0-or-later --json
//   node cli.mjs check deps.csv --project saas --modified --allow left-pad
//   node cli.mjs notices deps.json                          # THIRD_PARTY_NOTICES text
//
// Exit 0 = clear, 1 = conflicts (or reviews with --strict), 2 = bad input.

import fs from "node:fs/promises";
import path from "node:path";
import { parseSnapshot, checkCompatibility, summarize, noticesText } from "./engine.mjs";

function parseArgs(argv) {
  const args = { dir: "node_modules", json: false, strict: false, modified: false, linking: "bundled", allow: [], positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--project") args.project = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--modified") args.modified = true;
    else if (a === "--linking") args.linking = argv[++i];
    else if (a === "--allow") args.allow = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

async function readPackageJson(pkgDir) {
  try {
    const text = await fs.readFile(path.join(pkgDir, "package.json"), "utf8");
    const data = JSON.parse(text);
    let license = data.license;
    if (!license && Array.isArray(data.licenses)) {
      license = data.licenses.map((l) => (l && (l.type || l.name)) || l).filter(Boolean).join(" OR ");
    }
    if (license && typeof license === "object") license = license.type || license.name || "";
    if (!data.name) return null;
    return { name: data.name, version: data.version || "", license: license ? String(license) : "UNKNOWN" };
  } catch {
    return null;
  }
}

/**
 * Scans one level of `dir` (plus one level into `@scope` directories) for
 * installed packages' own declared `license` field. Documented scope limit:
 * this reads the flat, top-level `node_modules` layout npm produces for
 * direct and hoisted dependencies -- a package that only exists nested,
 * pinned to a different version than the hoisted copy, is not captured
 * separately. Run it right after `npm ci` for the most complete picture.
 */
export async function buildSnapshot(dir) {
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`cannot read ${dir}: ${err.message}`);
  }
  const entries = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
    if (dirent.name.startsWith("@")) {
      const scopeDir = path.join(dir, dirent.name);
      let scoped;
      try {
        scoped = await fs.readdir(scopeDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const s of scoped) {
        if (!s.isDirectory()) continue;
        const pkg = await readPackageJson(path.join(scopeDir, s.name));
        if (pkg) entries.push(pkg);
      }
      continue;
    }
    const pkg = await readPackageJson(path.join(dir, dirent.name));
    if (pkg) entries.push(pkg);
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function renderHuman(report) {
  const lines = [summarize(report).text];
  for (const r of report.results.filter((x) => x.verdict !== "ok")) {
    lines.push("", `  ${r.verdict.toUpperCase().padEnd(8)} ${r.name}${r.version ? `@${r.version}` : ""}  ${r.license}`, `           ${r.reason}`);
    if (r.fix) lines.push(`           Fix: ${r.fix}`);
  }
  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), scan = buildSnapshot, writeFile = fs.writeFile } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs scan [--dir node_modules] [--out deps.json]",
        "  node cli.mjs check <deps.json|deps.csv> --project <proprietary-distributed|saas|internal|mit|apache-2.0|gpl-3.0-or-later|...>",
        "        [--linking dynamic] [--modified] [--allow name1,name2] [--strict] [--json]",
        "  node cli.mjs notices <deps.json|deps.csv>",
      ].join("\n"),
    };
  }
  if (args.sub === "scan") {
    let entries;
    try { entries = await scan(args.dir); } catch (err) { return { exitCode: 2, output: `Error: ${err.message}` }; }
    const json = JSON.stringify(entries, null, 2);
    if (args.out) {
      await writeFile(args.out, json + "\n", "utf8");
      return { exitCode: 0, output: `Wrote ${entries.length} package(s) to ${args.out}` };
    }
    return { exitCode: 0, output: json };
  }
  if (args.sub === "check" || args.sub === "notices") {
    const [file] = args.positional;
    if (!file) return { exitCode: 2, output: `Usage: node cli.mjs ${args.sub} <deps file>` };
    let entries;
    try { entries = parseSnapshot(await readFile(file)); } catch (err) { return { exitCode: 2, output: `Error: ${err.message}` }; }
    if (args.sub === "notices") return { exitCode: 0, output: noticesText(entries) };
    if (!args.project) return { exitCode: 2, output: "Error: --project is required (how do you ship? e.g. proprietary-distributed, saas, internal, mit, gpl-3.0-or-later)" };
    if (!["bundled", "dynamic"].includes(args.linking)) return { exitCode: 2, output: "Error: --linking must be bundled or dynamic" };
    let report;
    try { report = checkCompatibility(entries, args.project, { linking: args.linking, modified: args.modified, allow: args.allow }); } catch (err) { return { exitCode: 2, output: `Error: ${err.message}` }; }
    const bad = report.counts.conflict > 0 || (args.strict && report.counts.review > 0);
    return { exitCode: bad ? 1 : 0, output: args.json ? JSON.stringify(report, null, 2) : renderHuman(report) };
  }
  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
