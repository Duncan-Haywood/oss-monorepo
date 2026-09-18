#!/usr/bin/env node
// Zero-dependency CLI: scan every Dockerfile under a directory for the three
// cache-order anti-patterns engine.mjs checks. No network call, ever -- this
// reads files already on disk and does text/regex analysis only.
//
//   node cli.mjs                    # scan every Dockerfile under .
//   node cli.mjs /path/to/repo      # scan a specific checkout
//   node cli.mjs --format json
//   node cli.mjs --fail-on-risk     # exit 2 if any finding exists

import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { scanText, hasRisk, summarize, describeFinding } from "./engine.mjs";

/** Every `Dockerfile`, `Dockerfile.*`, and `*.dockerfile` under `root`,
 * skipping `.git` and `node_modules`, sorted for stable output. */
async function discoverDockerfiles(root) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const name = entry.name;
        if (name === "Dockerfile" || name.startsWith("Dockerfile.") || name.toLowerCase().endsWith(".dockerfile")) {
          results.push(full);
        }
      }
    }
  }
  try {
    if (!(await stat(root)).isDirectory()) return [];
  } catch {
    return [];
  }
  await walk(root);
  return results.sort();
}

function parseArgs(argv) {
  const args = { format: "text", failOnRisk: false, path: "." };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--format") args.format = argv[++i];
    else if (a === "--fail-on-risk") args.failOnRisk = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!a.startsWith("-")) args.path = a;
  }
  return args;
}

const HELP = [
  "Usage: node cli.mjs [path] [--format text|json] [--fail-on-risk]",
  "",
  "Scans every Dockerfile, Dockerfile.*, and *.dockerfile under [path]",
  "(default: current directory) for three documented build-cache-busting",
  "instruction-order mistakes:",
  "",
  "  manifest-copy-after-broad-copy    dependency manifest copied/installed",
  "                                    after a whole-context COPY . . already ran",
  "  install-missing-manifest-copy     install command with no isolated COPY",
  "                                    of its manifest file(s) at all",
  "  apt-update-install-split          apt-get/apt update run without install",
  "                                    or upgrade in the same RUN instruction",
  "",
  "Exit status: 0 normally (even with findings, unless --fail-on-risk),",
  "2 if --fail-on-risk was given and at least one finding exists.",
].join("\n");

export async function run(argv, { readFile = (p) => readFileSync(p, "utf8"), discover = discoverDockerfiles } = {}) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: HELP };

  const files = await discover(args.path);
  const findings = [];
  for (const file of files) {
    let text;
    try {
      text = readFile(file);
    } catch (err) {
      return { exitCode: 2, output: `Error reading ${file}: ${err.message}` };
    }
    findings.push(...scanText(text, file));
  }

  if (args.format === "json") {
    return { exitCode: args.failOnRisk && hasRisk(findings) ? 2 : 0, output: JSON.stringify(findings, null, 2) };
  }

  let output;
  if (files.length === 0) {
    output = `No Dockerfile, Dockerfile.*, or *.dockerfile found under ${args.path}`;
  } else if (findings.length === 0) {
    output = `Scanned ${files.length} Dockerfile(s). ${summarize(findings)}`;
  } else {
    const lines = findings.map((f) => `!! ${describeFinding(f)}`);
    lines.push("", `Scanned ${files.length} Dockerfile(s). ${summarize(findings)}`);
    output = lines.join("\n");
  }

  return { exitCode: args.failOnRisk && hasRisk(findings) ? 2 : 0, output };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
