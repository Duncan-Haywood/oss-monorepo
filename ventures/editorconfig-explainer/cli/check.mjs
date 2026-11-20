#!/usr/bin/env node
// EditorConfig Explainer CLI. Reads every .editorconfig in the repository
// you run it in, resolves the settings for each file git lists, and prints
// the findings: values editors disagree on, a root = true that does
// nothing, sections that match no file, typos and invalid values.
// No network, no dependencies.
//
//   node cli/check.mjs                 report for the current repository
//   node cli/check.mjs --why <path>    which sections set what for one file
//   node cli/check.mjs --json          the full report as JSON
//   node cli/check.mjs --bundle        the inputs, to paste into the web page
//   node cli/check.mjs --strict        exit 1 if a high-severity finding exists
//   node cli/check.mjs --max 50000     cap on paths read (default 50000)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, why } from "../editorconfig.mjs";

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
  let paths = [...split(git(["ls-files", "-z"], root)), ...split(git(["ls-files", "-z", "--others", "--exclude-standard"], root))];
  let truncated = false;
  if (paths.length > max) { paths = paths.slice(0, max); truncated = true; }
  const configs = paths.filter((p) => p === ".editorconfig" || p.endsWith("/.editorconfig")).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const sources = configs.map((p) => `==> ${p} <==\n${readFileSync(join(root, p), "utf8")}`).join("\n");
  return { root, sources, configs, paths: paths.filter((p) => !configs.includes(p)), truncated };
}

function text(report) {
  const out = [];
  const t = report.totals;
  out.push(`${t.files} .editorconfig file(s), ${t.sections} section(s); ${t.paths} files, ${t.withSettings} with settings, ${t.noSettings} with none.`);
  if (!report.findings.length) out.push("No findings.");
  for (const f of report.findings) {
    out.push("", `[${f.severity}] ${f.file}:${f.line}  ${f.title.replace(/`/g, "")}`);
    out.push(`  ${f.detail.replace(/`/g, "")}`);
    if (f.paths) for (const p of f.paths.slice(0, 8)) out.push(`    ${p}`);
    if (f.paths && f.paths.length > 8) out.push(`    ... and ${f.paths.length - 8} more`);
  }
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let input;
  try {
    input = collect(process.cwd(), Number(value("--max", 50000)));
  } catch {
    console.error("Not inside a git repository (or git is not installed).");
    process.exit(2);
  }
  if (!input.configs.length) {
    console.log("No .editorconfig in this repository.");
    process.exit(0);
  }
  if (input.truncated) console.error(`Note: read only the first ${value("--max", 50000)} paths (--max to change).`);
  if (flag("--bundle")) {
    console.log(JSON.stringify({ sources: input.sources, paths: input.paths.join("\n") }, null, 2));
  } else if (flag("--why")) {
    const res = why({ sources: input.sources, path: value("--why", "") });
    for (const s of res.steps) {
      console.log(`${s.file}${s.note ? `  (${s.note})` : ""}`);
      for (const sec of s.sections) console.log(`  ${sec.matches ? "matches " : "no match"}  [${sec.name}] line ${sec.line}${sec.matches && sec.pairs.length ? ": " + sec.pairs.join(", ") : ""}`);
    }
    console.log("\nresult:");
    for (const [k, v] of Object.entries(res.core || {})) console.log(`  ${k}=${v}${res.derived && res.derived[k] ? `   (from ${res.derived[k]})` : ""}`);
  } else {
    const report = analyze({ sources: input.sources, paths: input.paths });
    console.log(flag("--json") ? JSON.stringify(report, null, 2) : text(report));
    if (flag("--strict") && report.findings.some((f) => f.severity === "high")) process.exit(1);
  }
}
