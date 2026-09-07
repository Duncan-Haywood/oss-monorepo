#!/usr/bin/env node
// Zero-dependency CLI: snapshot which extensions are installed in VS Code
// (or a compatible fork -- Cursor, Windsurf, VSCodium), diff two snapshots
// for a CI gate, or check a snapshot against the live VS Code Marketplace.
//
//   node cli.mjs snapshot                                   # scan the default extensions dir, print JSON
//   node cli.mjs snapshot --dir ~/.cursor/extensions --out baseline.json
//   node cli.mjs diff baseline.json current.json            # human-readable
//   node cli.mjs diff baseline.json current.json --json
//   node cli.mjs diff baseline.json current.json --ignore ms-python.python
//   node cli.mjs check current.json                         # live marketplace lookup, per extension
//
// `snapshot` and `diff` read only local files -- no network call. Only
// `check` talks to the network, on your own machine, and only when you run
// it. See README.md.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseSnapshot, diffSnapshots, summarizeDiff } from "./engine.mjs";

// Default install locations across VS Code and the forks that share its
// extension format. First one that exists wins; `--dir` overrides.
export const DEFAULT_EXTENSION_DIRS = [
  ".vscode/extensions",
  ".cursor/extensions",
  ".windsurf/extensions",
  ".vscode-server/extensions",
  ".vscode-oss/extensions",
];

function parseArgs(argv) {
  const args = { json: false, ignore: [], positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--ignore") args.ignore = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--fail-on-not-found") args.failOnNotFound = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

async function firstExistingDir(candidates, { exists = (p) => fs.stat(p).then(() => true, () => false) } = {}) {
  for (const dir of candidates) {
    if (await exists(dir)) return dir;
  }
  return null;
}

async function readManifest(extDir, readFile) {
  try {
    const text = await readFile(path.join(extDir, "package.json"));
    const data = JSON.parse(text);
    if (!data.publisher || !data.name) return null;
    return {
      publisher: data.publisher,
      name: data.name,
      version: data.version || "",
      activationEvents: Array.isArray(data.activationEvents) ? data.activationEvents : [],
      extensionDependencies: Array.isArray(data.extensionDependencies) ? data.extensionDependencies : [],
      main: typeof data.main === "string" ? data.main : null,
      browser: typeof data.browser === "string" ? data.browser : null,
    };
  } catch {
    return null;
  }
}

/**
 * Scans a VS Code-style extensions directory: one subdirectory per installed
 * extension (conventionally `publisher.name-version`), each with its own
 * `package.json`. Returns the entries `engine.mjs` expects, sorted by id.
 */
export async function buildSnapshot(dir, { readdir = (d) => fs.readdir(d, { withFileTypes: true }), readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  let dirents;
  try {
    dirents = await readdir(dir);
  } catch (err) {
    throw new Error(`cannot read ${dir}: ${err.message}`);
  }
  const entries = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory || !dirent.isDirectory()) continue;
    if (dirent.name.startsWith(".")) continue;
    const manifest = await readManifest(path.join(dir, dirent.name), readFile);
    if (manifest) entries.push(manifest);
  }
  entries.sort((a, b) => `${a.publisher}.${a.name}`.localeCompare(`${b.publisher}.${b.name}`));
  return entries;
}

function renderDiffHuman(result) {
  const { status, text } = summarizeDiff(result);
  const lines = [text];
  if (result.changed.length) {
    lines.push("");
    for (const c of result.changed) {
      const label = c.surfaceChanged ? "SURFACE CHANGED" : "updated";
      const risk = c.riskTags.length ? `  [${c.riskTags.join(", ")}]` : "";
      lines.push(`  ${label}  ${c.id}  [${c.beforeVersion || "?"} → ${c.afterVersion || "?"}]${risk}`);
    }
  }
  if (result.added.length) {
    lines.push("", "New extensions since the baseline:");
    for (const a of result.added) lines.push(`  ADDED  ${a.id}  ${a.version || "?"}`);
  }
  if (result.removed.length) {
    lines.push("", "No longer installed:");
    for (const r of result.removed) lines.push(`  REMOVED  ${r.id}  ${r.version || "?"}`);
  }
  if (result.ignoredChanges.length) {
    lines.push("");
    for (const c of result.ignoredChanges) lines.push(`  ignored  ${c.id}  (--ignore)`);
  }
  return { status, lines };
}

// --- `check`: the one command that talks to the network -----------------
//
// Queries the same public VS Code Marketplace gallery endpoint the editor's
// own Extensions view uses to look up an id. No API key, no account -- but
// it is a third-party API this project does not control, undocumented for
// external use, and it can change shape or rate-limit without notice. Every
// lookup is wrapped so a bad response reports "lookup failed" for that one
// extension rather than a false claim about any other.
const MARKETPLACE_QUERY_URL = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

