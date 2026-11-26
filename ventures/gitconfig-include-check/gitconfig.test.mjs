import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze, why, parseConfig, splitSources, normalizeKey, reportText, listing, DEFAULTS } from "./gitconfig.mjs";

const HOME = "/home/sam";
const run = (files, extra = {}) => analyze({ home: HOME, repo: "~/work/api", branch: "main", files, ...extra });
const kinds = (r) => r.findings.map((f) => f.kind);

test("the example finds the missing trailing slash", () => {
  const r = analyze(DEFAULTS);
  assert.equal(r.findings[0].kind, "gitdir-no-trailing-slash");
  assert.equal(r.effective["user.email"].value, "sam@personal.example");
});

test("with the slash, the include above [user] still loses", () => {
  const r = analyze({ ...DEFAULTS, files: DEFAULTS.files.replace('"gitdir:~/work"', '"gitdir:~/work/"') });
  const f = r.findings.find((x) => x.kind === "include-overridden");
  assert.ok(f);
  assert.equal(f.severity, "high");
  assert.match(f.detail, /Move the \[includeIf "gitdir:~\/work\/"\] block to the end/);
  assert.equal(r.effective["user.signingkey"].value, "~/.ssh/work_ed25519.pub");
});

test("an include at the end wins and nothing is flagged", () => {
  const r = run("[user]\n\temail = me@home\n[includeIf \"gitdir:~/work/\"]\n\tpath = ~/.gc-work\n==> ~/.gc-work <==\n[user]\n\temail = me@work\n");
  assert.equal(r.effective["user.email"].value, "me@work");
  assert.deepEqual(r.effective["user.email"].via, ["/home/sam/.gitconfig:4"]);
  assert.deepEqual(r.findings, []);
});

