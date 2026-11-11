#!/usr/bin/env node
// .gitignore Explainer CLI. Reads the ignore files and the file list of the
// git repository you run it in, and prints which rule decides each path,
// negations that cannot work, tracked files ignore rules do not affect, and
// rules that do nothing. No network, no dependencies.
//
//   node cli/check.mjs                 report for the current repository
//   node cli/check.mjs --why <path>    the steps git takes for one path
//   node cli/check.mjs --json          the full report as JSON
//   node cli/check.mjs --bundle        the inputs, to paste into the web page
//   node cli/check.mjs --strict        exit 1 if a high-severity finding exists
//   node cli/check.mjs --max 50000     cap on untracked paths read (default 50000)
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, why } from "../gitignore.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

function git(argv, cwd) {
  return execFileSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

export function collect(cwd = process.cwd(), max = 50000) {
  const root = git(["rev-parse", "--show-toplevel"], cwd).trim();
  const split = (s) => s.split("\0").filter(Boolean);
  const tracked = split(git(["ls-files", "-z"], root));
  let others = split(git(["ls-files", "-z", "--others"], root));
  let truncated = false;
  if (others.length > max) { others = others.slice(0, max); truncated = true; }
  const ignoreFiles = [...tracked, ...others].filter((p) => p === ".gitignore" || p.endsWith("/.gitignore")).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const parts = [];
  for (const p of ignoreFiles) parts.push(`==> ${p} <==\n${readFileSync(join(root, p), "utf8")}`);
  const exclude = join(git(["rev-parse", "--git-dir"], root).trim().replace(/^(?!\/)/, root + "/"), "info", "exclude");
  if (existsSync(exclude)) parts.push(`==> .git/info/exclude <==\n${readFileSync(exclude, "utf8")}`);
  return { root, sources: parts.join("\n"), tracked: tracked.join("\n"), paths: others.join("\n"), truncated };
}

function text(report) {
  const out = [];
  const t = report.totals;
  out.push(`${t.rules} rules in ${report.files.length} file(s); ${t.paths} paths, ${t.ignored} ignored, ${t.tracked} tracked.`);
  if (!report.findings.length) out.push("No findings.");
  for (const f of report.findings) {
    out.push("", `[${f.severity}] ${f.source}:${f.line}  ${f.title.replace(/`/g, "")}`);
    out.push(`  ${f.detail.replace(/`/g, "")}`);
    if (f.paths) for (const p of f.paths.slice(0, 8)) out.push(`    ${p}`);
    if (f.paths && f.paths.length > 8) out.push(`    ... and ${f.paths.length - 8} more`);
  }
  if (report.fix) {
    out.push("", "Suggested fix (checked against your file list):");
    for (const p of report.fix.patches) {
      out.push(`  append to ${p.file}:`);
      for (const l of p.lines) out.push(`    ${l}`);
    }
    out.push(`  re-includes ${report.fix.fixed.length} path(s); ${report.fix.unfixed.length} still ignored; changes ${report.fix.sideEffects.length} other path(s).`);
    for (const s of report.fix.sideEffects.slice(0, 8)) out.push(`    ${s.path}: ${s.before ? "ignored" : "kept"} -> ${s.after ? "ignored" : "kept"}`);
  }
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let input;
  try {
    input = collect(process.cwd(), Number(value("--max", 50000)));
  } catch (e) {
    console.error("Not inside a git repository (or git is not installed).");
    process.exit(2);
  }
  if (input.truncated) console.error(`Note: read only the first ${value("--max", 50000)} untracked paths (--max to change).`);
  if (flag("--bundle")) {
    console.log(JSON.stringify({ sources: input.sources, tracked: input.tracked, paths: input.paths }, null, 2));
  } else if (flag("--why")) {
    const res = why({ sources: input.sources, path: value("--why", "") });
    for (const s of res.steps) {
      console.log(`${s.path}: ${s.ignored ? "ignored" : "not ignored"}${s.rule ? ` by ${s.rule.source}:${s.rule.line} ${s.rule.text}` : " (no rule matches)"}${s.note ? `\n  ${s.note}` : ""}`);
    }
  } else {
    const report = analyze(input);
    console.log(flag("--json") ? JSON.stringify(report, null, 2) : text(report));
    if (flag("--strict") && report.findings.some((f) => f.severity === "high")) process.exit(1);
  }
}