export async function queryMarketplace(id, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(MARKETPLACE_QUERY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json;api-version=3.0-preview.1",
    },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: id }] }], flags: 914 }),
  });
  if (!res.ok) throw new Error(`marketplace returned HTTP ${res.status}`);
  const data = await res.json();
  const ext = data?.results?.[0]?.extensions?.[0];
  if (!ext) return { found: false };
  return {
    found: true,
    latestVersion: ext.versions?.[0]?.version ?? null,
    publisherName: ext.publisher?.publisherName ?? null,
  };
}

export async function runCheck(entries, { fetchImpl = fetch } = {}) {
  const rows = [];
  for (const entry of entries) {
    let result;
    try {
      result = await queryMarketplace(entry.id, { fetchImpl });
    } catch (err) {
      rows.push({ id: entry.id, installedVersion: entry.version, lookupFailed: true, error: err.message });
      continue;
    }
    if (!result.found) {
      rows.push({ id: entry.id, installedVersion: entry.version, found: false });
      continue;
    }
    const publisherMismatch =
      result.publisherName != null && result.publisherName.toLowerCase() !== entry.publisher.toLowerCase();
    rows.push({
      id: entry.id,
      installedVersion: entry.version,
      found: true,
      latestVersion: result.latestVersion,
      publisherName: result.publisherName,
      publisherMismatch,
    });
  }
  return rows;
}

function renderCheckHuman(rows) {
  const lines = [];
  const notFound = rows.filter((r) => r.found === false);
  const mismatched = rows.filter((r) => r.publisherMismatch);
  const failed = rows.filter((r) => r.lookupFailed);
  lines.push(`${rows.length} extension(s) checked against the VS Code Marketplace.`);
  if (notFound.length) {
    lines.push("", "NOT FOUND under this exact id (removed, delisted, or never published here):");
    for (const r of notFound) lines.push(`  ${r.id}  installed=${r.installedVersion || "?"}`);
  }
  if (mismatched.length) {
    lines.push("", "Publisher on the listing differs from the local manifest:");
    for (const r of mismatched) lines.push(`  ${r.id}  manifest says a different publisher than the listing (${r.publisherName})`);
  }
  if (failed.length) {
    lines.push("", "Lookup failed (network or API issue -- not a finding):");
    for (const r of failed) lines.push(`  ${r.id}  ${r.error}`);
  }
  if (!notFound.length && !mismatched.length && !failed.length) {
    lines.push("Every extension resolved on the Marketplace under its installed publisher.");
  }
  return lines;
}

export async function run(argv, {
  readFile = (p) => fs.readFile(p, "utf8"),
  scan = buildSnapshot,
  writeFile = fs.writeFile,
  fetchImpl = fetch,
  homedir = os.homedir,
  exists,
} = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs snapshot [--dir <extensions-dir>] [--out baseline.json]",
        "  node cli.mjs diff <baseline.json> <current.json> [--json] [--ignore id1,id2]",
        "  node cli.mjs check <snapshot.json> [--json] [--fail-on-not-found]",
      ].join("\n"),
    };
  }

  if (args.sub === "snapshot") {
    let dir = args.dir;
    if (!dir) {
      const candidates = DEFAULT_EXTENSION_DIRS.map((d) => path.join(homedir(), d));
      dir = await firstExistingDir(candidates, exists ? { exists } : undefined);
      if (!dir) {
        return {
          exitCode: 2,
          output: `Error: no extensions directory found in the usual locations. Pass --dir explicitly.\nTried: ${candidates.join(", ")}`,
        };
      }
    }
    let entries;
    try {
      entries = await scan(dir);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const json = JSON.stringify(entries, null, 2);
    if (args.out) {
      await writeFile(args.out, json + "\n", "utf8");
      return { exitCode: 0, output: `Wrote ${entries.length} extension(s) from ${dir} to ${args.out}` };
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
    const surfaceChanged = result.changed.filter((c) => c.surfaceChanged).length;
    const exitCode = surfaceChanged > 0 ? 1 : 0;

    if (args.json) {
      return { exitCode, output: JSON.stringify(result, null, 2) };
    }
    const { lines } = renderDiffHuman(result);
    return { exitCode, output: lines.join("\n") };
  }

  if (args.sub === "check") {
    const [snapshotPath] = args.positional;
    if (!snapshotPath) {
      return { exitCode: 2, output: "Usage: node cli.mjs check <snapshot.json>" };
    }
    let text;
    try {
      text = await readFile(snapshotPath);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    let entries;
    try {
      entries = parseSnapshot(text);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    const rows = await runCheck(entries, { fetchImpl });
    const exitCode = args.failOnNotFound && rows.some((r) => r.found === false) ? 1 : 0;
    if (args.json) {
      return { exitCode, output: JSON.stringify(rows, null, 2) };
    }
    return { exitCode, output: renderCheckHuman(rows).join("\n") };
  }

  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