test("unknown and miscased conditions are named, with the fix", () => {
  const r = run("[includeIf \"GitDir:~/work/\"]\n\tpath = x\n[includeIf \"onBranch:main\"]\n\tpath = x\n==> ~/x <==\n[a]\nb=1\n");
  const f = r.findings.filter((x) => x.kind === "unknown-condition");
  assert.equal(f.length, 2);
  assert.match(f[0].detail, /gitdir:~\/work\//);
  assert.match(f[1].detail, /onbranch:main/);
});

test("a space after gitdir: is reported", () => {
  const r = run("[includeIf \"gitdir: ~/work/\"]\n\tpath = x\n");
  assert.ok(kinds(r).includes("condition-whitespace"));
});

test("gitdir: naming the work tree is told apart from a missing slash", () => {
  const r = run("[includeIf \"gitdir:~/work/api\"]\n\tpath = x\n");
  assert.ok(kinds(r).includes("gitdir-names-work-tree"));
  assert.ok(!kinds(r).includes("gitdir-no-trailing-slash"));
});

test("case-only mismatch suggests gitdir/i:", () => {
  const r = run("[includeIf \"gitdir:~/Work/\"]\n\tpath = x\n");
  assert.ok(kinds(r).includes("gitdir-case"));
  assert.equal(run("[includeIf \"gitdir/i:~/Work/\"]\n\tpath = x\n").directives[0].matched, true);
});

test("onbranch: compares the short name and never matches when detached", () => {
  const r = run("[includeIf \"onbranch:refs/heads/main\"]\n\tpath = x\n[includeIf \"onbranch:feature/\"]\n\tpath = x\n");
  assert.ok(kinds(r).includes("onbranch-refs-prefix"));
  assert.equal(run("[includeIf \"onbranch:feature/\"]\n\tpath = x\n", { branch: "feature/a/b" }).directives[0].matched, true);
  const d = run("[includeIf \"onbranch:main\"]\n\tpath = x\n", { branch: null });
  assert.equal(d.directives[0].matched, false);
  assert.ok(kinds(d).includes("onbranch-detached"));
});

test("hasconfig: reads remote URLs from the local config and flags a scheme mismatch", () => {
  const files = "[includeIf \"hasconfig:remote.*.url:https://github.com/acme/**\"]\n\tpath = x\n==> ~/x <==\n[user]\nemail = a@acme\n";
  const r = run(files, { remotes: ["git@github.com:acme/api.git"] });
  assert.equal(r.directives[0].matched, false);
  assert.ok(kinds(r).includes("hasconfig-scheme"));
  const ok = run(files, { remotes: ["https://github.com/acme/api.git"] });
  assert.equal(ok.effective["user.email"].value, "a@acme");
});

test("quality round 109: hasconfig takes no trailing-slash ** (git 2.43: acme/ misses, acme/** matches)", () => {
  const f = (pat) => `[user]\nemail = me@home\n[includeIf "hasconfig:remote.*.url:${pat}"]\n\tpath = x\n==> ~/x <==\n[user]\nemail = me@acme\n`;
  const remotes = ["https://github.com/acme/api.git"];
  const slash = run(f("https://github.com/acme/"), { remotes });
  assert.equal(slash.directives[0].matched, false);
  assert.equal(slash.effective["user.email"].value, "me@home");
  assert.equal(run(f("https://github.com/acme/**"), { remotes }).effective["user.email"].value, "me@acme");
});

test("a remote URL inside a conditional include stops git once hasconfig is used", () => {
  const r = run("[includeIf \"gitdir:~/work/\"]\n\tpath = x\n[includeIf \"hasconfig:remote.*.url:*\"]\n\tpath = y\n==> ~/x <==\n[remote \"o\"]\n\turl = u\n");
  assert.match(r.fatal.message, /remote URLs cannot be configured/);
});

test("missing targets, env vars and non-path keys are reported", () => {
  const r = run("[include]\n\tpath = $HOME/.gc\n[includeIf \"gitdir:~/work/\"]\n\tfile = x\n[include \"x\"]\n\tpath = y\n");
  const k = kinds(r);
  assert.ok(k.includes("include-env-var"));
  assert.ok(k.includes("include-target-missing"));
  assert.ok(k.includes("includeif-not-path"));
  assert.ok(k.includes("include-not-path"));
});

test("a file nothing includes, and a key before any section", () => {
  const r = run("email = x\n[include]\n\tpath = .gc-wrok\n==> ~/.gc-work <==\n[user]\nemail = w\n");
  const k = kinds(r);
  assert.ok(k.includes("key-without-section"));
  assert.ok(k.includes("file-never-read"));
});

test("include cycles stop at git's depth limit", () => {
  const r = run("[include]\n\tpath = ~/.gitconfig\n");
  assert.match(r.fatal.message, /maximum include depth \(10\)/);
});

test("linked worktrees: gitdir: sees the main repository's .git", () => {
  const r = analyze({ home: HOME, gitdir: "~/work/api/.git/worktrees/fix", branch: "fix", files: "[includeIf \"gitdir:~/work/\"]\n\tpath = x\n==> ~/x <==\n[a]\nb=1\n" });
  assert.equal(r.directives[0].matched, true);
  assert.ok(kinds(r).includes("linked-worktree"));
});

test("parser: values, quotes, escapes, comments, continuation", () => {
  const { entries, error } = parseConfig("[S \"Sub\"]\n\tKey = \"a  b\" c ; d\n\tt = x\\ty\n\tm = a\\\nb\n\tflag\n[x] y = 1\n");
  assert.equal(error, null);
  assert.deepEqual(entries.map((e) => [e.name, e.value, e.line]), [
    ["s.Sub.key", "a  b c", 2], ["s.Sub.t", "x\ty", 3], ["s.Sub.m", "ab", 5], ["s.Sub.flag", null, 6], ["x.y", "1", 7]]);
  assert.equal(parseConfig("[a]\nk = \"open\n").error.line, 2);
  assert.equal(parseConfig("[a]\nk ; c\n").error.line, 2);
});

test("splitSources, normalizeKey, why and the text report", () => {
  assert.deepEqual(splitSources("[a]\nb=1\n==> /x <==\n[c]").map((f) => f.path), ["~/.gitconfig", "/x"]);
  assert.equal(normalizeKey("Remote.Origin.URL"), "remote.Origin.url");
  const w = why({ ...DEFAULTS, key: "User.Email", files: DEFAULTS.files.replace('"gitdir:~/work"', '"gitdir:~/work/"') });
  assert.equal(w.values.length, 2);
  assert.equal(w.winner.value, "sam@personal.example");
  assert.match(reportText(analyze(DEFAULTS)), /skip  \/home\/sam\/.gitconfig:2/);
  assert.match(listing(analyze(DEFAULTS)), /global\tfile:\/home\/sam\/.gitconfig\tuser.email=sam@personal.example/);
});

let hasGit = true;
try { execFileSync("git", ["--version"]); } catch { hasGit = false; }

test("symlinked folders: git tries the real path, then the path as given", { skip: !hasGit && "git not installed" }, () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gclink-")));
  try {
    const home = join(root, "h");
    mkdirSync(join(root, "storage/work/api"), { recursive: true });
    mkdirSync(home);
    symlinkSync(join(root, "storage/work"), join(home, "work"));
    const env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: "1" };
    for (const k of Object.keys(env)) if (/^GIT_CONFIG_(PARAMETERS|COUNT|KEY|VALUE|GLOBAL)/.test(k)) delete env[k];
    execFileSync("git", ["init", "-q", "-b", "main", join(home, "work/api")], { env });
    const cfg = `[includeIf "gitdir:~/work/"]\n\tpath = a\n[includeIf "gitdir:${root}/storage/"]\n\tpath = b\n`;
    writeFileSync(join(home, ".gitconfig"), cfg);
    writeFileSync(join(home, "a"), "[x]\n\ta = 1\n");
    writeFileSync(join(home, "b"), "[x]\n\tb = 1\n");
    const get = (cwd, key) => spawnSync("git", ["config", key], { cwd, env: { ...env, PWD: cwd }, encoding: "utf8" }).stdout.trim();
    const top = join(home, "work/api");
    mkdirSync(join(top, "sub"));
    // in the top folder, with $PWD naming the symlinked path, both match
    assert.equal(get(top, "x.a"), "1");
    assert.equal(get(top, "x.b"), "1");
    // from a subfolder git only knows the real path
    assert.equal(get(join(top, "sub"), "x.a"), "");
    assert.equal(get(join(top, "sub"), "x.b"), "1");
    const r = analyze({ home, gitdir: join(home, "work/api/.git"), realGitdir: join(root, "storage/work/api/.git"),
      files: [{ path: join(home, ".gitconfig"), text: cfg }, { path: join(home, "a"), text: "[x]\n\ta = 1\n" }, { path: join(home, "b"), text: "[x]\n\tb = 1\n" }] });
    assert.deepEqual(r.directives.map((d) => d.matched), [true, true]);
    assert.deepEqual(r.findings.map((f) => f.kind), ["gitdir-symlink"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
