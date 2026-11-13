#!/usr/bin/env node
// nginx Config Security Check, CLI. Reads nginx configuration files you name
// (or every *.conf, nginx.conf and sites-enabled/sites-available file under
// a directory), resolves their include lines against each other, and prints
// each finding with file:line, the risk and the fix.
//
//   node check.mjs                       # scan the current directory
//   node check.mjs /etc/nginx/           # a whole config tree
//   node check.mjs site.conf --format json
//   node check.mjs /etc/nginx --fail-on-risk   # exit 2 on any high or medium finding
//
// Zero dependencies. It never runs nginx and makes no network calls. A clean
// result means only that these patterns were not found.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { scanFiles, hasRisk, summaryLine } from "./scan.mjs";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".venv", "venv", "__pycache__"]);

function looksLikeConfig(file) {
  const base = path.basename(file);
  const parent = path.basename(path.dirname(file));
  if (base.endsWith(".conf") || base === "nginx.conf") return true;
  if (/^(?:sites-enabled|sites-available|snippets|conf\.d)$/.test(parent) && !base.startsWith(".")) return true;
  return false;
}

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (st.isFile() && looksLikeConfig(full)) out.push(full);
  }
}

export function main(argv) {
  const args = argv.slice();
  let format = "text";
  let failOnRisk = false;
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--format") format = args[++i];
    else if (a === "--json") format = "json";
    else if (a === "--fail-on-risk") failOnRisk = true;
    else if (a === "-h" || a === "--help") {
      process.stdout.write("usage: node check.mjs [paths...] [--format text|json] [--fail-on-risk]\n");
      return 0;
    } else targets.push(a);
  }
  if (format !== "text" && format !== "json") {
    process.stderr.write(`unknown --format ${format}\n`);
    return 1;
  }
  if (!targets.length) targets.push(".");
  const paths = [];
  for (const t of targets) {
    let st;
    try { st = statSync(t); } catch {
      process.stderr.write(`${t}: no such file or directory\n`);
      return 1;
    }
    if (st.isDirectory()) walk(t, paths);
    else paths.push(t);
  }
  const files = paths.map((p) => ({ name: p, text: readFileSync(p, "utf8") }));
  let result;
  try {
    result = scanFiles(files);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }
  const { findings, notes } = result;
  if (format === "json") {
    process.stdout.write(JSON.stringify({ files: paths, findings, notes }, null, 2) + "\n");
  } else {
    if (!files.length) process.stdout.write("No nginx configuration files found.\n");
    for (const f of findings) {
      process.stdout.write(`${f.file}:${f.line}: [${f.severity}] ${f.type}\n  ${f.detail}\n  fix: ${f.remediation}\n`);
    }
    for (const n of notes) process.stdout.write(`note: ${n}\n`);
    if (files.length) process.stdout.write(`${summaryLine(findings)} (${files.length} file${files.length === 1 ? "" : "s"} read)\n`);
  }
  return failOnRisk && hasRisk(findings) ? 2 : 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check.mjs")) {
  process.exitCode = main(process.argv.slice(2));
}
