#!/usr/bin/env node
// .gitattributes Explainer CLI. Reads the attribute files, line-ending
// settings and file list of the git repository you run it in, and prints
// lines git ignores, folder patterns that never reach a file, LFS lines
// without -text, typos, and (with --why) every attribute of one path and
// the line that set it. No network, no dependencies.
//
//   node cli/check.mjs                 report for the current repository
//   node cli/check.mjs --why <path>    every attribute of one path, and why
//   node cli/check.mjs --verify        compare every answer with git check-attr
//   node cli/check.mjs --json          the full report as JSON
//   node cli/check.mjs --bundle        the inputs, to paste into the web page
//   node cli/check.mjs --strict        exit 1 if a high-severity finding exists
//   node cli/check.mjs --max 50000     cap on paths read (default 50000)
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { analyze, why, compile, resolvePath, showValue, gitModeFor, GIT_MODES } from "../gitattributes.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

function git(argv, cwd) {
  return execFileSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function config(root, key) {
  const r = spawnSync("git", ["config", "--get", key], { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function collect(cwd = process.cwd(), max = 50000) {
  const root = git(["rev-parse", "--show-toplevel"], cwd).trim();
  const split = (s) => s.split("\0").filter(Boolean);
  let list = [...new Set([...split(git(["ls-files", "-z"], root)), ...split(git(["ls-files", "-z", "--others", "--exclude-standard"], root))])];
  let truncated = false;
  if (list.length > max) { list = list.slice(0, max); truncated = true; }
  const attrFiles = list.filter((p) => p === ".gitattributes" || p.endsWith("/.gitattributes")).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const parts = [];
  const read = (p) => readFileSync(p, "utf8").replace(/\n$/, "");
  const globalFile = (() => {
    const set = config(root, "core.attributesFile");
    if (set) return set.replace(/^~(?=\/)/, homedir());
    const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(xdg, "git", "attributes");
  })();
  if (existsSync(globalFile)) parts.push(`==> core.attributesFile <==\n${read(globalFile)}`);
  for (const p of attrFiles) if (existsSync(join(root, p))) parts.push(`==> ${p} <==\n${read(join(root, p))}`);
  const gitDir = git(["rev-parse", "--git-dir"], root).trim();
  const info = join(isAbsolute(gitDir) ? gitDir : join(root, gitDir), "info", "attributes");
  if (existsSync(info)) parts.push(`==> .git/info/attributes <==\n${read(info)}`);
  const mode = gitModeFor(execFileSync("git", ["--version"], { encoding: "utf8" }));
  const autocrlf = (config(root, "core.autocrlf") || "false").toLowerCase();
  const settings = {
    autocrlf: autocrlf === "true" || autocrlf === "input" ? autocrlf : "false",
    eol: ["lf", "crlf"].includes((config(root, "core.eol") || "").toLowerCase()) ? config(root, "core.eol").toLowerCase() : "native",
    platform: process.platform === "win32" ? "windows" : "unix",
  };
  return { root, sources: parts.join("\n"), paths: list.join("\n"), pathList: list, truncated, git: mode, settings };
}

// Ask git itself for every path and list where the engine disagrees.
export function verify(input) {
  const files = compile(input.sources, { git: input.git });
  const res = spawnSync("git", ["-c", "core.quotePath=false", "check-attr", "-a", "--stdin", "-z"], { cwd: input.root, input: input.pathList.join("\0") + "\0", encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(res.stderr);
  const gitSays = new Map(input.pathList.map((p) => [p, []]));
  const f = res.stdout.split("\0");
  for (let i = 0; i + 2 < f.length; i += 3) gitSays.get(f[i])?.push(`${f[i + 1]}: ${f[i + 2]}`);
  const diffs = [];
  for (const p of input.pathList) {
    const { attrs } = resolvePath(files, p, false);
    const ours = [...attrs].filter(([, d]) => d.value !== null).map(([n, d]) => `${n}: ${showValue(d.value)}`).sort();
    const theirs = gitSays.get(p).sort();
    if (ours.join("\n") !== theirs.join("\n")) diffs.push({ path: p, engine: ours, git: theirs });
  }
  return { checked: input.pathList.length, diffs };
}

function text(report) {
  const out = [];
  const t = report.totals;
  out.push(`${t.rules} lines in ${report.files.length} attribute file(s), ${t.dropped} ignored by git; ${t.files} files. Matching as git ${GIT_MODES[report.git]}.`);
  out.push(`Line endings (core.autocrlf=${report.settings.autocrlf}, core.eol=${report.settings.eol}): ${t.eol.text} always text, ${t.eol.auto} text if git sees text, ${t.eol.binary} not text, ${t.eol.config} left as committed.`);
  if (!report.findings.length) out.push("No findings.");
  for (const f of report.findings) {
    out.push("", `[${f.severity}] ${f.source}:${f.line}  ${f.title.replace(/`/g, "")}`);
    out.push(`  ${f.text}`);
    out.push(`  ${f.detail.replace(/`/g, "")}`);
    if (f.paths) for (const p of f.paths.slice(0, 8)) out.push(`    ${p}`);
  }
  return out.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (flag("--help") || flag("-h")) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 15).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    console.log("\nNo warranty: free and as-is. Not legal or professional advice; check results with git check-attr before relying on them.");
    process.exit(0);
  }
  let input;
  try {
    input = collect(process.cwd(), Number(value("--max", 50000)));
  } catch {
    console.error("Not inside a git repository (or git is not installed).");
    process.exit(2);
  }
  if (input.truncated) console.error(`Note: read only the first ${value("--max", 50000)} paths (--max to change).`);
  if (flag("--bundle")) {
    console.log(JSON.stringify({ sources: input.sources, paths: input.paths, git: input.git, settings: input.settings }, null, 2));
  } else if (flag("--verify")) {
    const v = verify(input);
    for (const d of v.diffs.slice(0, 20)) console.log(`${d.path}\n  engine: ${d.engine.join(", ") || "(none)"}\n  git:    ${d.git.join(", ") || "(none)"}`);
    console.log(`${v.checked} paths checked against git check-attr: ${v.diffs.length} disagreement(s).`);
    if (v.diffs.length) process.exit(1);
  } else if (flag("--why")) {
    const res = why({ sources: input.sources, path: value("--why", ""), git: input.git, settings: input.settings });
    for (const s of res.steps) {
      console.log(`${s.rule.source}:${s.rule.line}  ${s.rule.text}`);
      for (const t of s.tokens) console.log(`  ${t.name}=${showValue(t.value)}${t.via.length ? ` (via ${t.via.join(" > ")})` : ""}: ${t.decided ? "decides" : `already decided by ${t.by.source}:${t.by.line}`}`);
    }
    if (!res.steps.length) console.log("No line matches this path.");
    console.log("\nResult:");
    for (const a of res.attrs) console.log(`  ${a.name}: ${a.shown}  (${a.rule.source}:${a.rule.line}${a.via.length ? `, via ${a.via.join(" > ")}` : ""})`);
    if (res.eol) console.log(`Line endings: ${res.eol.summary}`);
  } else {
    const report = analyze({ sources: input.sources, paths: input.pathList, git: input.git, settings: input.settings });
    console.log(flag("--json") ? JSON.stringify(report, null, 2) : text(report));
    if (flag("--strict") && report.findings.some((f) => f.severity === "high")) process.exit(1);
  }
}
