#!/usr/bin/env node
// Zero-dependency CLI: scan a repo's JavaScript, TypeScript and Python source
// for regular expressions that can backtrack catastrophically (ReDoS).
// No network call -- reads only local files.
//
//   node cli.mjs scan src
//   node cli.mjs scan . --json
//   node cli.mjs scan src --probe              # confirm suspects by timing the real JS engine
//   node cli.mjs scan src --fail-on warn       # exit 1 on polynomial warnings too (default: exponential only)
//   node cli.mjs check '(a+)+$'                # analyse one pattern

import fs from "node:fs/promises";
import path from "node:path";
import { analyzePattern, scanSource, mergeScans, summarize, FIXES } from "./engine.mjs";

const SCAN_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", "vendor", ".next", ".venv", "venv", "target", "__pycache__"]);

function parseArgs(argv) {
  const args = { json: false, probe: false, failOn: "error", positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--probe") args.probe = true;
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--flags") args.flags = argv[++i] || "";
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-")) args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

async function walk(root, readdir, out = []) {
  let entries;
  try { entries = await readdir(root); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      await walk(full, readdir, out);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs scan <dir-or-file> [...] [--json] [--probe] [--fail-on error|warn]",
  "  node cli.mjs check <pattern> [--flags gi] [--json] [--probe]",
  "",
  "Finds regular expressions in .js/.ts/.py source that can backtrack",
  "catastrophically: nested quantifiers, overlapping alternation, adjacent",
  "overlapping repeats, and unanchored trailing repeats. A static finding is a",
  "suspect; --probe times the real JavaScript engine on a generated input to",
  "confirm it (JS patterns only; each run has a hard timeout). No network call.",
].join("\n");

async function applyProbe(findings) {
  const { probePattern, describeAttack } = await import("./probe.mjs");
  const cache = new Map();
  for (const f of findings) {
    if (f.severity === "info" || f.lang !== "js" || f.pattern === undefined) continue;
    const key = `${f.flags}/${f.pattern}`;
    if (!cache.has(key)) cache.set(key, probePattern(f.pattern, f.flags || ""));
    const r = cache.get(key);
    f.probe = r;
    if (r.status === "confirmed") f.message += ` Confirmed: ${r.kind} -- ${describeAttack(r.attack)} took ${r.timedOut ? ">" : ""}${r.ms} ms.`;
  }
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8"), stat = (p) => fs.stat(p), readdir = (p) => fs.readdir(p, { withFileTypes: true }) } = {}) {
  const args = parseArgs(argv);
  if (args.help || !args.sub) return { exitCode: args.help ? 0 : 1, output: USAGE };
  if (!["scan", "check"].includes(args.sub)) return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
  if (args.unknown) return { exitCode: 2, output: `Unknown option ${args.unknown}. Try --help.` };
  if (!["error", "warn"].includes(args.failOn)) return { exitCode: 2, output: "--fail-on takes error or warn." };

  if (args.sub === "check") {
    if (args.positional.length !== 1) return { exitCode: 2, output: "Usage: node cli.mjs check <pattern> [--flags gi]" };
    const pattern = args.positional[0];
    const { parsed, findings } = analyzePattern(pattern, args.flags || "", "js");
    const tagged = findings.map((f) => ({ ...f, pattern, flags: args.flags || "", lang: "js" }));
    if (args.probe) await applyProbe(tagged);
    const failing = tagged.some((f) => f.severity === "error" || (args.failOn === "warn" && f.severity === "warn"));
    if (args.json) return { exitCode: failing ? 1 : 0, output: JSON.stringify({ pattern, parsed, findings: tagged }, null, 2) };
    const lines = tagged.length ? tagged.map((f) => `${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.message}\n      fix: ${FIXES[f.rule] || ""}`) : ["no backtracking risk found by the static rules."];
    return { exitCode: failing ? 1 : 0, output: lines.join("\n") };
  }

  if (args.positional.length === 0) return { exitCode: 2, output: "Usage: node cli.mjs scan <dir-or-file> [...]" };
  const files = [];
  for (const target of args.positional) {
    let st;
    try { st = await stat(target); } catch (err) { return { exitCode: 2, output: `cannot read ${target}: ${err.message}` }; }
    if (st.isDirectory()) files.push(...(await walk(target, readdir)));
    else files.push(target);
  }

  const scans = [];
  for (const file of files) {
    let text;
    try { text = await readFile(file); } catch { continue; }
    scans.push(scanSource(text, file));
  }
  const merged = mergeScans(scans);
  if (args.probe) await applyProbe(merged.findings);
  const summary = summarize(merged);
  const failing = merged.findings.some((f) => f.severity === "error" || (args.failOn === "warn" && f.severity === "warn"));
  const exitCode = failing ? 1 : 0;

  if (args.json) return { exitCode, output: JSON.stringify({ filesScanned: files.length, summary, findings: merged.findings }, null, 2) };

  const lines = [`scanned ${files.length} source file(s) -- ${summary.text}`];
  for (const f of merged.findings) lines.push(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule}  ${f.file}:${f.line}  ${f.message}`);
  const rules = [...new Set(merged.findings.filter((f) => f.severity !== "info").map((f) => f.rule))];
  for (const r of rules) lines.push(`  fix (${r}): ${FIXES[r]}`);
  if (!args.probe && merged.findings.some((f) => f.severity !== "info" && f.lang === "js")) lines.push("  tip: re-run with --probe to confirm JavaScript suspects by timing the real engine.");
  return { exitCode, output: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
