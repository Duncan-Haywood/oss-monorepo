#!/usr/bin/env node
// sudoers Check, CLI. Reads sudoers files you name (or, for a directory, its
// sudoers file and sudoers.d/ drop-ins), follows @include and @includedir the
// way sudo does, and prints each finding with file:line, the risk and the
// fix, then who can become root and how.
//
//   node check.mjs                        # ./sudoers and ./sudoers.d, or /etc if run there
//   node check.mjs /etc/                  # /etc/sudoers and /etc/sudoers.d/*
//   node check.mjs /etc/sudoers.d/90-app  # one drop-in
//   node check.mjs /etc --format json
//   node check.mjs /etc --fail-on-risk    # exit 2 on any high or medium finding
//
// Zero dependencies. It never runs sudo and makes no network calls. Reading
// /etc/sudoers needs root (it is mode 0440); a copy works as well. A clean
// result means only that these patterns were not found.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scanFiles, hasRisk, summaryLine } from "./scan.mjs";

function collect(dir, out) {
  const main = path.join(dir, "sudoers");
  try { if (statSync(main).isFile()) out.push(main); } catch { /* none */ }
  const d = path.join(dir, "sudoers.d");
  let names = [];
  try { names = readdirSync(d).sort(); } catch { /* none */ }
  for (const n of names) {
    const full = path.join(d, n);
    try { if (statSync(full).isFile()) out.push(full); } catch { /* unreadable */ }
  }
  if (!out.length && path.basename(dir) === "sudoers.d") {
    for (const n of readdirSync(dir).sort()) {
      const full = path.join(dir, n);
      try { if (statSync(full).isFile()) out.push(full); } catch { /* unreadable */ }
    }
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
    if (st.isDirectory()) collect(t, paths);
    else paths.push(t);
  }
  const files = [];
  for (const p of paths) {
    try {
      files.push({ name: p, text: readFileSync(p, "utf8") });
    } catch (err) {
      process.stderr.write(`${p}: ${err.code === "EACCES" ? "permission denied (sudoers files are mode 0440: run as root, or check a copy)" : err.message}\n`);
      return 1;
    }
  }
  const { findings, notes, rootPaths } = scanFiles(files);
  if (format === "json") {
    process.stdout.write(JSON.stringify({ files: paths, findings, rootPaths, notes }, null, 2) + "\n");
  } else {
    if (!files.length) process.stdout.write("No sudoers files found (looked for sudoers and sudoers.d/).\n");
    for (const f of findings) {
      process.stdout.write(`${f.file}:${f.line}: [${f.severity}] ${f.type}\n  ${f.detail}\n  fix: ${f.remediation}\n`);
    }
    if (rootPaths.length) {
      process.stdout.write("who can become root:\n");
      for (const r of rootPaths) process.stdout.write(`  ${r.who}: ${r.how}, ${r.password ? "with a password" : "no password"} (${r.file}:${r.line})\n`);
    }
    for (const n of notes) process.stdout.write(`note: ${n}\n`);
    if (files.length) process.stdout.write(`${summaryLine(findings)} (${files.length} file${files.length === 1 ? "" : "s"} read)\n`);
  }
  return failOnRisk && hasRisk(findings) ? 2 : 0;
}

if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || process.argv[1].endsWith("check.mjs"))) {
  process.exitCode = main(process.argv.slice(2));
}
