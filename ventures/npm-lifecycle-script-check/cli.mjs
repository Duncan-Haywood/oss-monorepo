#!/usr/bin/env node
// Zero-dependency CLI: capture which locally installed packages run a
// preinstall/install/postinstall/prepare script, list what a package-lock.json
// says right now, and diff two snapshots for a CI gate. No network call --
// `snapshot` reads only `package.json` files already on disk (the packages
// are already installed by the time this runs), and `lockfile`/`diff` read
// only the files you name.
//
//   node cli.mjs snapshot                                    # scan ./node_modules, print JSON
//   node cli.mjs snapshot --dir node_modules --out baseline.json
//   node cli.mjs lockfile package-lock.json                  # what runs a script right now
//   node cli.mjs lockfile package-lock.json --json
//   node cli.mjs diff baseline.json current.json             # human-readable
//   node cli.mjs diff baseline.json current.json --json
//   node cli.mjs diff baseline.json current.json --ignore node-sass,esbuild

import fs from "node:fs/promises";
import path from "node:path";
import { parseSnapshot, diffSnapshots, summarizeDiff, currentlyScripted, LIFECYCLE_SCRIPT_KEYS } from "./engine.mjs";

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
    if (!data.name) return null;
    const scripts = {};
    if (data.scripts && typeof data.scripts === "object") {
      for (const key of LIFECYCLE_SCRIPT_KEYS) {
        const value = data.scripts[key];
        if (typeof value === "string" && value.trim()) scripts[key] = value;
      }
    }
    return { name: data.name, version: data.version || "", scripts };
  } catch {
    return null;
  }
}

/**
 * Scans one level of `dir` (plus one level into `@scope` directories) for
 * installed packages' own declared lifecycle scripts. Documented scope
 * limit, same as license-drift-check's snapshot: this reads the flat,
 * top-level `node_modules` layout npm produces for direct and hoisted
 * dependencies -- a package that only exists nested, pinned to a different
 * version than the hoisted copy, is not captured separately. Run it right
 * after `npm ci` for the most complete picture.
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
      const label = c.kind === "gained" ? "GAINED SCRIPT" : c.kind === "lost" ? "lost script" : "CHANGED SCRIPT";
      const risk = c.riskTags && c.riskTags.length ? `  [${c.riskTags.join(", ")}]` : "";
      lines.push(`  ${label}  ${c.name}  [${c.beforeVersion || "?"} → ${c.afterVersion || "?"}]${risk}`);
    }
  }
  const addedWithScript = result.added.filter((a) => a.hasInstallScript);
  if (addedWithScript.length) {
    lines.push("", "New dependencies that already run an install-time script:");
    for (const a of addedWithScript) {
      const risk = a.riskTags && a.riskTags.length ? `  [${a.riskTags.join(", ")}]` : "";
      lines.push(`  ADDED  ${a.name}  ${a.version || "?"}${risk}`);
    }
  }
  if (result.ignoredChanges.length) {
    lines.push("");
    for (const c of result.ignoredChanges) {
      lines.push(`  ignored  ${c.name}  (--ignore)`);
    }
  }
  return { status, lines };
}

function renderLockfileHuman(entries) {
  const scripted = currentlyScripted(entries);
  if (!scripted.length) {
    return [`0 of ${entries.length} package(s) run a script at install time.`];
  }
  const lines = [`${scripted.length} of ${entries.length} package(s) run a script at install time:`, ""];
  for (const e of scripted) {
    const risk = e.riskTags.length ? `  [${e.riskTags.join(", ")}]` : "";
    lines.push(`  ${e.name}  ${e.version || "?"}${risk}`);
  }
  return lines;
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), scan = buildSnapshot, writeFile = fs.writeFile } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs snapshot [--dir node_modules] [--out baseline.json]",
        "  node cli.mjs lockfile <package-lock.json> [--json]",
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

  if (args.sub === "lockfile") {
    const [lockfilePath] = args.positional;
    if (!lockfilePath) {
      return { exitCode: 2, output: "Usage: node cli.mjs lockfile <package-lock.json>" };
    }
    let text;
    try {
      text = await readFile(lockfilePath);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    let entries;
    try {
      entries = parseSnapshot(text);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    if (args.json) {
      return { exitCode: 0, output: JSON.stringify(currentlyScripted(entries), null, 2) };
    }
    return { exitCode: 0, output: renderLockfileHuman(entries).join("\n") };
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
    const gainedCount = result.changed.filter((c) => c.kind === "gained").length
      + result.added.filter((a) => a.hasInstallScript).length;
    const exitCode = gainedCount > 0 ? 1 : 0;

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
