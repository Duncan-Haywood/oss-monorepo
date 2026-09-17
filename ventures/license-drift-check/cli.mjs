#!/usr/bin/env node
// Zero-dependency CLI: capture a license snapshot from a local dependency
// tree, and diff two snapshots for a CI gate. No network call -- `snapshot`
// reads only `package.json` files already on disk (the packages are already
// installed by the time this runs), and `diff` reads only the two files you
// name.
//
//   node cli.mjs snapshot                              # scan ./node_modules, print JSON
//   node cli.mjs snapshot --dir node_modules --out baseline.json
//   node cli.mjs diff baseline.json current.json       # human-readable
//   node cli.mjs diff baseline.json current.json --json
//   node cli.mjs diff baseline.json current.json --ignore left-pad,is-odd

import fs from "node:fs/promises";
import path from "node:path";
import { parseSnapshot, diffSnapshots, summarizeDiff } from "./engine.mjs";

function parseArgs(argv) {
  const args = { dir: "node_modules", json: false, ignore: [], positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--ignore") args.ignore = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
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

function renderDiffHuman(result) {
  const { status, text } = summarizeDiff(result);
  const lines = [text];
  if (result.changed.length) {
    lines.push("");
    for (const c of result.changed) {
      lines.push(
        `  CHANGED  ${c.name}  ${c.beforeLicense} (${c.beforeFamily}) → ${c.afterLicense} (${c.afterFamily})  [${c.beforeVersion || "?"} → ${c.afterVersion || "?"}]`,
      );
    }
  }
  if (result.ignoredChanges.length) {
    lines.push("");
    for (const c of result.ignoredChanges) {
      lines.push(`  ignored  ${c.name}  ${c.beforeLicense} → ${c.afterLicense} (--ignore)`);
    }
  }
  return { status, lines };
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), scan = buildSnapshot, writeFile = fs.writeFile } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs snapshot [--dir node_modules] [--out baseline.json]",
        "  node cli.mjs diff <baseline.json> <current.json> [--json] [--ignore name1,name2]",
      ].join("\n"),
    };
  }

  if (args.sub === "snapshot") {
    let entries;
    try {
      entries = await scan(args.dir);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const json = JSON.stringify(entries, null, 2);
    if (args.out) {
      await writeFile(args.out, json + "\n", "utf8");
      return { exitCode: 0, output: `Wrote ${entries.length} package(s) to ${args.out}` };
    }
    return { exitCode: 0, output: json };
  }

  if (args.sub === "diff") {
    const [baselinePath, currentPath] = args.positional;
    if (!baselinePath || !currentPath) {
      return { exitCode: 2, output: "Usage: node cli.mjs diff <baseline.json> <current.json>" };
    }
    let baselineText;
    let currentText;
    try {
      baselineText = await readFile(baselinePath);
      currentText = await readFile(currentPath);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    let baseline;
    let current;
    try {
      baseline = parseSnapshot(baselineText);
      current = parseSnapshot(currentText);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const result = diffSnapshots(baseline, current, { ignore: args.ignore });
    const exitCode = result.changed.length ? 1 : 0;

    if (args.json) {
      return { exitCode, output: JSON.stringify(result, null, 2) };
    }
    const { lines } = renderDiffHuman(result);
    return { exitCode, output: lines.join("\n") };
  }

  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
