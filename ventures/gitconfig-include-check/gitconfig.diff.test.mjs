// Differential test: random config trees (~/.gitconfig, ~/.config/git/config,
// .git/config, included files) over random repositories, read by this engine
// and by git itself:
//   git config --list --show-origin --show-scope
// Every entry (scope, file, key, value, in order) must agree, and when git
// stops with a fatal error the engine must stop at the same file and line.
// Skipped when git is not installed. GITCONFIG_DIFF_TRIALS raises the count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { analyze, normalizePath } from "./gitconfig.mjs";

let hasGit = true;
try { execFileSync("git", ["--version"]); } catch { hasGit = false; }

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPOS = ["work/api", "work/deep/nested/r", "Work/x", "oss/lib", "other/work/r2", "api"];
const BRANCHES = ["main", "feature/x", "release-1", null];
const URLS = ["https://github.com/acme/api.git", "git@github.com:acme/api.git", "https://gitlab.example/me/x", "ssh://git@host/acme/y"];
const COND = (root) => [
  "gitdir:~/work", "gitdir:~/work/", "gitdir: ~/work/", "gitdir:~/Work/", "gitdir:work/", "gitdir:api/",
  "gitdir:~/work/api", "gitdir:~/work/api/", "gitdir:~/work/api/.git", "gitdir:~/*/api/", "gitdir:~/**/r/",
  "gitdir:./work/", `gitdir:${root}/h/work/`, "gitdir:~/work/*", "gitdir:~/oss/", "gitdir/i:~/WORK/", "gitdir/i:~/work/API/",
  "GitDir:~/work/", "gitdir:~/work/**", "gitdir:**/work/**", "gitdir:~/work\\api/", "gitdir:~",
  "onbranch:main", "onbranch:feature/", "onbranch:feat*", "onbranch:refs/heads/main", "onbranch:release-*", "onbranch:**",
  "hasconfig:remote.*.url:https://github.com/acme/**", "hasconfig:remote.*.url:git@github.com:acme/*",
  "hasconfig:remote.*.url:*", "hasconfig:remote.origin.url:x", "unknown:x",
];
const INC = ["inc/a", "inc/b", "inc/c", "inc/d"];
const PATHS = (root) => ["inc/a", "~/inc/b", "./inc/c", "../h/inc/d", `${root}/h/inc/a`, "missing", "inc/b", "inc/../inc/c", "~/inc/d"];
const VALUES = ["x", "a b", "\"q s\"", "x ; c", "x # c", "\"a;b\"", "a\\tb", "  lead", "tr  ", "\"\"", "a\\\nb", "\"x\\\"y\""];
const BAD = ["[bad", "1key = x", "k = \"open", "k = \\q", "[s \"sub\" ]", "k ; c", "[a b]", "k = x\"y\"z\""];

function block(r, root, opts) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const k = r();
  if (k < 0.3) return `[includeIf "${pick(COND(root))}"]\n\tpath = ${pick(PATHS(root))}`;
  if (k < 0.4) return `[include]\n\tpath = ${pick(PATHS(root))}`;
  if (k < 0.55) return `[user]\n\temail = ${pick(["home@x", "work@x", "oss@x"])}${r() < 0.3 ? "\n\tname = " + pick(VALUES) : ""}`;
  if (k < 0.65 && opts.remotes) return `[remote "${pick(["origin", "up"])}"]\n\turl = ${pick(URLS)}`;
  if (k < 0.72) return `[includeIf "${pick(COND(root))}"] path = ${pick(PATHS(root))}`;
  if (k < 0.97) return `[${pick(["x", "Core", "a.B", "s \"Sub\""])}]\n\t${pick(["v", "Key", "k-2"])} = ${pick(VALUES)}${r() < 0.2 ? "\n\tflag" : ""}`;
  return pick(BAD);
}

function makeFile(r, root, n, opts) {
  const parts = [];
  if (r() < 0.05) parts.push("email = orphan");
  for (let i = 0; i < n; i++) parts.push(block(r, root, opts));
  return parts.join("\n") + (r() < 0.8 ? "\n" : "");
}

const ENV = (() => {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1" };
  for (const k of Object.keys(env)) if (/^GIT_(CONFIG|DIR|WORK_TREE|CEILING|COMMON|INDEX)/.test(k) && k !== "GIT_CONFIG_NOSYSTEM") delete env[k];
  delete env.XDG_CONFIG_HOME;
  return env;
})();

