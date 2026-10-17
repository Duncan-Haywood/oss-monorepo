#!/usr/bin/env node
// Zero-dependency CLI: read the Node.js version declarations in a repo
// (package.json engines.node / volta.node, .nvmrc, .node-version,
// .tool-versions, Dockerfile FROM node:, GitHub Actions setup-node) and report
// drift between them. No network call, ever -- files already on disk only.
//
//   node cli.mjs                    # scan the current directory
//   node cli.mjs /path/to/repo
//   node cli.mjs --format json
//   node cli.mjs --fail-on-risk     # exit 2 if any risk finding exists
//   node cli.mjs --today 2026-10-11 # evaluate end-of-life as of that date

import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { analyze, hasRisk, summarize, describeFinding, TABLE_DATE } from "./engine.mjs";

const SKIP_DIRS = new Set([".git", "node_modules"]);
const INTERESTING = (rel, name) =>
  name === "package.json" ||
  name === ".nvmrc" ||
  name === ".node-version" ||
  name === ".tool-versions" ||
  name === "Dockerfile" ||
  name.startsWith("Dockerfile.") ||
  name.toLowerCase().endsWith(".dockerfile") ||
  /^\.github\/workflows\/[^/]+\.ya?ml$/.test(rel);

/** Relative (posix) paths of every file the engine can read under `root`. */
async function discoverFiles(root) {
  const results = [];
  async function walk(dir, relDir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else if (entry.isFile() && INTERESTING(rel, entry.name)) results.push(rel);
    }
  }
  try {
    if (!(await stat(root)).isDirectory()) return [];
  } catch {
    return [];
  }
  await walk(root, "");
  return results.sort();
}

function parseArgs(argv) {
  const args = { format: "text", failOnRisk: false, path: ".", today: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--format") args.format = argv[++i];
    else if (a === "--today") args.today = argv[++i];
    else if (a === "--fail-on-risk") args.failOnRisk = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!a.startsWith("-")) args.path = a;
    else args.unknown = a;
  }
  return args;
}

const HELP = [
  "Usage: node cli.mjs [path] [--format text|json] [--fail-on-risk] [--today YYYY-MM-DD]",
  "",
  "Reads every Node.js version declaration under [path] (default: .):",
  "package.json engines.node and volta.node, .nvmrc, .node-version,",
  ".tool-versions, Dockerfile FROM node:<tag>, and GitHub Actions",
  "actions/setup-node node-version (scalar, matrix, node-version-file).",
  "",
  "  pin-violates-engines   a pinned version no version of which satisfies engines.node",
  "  major-disagreement     pins in different files name different Node.js majors",
  "  eol-node               a pinned major is past end-of-life (table dated " + TABLE_DATE + ")",
  "  engines-unbounded      engines.node has no upper bound and nothing is pinned",
  "",
  "Aliases such as lts/* or latest are reported as notices, never guessed.",
  "--today overrides the date end-of-life is judged against (for tests).",
  "",
  "Exit status: 0 normally (even with findings, unless --fail-on-risk),",
  "2 if --fail-on-risk was given and a risk finding exists, or on a usage error.",
].join("\n");

export async function run(argv, { readFile = (p) => readFileSync(p, "utf8"), discover = discoverFiles } = {}) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: HELP };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}\n\n${HELP}` };
  if (args.format !== "text" && args.format !== "json") return { exitCode: 2, output: `--format must be text or json, got ${args.format}` };
  if (args.today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(args.today)) return { exitCode: 2, output: "--today must look like 2026-10-11" };

  const rels = await discover(args.path);
  const files = [];
  for (const rel of rels) {
    try {
      files.push({ path: rel, text: readFile(path.join(args.path, rel)) });
    } catch (err) {
      return { exitCode: 2, output: `Error reading ${rel}: ${err.message}` };
    }
  }

  const report = analyze(files, args.today ? { today: args.today } : {});
  const exitCode = args.failOnRisk && hasRisk(report) ? 2 : 0;
  if (args.format === "json") return { exitCode, output: JSON.stringify(report, null, 2) };

  if (files.length === 0) return { exitCode, output: `No package.json, .nvmrc, .node-version, .tool-versions, Dockerfile or workflow found under ${args.path}` };
  const lines = report.findings.map(describeFinding);
  if (lines.length) lines.push("");
  lines.push(`Read ${files.length} file(s). ${summarize(report)}`);
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
