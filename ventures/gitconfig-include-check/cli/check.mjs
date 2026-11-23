#!/usr/bin/env node
// gitconfig include checker, command line. Run it inside a repository:
//   node ventures/gitconfig-include-check/cli/check.mjs [--repo DIR] [--key user.email]
//        [--json] [--verify] [--strict]
// It reads the config files git would read for that repository (system,
// global, .git/config, config.worktree and everything they include), says
// which [include] and [includeIf] lines took effect and why the others did
// not, and with --verify compares every value with your own
// `git config --list --show-origin`. Zero dependencies; nothing is sent
// anywhere.
import { readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { analyze, why, reportText, normalizePath } from "../gitconfig.mjs";

export function parseArgs(argv) {
  const opts = { repo: process.cwd(), key: null, json: false, verify: false, strict: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") opts.repo = argv[++i];
    else if (a === "--key") opts.key = argv[++i];
    else if (a === "--json") opts.json = true;
    else if (a === "--verify") opts.verify = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

// Walk up to the folder holding .git (a folder, or a file pointing at one).
export function findGitdir(start) {
  let dir = resolve(start);
  for (;;) {
    const dotgit = join(dir, ".git");
    if (existsSync(dotgit)) {
      if (statSync(dotgit).isDirectory()) return { top: dir, gitdir: dotgit };
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotgit, "utf8"));
      if (m) return { top: dir, gitdir: resolve(dir, m[1].trim()) };
    }
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function branchOf(gitdir) {
  try {
    const head = readFileSync(join(gitdir, "HEAD"), "utf8").trim();
    const m = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : null;
  } catch { return null; }
}

export function collect({ repo, env = process.env }) {
  const home = env.HOME || homedir();
  const found = findGitdir(repo);
  const xdg = env.XDG_CONFIG_HOME || join(home, ".config");
  const input = { home, xdgConfigHome: xdg, files: [] };
  if (found) {
    input.gitdir = found.gitdir;
    try { input.realGitdir = realpathSync(found.gitdir); } catch { /* keep the typed path */ }
    input.branch = branchOf(found.gitdir);
  }
  const seen = new Set();
  const load = (p) => {
    const key = normalizePath(p);
    if (seen.has(key)) return false;
    seen.add(key);
    try {
      if (!statSync(p).isFile()) return false;
      input.files.push({ path: key, text: readFileSync(p, "utf8") });
      return true;
    } catch { return false; }
  };
  if (!env.GIT_CONFIG_NOSYSTEM) load("/etc/gitconfig");
  load(join(xdg, "git/config"));
  load(join(home, ".gitconfig"));
  if (found) {
    let common = found.gitdir;
    try { common = resolve(found.gitdir, readFileSync(join(found.gitdir, "commondir"), "utf8").trim()); input.commondir = common; } catch { /* not a linked worktree */ }
    load(join(common, "config"));
    load(join(found.gitdir, "config.worktree"));
  }
  // follow include targets until nothing new turns up; conditions that are
  // false still name files worth showing as "not read"
  for (let round = 0; round < 50; round++) {
    const r = analyze(input);
    let added = false;
    for (const d of r.directives) if (d.target && !d.found && load(d.target)) added = true;
    if (!added) return { input, result: r, found };
  }
  return { input, result: analyze(input), found };
}

export function verify(result, top, env = process.env) {
  const res = spawnSync("git", ["config", "--list", "--show-origin", "--show-scope"], { cwd: top, env, encoding: "utf8" });
  if (res.error) return { ok: null, note: "git is not installed" };
  if (res.status !== 0) return { ok: Boolean(result.fatal), note: `git: ${res.stderr.trim()}` };
  const theirs = res.stdout.split("\n").filter(Boolean).filter((l) => !l.startsWith("command\t")).map((l) => {
    const [scope, origin, ...kv] = l.split("\t");
    let file = origin.replace(/^file:/, "");
    if (!file.startsWith("/")) file = join(top, file);
    return `${scope}\t${normalizePath(file)}\t${kv.join("\t")}`;
  });
  const ours = result.entries.map((e) => `${e.scope}\t${normalizePath(e.file)}\t${e.key}${e.value === null ? "" : "=" + e.value}`);
  const diff = [];
  for (let i = 0; i < Math.max(ours.length, theirs.length); i++) if (ours[i] !== theirs[i]) diff.push({ line: i + 1, ours: ours[i] ?? null, git: theirs[i] ?? null });
  return { ok: diff.length === 0, diff: diff.slice(0, 20), compared: theirs.length };
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (opts.help) {
    console.log("usage: check.mjs [--repo DIR] [--key user.email] [--json] [--verify] [--strict]");
    return;
  }
  const { input, result, found } = collect({ repo: opts.repo });
  const out = { ...result };
  if (opts.key) out.why = why({ ...input, key: opts.key });
  if (opts.verify) out.verify = found ? verify(result, process.cwd() === resolve(opts.repo) ? process.cwd() : resolve(opts.repo)) : { ok: null, note: "not inside a repository" };
  if (opts.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(reportText(result));
    if (out.why) {
      console.log(`\n${out.why.key}, every value in git's reading order (the last one wins):`);
      for (const v of out.why.values) console.log(`  ${v === out.why.winner ? "->" : "  "} ${v.value}   ${v.file}:${v.line}${v.via.length ? " via " + v.via.join(" > ") : ""}`);
      if (!out.why.values.length) console.log("  (not set)");
    }
    if (out.verify) console.log(`\n--verify: ${out.verify.ok === true ? `matches git (${out.verify.compared} values)` : out.verify.ok === false ? "DIFFERS from git: " + JSON.stringify(out.verify.diff ?? out.verify.note, null, 1) : out.verify.note}`);
  }
  if (opts.strict && result.findings.some((f) => f.severity === "high" || f.severity === "error")) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check.mjs")) main();