function trial(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gcdiff-")));
  try {
    const home = join(root, "h");
    const env = { ...ENV, HOME: home };
    const repoRel = pick(REPOS);
    const repo = join(home, repoRel);
    mkdirSync(repo, { recursive: true });
    const branch = pick(BRANCHES);
    execFileSync("git", ["init", "-q", "-b", branch ?? "main", repo], { env });
    if (branch === null) {
      execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "x"], { env });
      execFileSync("git", ["-C", repo, "checkout", "-q", "--detach"], { env });
    }
    // sometimes run from a linked worktree elsewhere, whose git folder sits
    // inside the main repository's .git
    let runIn = repo, gitdir;
    if (r() < 0.15) {
      if (branch !== null) execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "--allow-empty", "-m", "x"], { env });
      runIn = join(home, "elsewhere/wt");
      execFileSync("git", ["-C", repo, "worktree", "add", "-q", "--detach", runIn], { env });
      gitdir = join(repo, ".git/worktrees/wt");
    }
    const files = [];
    const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); files.push({ path, text }); };
    put(join(home, ".gitconfig"), makeFile(r, root, 1 + Math.floor(r() * 6), { remotes: r() < 0.2 }));
    if (r() < 0.3) put(join(home, ".config/git/config"), makeFile(r, root, 1 + Math.floor(r() * 3), { remotes: false }));
    for (const inc of INC) if (r() < 0.75) put(join(home, inc), makeFile(r, root, Math.floor(r() * 4), { remotes: r() < 0.3 }));
    const localPath = join(repo, ".git/config");
    const local = readFileSync(localPath, "utf8") + (r() < 0.6 ? makeFile(r, root, 1 + Math.floor(r() * 2), { remotes: true }) : "");
    put(localPath, local);

    if (gitdir && r() < 0.5) {
      files[files.length - 1].text += "[extensions]\n\tworktreeConfig = true\n";
      writeFileSync(localPath, files[files.length - 1].text);
      put(join(gitdir, "config.worktree"), makeFile(r, root, 1 + Math.floor(r() * 2), { remotes: false }));
    }
    const res = spawnSync("git", ["-C", runIn, "config", "--list", "--show-origin", "--show-scope"], { env, encoding: "utf8" });
    const gitLines = res.stdout.split("\n").filter(Boolean).map((l) => {
      const [scope, origin, ...kv] = l.split("\t");
      let file = origin.replace(/^file:/, "");
      if (!file.startsWith("/")) file = join(runIn, file);
      return `${scope}\t${normalizePath(file)}\t${kv.join("\t")}`;
    });
    const out = analyze({ files, home, repo, gitdir, branch: gitdir ? null : branch });
    const ours = out.entries.map((e) => `${e.scope}\t${normalizePath(e.file)}\t${e.key}${e.value === null ? "" : "=" + e.value}`);
    const ctx = { seed, repo: repoRel, branch, files: files.map((f) => `==> ${f.path.slice(root.length)} <==\n${f.text}`).join("\n"), stderr: res.stderr };
    if (res.status !== 0) {
      assert.ok(out.fatal, `git failed but the engine did not: ${JSON.stringify(ctx, null, 1)}`);
      const m = /bad config line (\d+) in file (.+)/.exec(res.stderr);
      if (m) {
        let f = m[2].trim();
        if (!f.startsWith("/")) f = join(runIn, f);
        assert.equal(`${normalizePath(out.fatal.file)}:${out.fatal.line}`, `${normalizePath(f)}:${m[1]}`, JSON.stringify(ctx, null, 1));
        return "fatal";
      } else if (/maximum include depth/.test(res.stderr)) {
        assert.match(out.fatal.message, /maximum include depth/, JSON.stringify(ctx, null, 1));
        return "depth";
      } else if (/remote URLs cannot be configured/.test(res.stderr)) {
        assert.match(out.fatal.message, /remote URLs cannot be configured/, JSON.stringify(ctx, null, 1));
        return "forbid";
      } else {
        assert.fail(`unrecognised git error: ${JSON.stringify(ctx, null, 1)}`);
      }
      return "fatal";
    }
    assert.equal(out.fatal, null, `engine failed but git did not: ${JSON.stringify(out.fatal)} ${JSON.stringify(ctx, null, 1)}`);
    assert.deepEqual(ours, gitLines, JSON.stringify(ctx, null, 1));
    return out.directives.filter((d) => d.matched && d.kind === "includeIf").length ? "matched" : "plain";
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the engine reads config trees exactly as git config --list does", { skip: !hasGit && "git not installed" }, () => {
  const trials = Number(process.env.GITCONFIG_DIFF_TRIALS || 150);
  const start = Number(process.env.GITCONFIG_DIFF_SEED || 1);
  const tally = {};
  for (let i = 0; i < trials; i++) { const k = trial(start + i); tally[k] = (tally[k] || 0) + 1; }
  console.log("tally", JSON.stringify(tally));
  // the generator must keep exercising all three outcomes
  assert.ok(tally.matched > trials / 10, JSON.stringify(tally));
  assert.ok(tally.fatal > 0, JSON.stringify(tally));
});
