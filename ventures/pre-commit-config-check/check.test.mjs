// Expected messages below are pre-commit 4.7.0's own output: each case was
// run through `pre-commit validate-config` (or clientlib.load_config with
// its log captured) and the text copied from what it printed. They are not
// this checker's output read back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfigText, formatLikePreCommit, summarize } from "./check.mjs";

const cfg = (body) => `repos:\n${body}`;
const remote = (hook, rev = "v1.2.3") => cfg(`  - repo: https://github.com/x/y\n    rev: ${rev}\n    hooks:\n      - id: h\n${hook.split("\n").map((l) => "        " + l).join("\n")}\n`);
const chain = (r) => [...r.firstError.context.filter(Boolean), r.firstError.message];

test("valid config: accepted, no pre-commit findings", () => {
  const r = checkConfigText(cfg("  - repo: https://github.com/psf/black\n    rev: 24.1.0\n    hooks:\n      - id: black\n"));
  assert.equal(r.ok, true);
  assert.equal(r.firstError, null);
  assert.deepEqual(r.preCommitWarnings, []);
});

test("args: [--line-length, 100] -- pre-commit's exact error chain", () => {
  const text = cfg("  - repo: https://github.com/psf/black\n    rev: stable\n    hooks:\n      - id: black\n        args: [--line-length, 100]\n");
  const r = checkConfigText(text, { filename: "/tmp/claude-0/ex.yaml" });
  assert.equal(r.ok, false);
  // Copied from `pre-commit validate-config /tmp/claude-0/ex.yaml`.
  assert.deepEqual(chain(r), [
    "File /tmp/claude-0/ex.yaml", "At Config()", "At key: repos",
    "At Repository(repo='https://github.com/psf/black')", "At key: hooks",
    "At Hook(id='black')", "At key: args", "At index 1", "Expected string got int",
  ]);
  assert.equal(r.firstError.line, 6);
  assert.match(r.firstError.fix, /quotes/);
  // pre-commit checks hooks before rev, so it stops before its mutable-rev
  // warning; this checker still reports it.
  assert.equal(r.preCommitWarnings.length, 0);
  assert.match(r.findings.find((f) => f.rule === "mutable-rev").message, /^The 'rev' field of repo 'https:\/\/github.com\/psf\/black' appears to be a mutable reference/);
  assert.match(formatLikePreCommit(r.firstError), /=====> Expected string got int$/);
});

test("YAML 1.1 typing traps are type errors", () => {
  assert.equal(checkConfigText(remote("id: h", "6.0")).firstError.message, "Expected string got float");
  assert.equal(checkConfigText(remote("id: h", "2024-01-01")).firstError.message, "Expected string got date");
  assert.equal(checkConfigText(remote("language_version: 3.11")).firstError.message, "Expected string got float");
  assert.equal(checkConfigText(remote('pass_filenames: "false"')).firstError.message, "Expected bool got str");
  assert.equal(checkConfigText(remote("pass_filenames: no")).ok, true, "no is a YAML 1.1 boolean");
  assert.equal(checkConfigText(remote("always_run: 1")).firstError.message, "Expected bool got int");
  assert.equal(checkConfigText(remote("args: --fix")).firstError.message, "Expected array but got 'str'");
});

test("files/exclude are Python regexes", () => {
  const r = checkConfigText(remote("exclude: '*.ipynb'"));
  assert.equal(r.firstError.message, "'*.ipynb' is not a valid python regex");
  assert.equal(r.firstError.detail, "nothing to repeat");
  assert.match(r.firstError.fix, /not globs/);
  assert.equal(checkConfigText(remote("files: '(?<n>a)'")).firstError.message, "'(?<n>a)' is not a valid python regex");
  assert.equal(checkConfigText(remote("files: '(?<=a+)b'")).firstError.detail, "look-behind requires fixed-width pattern");
  // Valid in Python, invalid in JavaScript:
  assert.equal(checkConfigText(remote("exclude: '(?x) ^docs/ | ^tests/'")).ok, true);
  assert.equal(checkConfigText(remote("files: '(?P<n>a)(?P=n)\\Z'")).ok, true);
});

test("unquoted *.py is a YAML alias, caught before validation", () => {
  const r = checkConfigText(remote("exclude: *.ipynb"));
  assert.equal(r.firstError.rule, "yaml");
  assert.match(r.firstError.fix, /alias/);
});

test("'/*' and slash-class warnings use pre-commit's wording", () => {
  const r = checkConfigText(remote("files: src/*"));
  assert.equal(r.ok, true);
  assert.equal(r.preCommitWarnings[0].message, "The 'files' field in hook 'h' is a regex, not a glob -- matching '/*' probably isn't what you want here");
  const top = checkConfigText(cfg("  - repo: meta\n    hooks:\n      - id: identity\n") + "exclude: '^vendor/*'\n");
  assert.equal(top.preCommitWarnings[0].message, "The top-level 'exclude' field is a regex, not a glob -- matching '/*' probably isn't what you want here");
});

test("stages: legacy names warn, unknown names fail", () => {
  const r = checkConfigText(remote("stages: [commit]"));
  assert.equal(r.ok, true);
  assert.equal(r.preCommitWarnings[0].message, "hook id `h` uses deprecated stage names (commit) which will be removed in a future version.  run: `pre-commit migrate-config` to automatically fix this.");
  const bad = checkConfigText(remote("stages: [precommit]"));
  assert.equal(bad.firstError.message, "Expected one of commit-msg, manual, post-checkout, post-commit, post-merge, post-rewrite, pre-commit, pre-merge-commit, pre-push, pre-rebase, prepare-commit-msg but got: 'precommit'");
});

test("local and meta hooks", () => {
  const local = checkConfigText(cfg("  - repo: local\n    hooks:\n      - id: x\n        entry: x\n        language: system\n"));
  assert.equal(local.firstError.message, "Missing required key: name");
  const rev = checkConfigText(cfg("  - repo: local\n    rev: v1\n    hooks: []\n"));
  assert.equal(rev.firstError.message, "Expected rev to be absent when repo is any of ('local', 'meta'), found rev: 'v1'");
  const meta = checkConfigText(cfg("  - repo: meta\n    hooks:\n      - id: check-hooks-apply\n        entry: x\n"));
  assert.equal(meta.firstError.message, "'entry' cannot be overridden");
  const metaId = checkConfigText(cfg("  - repo: meta\n    hooks:\n      - id: nope\n"));
  assert.equal(metaId.firstError.message, "Expected one of check-hooks-apply, check-useless-excludes, identity but got: 'nope'");
});

test("type tags come from identify", () => {
  assert.equal(checkConfigText(remote("types: [pyton]")).firstError.message, "Type tag 'pyton' is not recognized.  Try upgrading identify and pre-commit?");
  assert.equal(checkConfigText(remote("types_or: [python, pyi]")).ok, true);
});

test("root keys, default_language_version and minimum version", () => {
  const unknown = checkConfigText(cfg("  - repo: meta\n    hooks: []\n") + "repo: x\n");
  assert.equal(unknown.preCommitWarnings[0].message, "Unexpected key(s) present at root: repo");
  const dlv = checkConfigText(cfg("  - repo: meta\n    hooks: []\n") + "default_language_version: {system: x}\n");
  assert.match(dlv.firstError.message, /^Additional keys found: system\.  Only these keys are allowed: conda, coursier,/);
  const min = checkConfigText("minimum_pre_commit_version: '9.0.0'\nrepos: []\n");
  assert.equal(min.firstError.message, "pre-commit version 9.0.0 is required but version 4.7.0 is installed.  Perhaps run `pip install --upgrade pre-commit`.");
  assert.equal(checkConfigText("minimum_pre_commit_version: '3.0'\nrepos: []\n").ok, true);
  assert.equal(checkConfigText("minimum_pre_commit_version: '3.0'\nrepos: []\n", { installed: "2.20.0" }).ok, false);
  assert.equal(checkConfigText("minimum_pre_commit_version: 'x.1'\nrepos: []\n").firstError.crash, true);
  assert.equal(checkConfigText("repos: []\nci: [x]\n").firstError.message, "Expected dict got list");
});

test("old list-only format", () => {
  const r = checkConfigText("- repo: https://github.com/x/y\n  sha: abc\n  hooks: []\n");
  assert.equal(r.firstError.message, "Expected a Config map but got a list");
  assert.ok(r.findings.some((f) => f.rule === "old-list-format" && f.source === "beyond"));
});

test("checker keeps going past pre-commit's first error", () => {
  const r = checkConfigText(remote("args: [--x, 1]\ntypes: [pyton]\nalways_run: 'yes'"));
  assert.equal(summarize(r).errors, 3);
  // pre-commit checks keys in its schema order (types before args), not file order.
  assert.equal(r.firstError.message, "Type tag 'pyton' is not recognized.  Try upgrading identify and pre-commit?");
});

test("beyond pre-commit: silently ignored keys, duplicates, glued args", () => {
  const typo = checkConfigText(remote("exclude_files: ^docs/"));
  assert.equal(typo.ok, true, "pre-commit accepts unknown hook keys");
  const f = typo.findings.find((x) => x.rule === "unknown-hook-key");
  assert.match(f.message, /did you mean `exclude_types`\?|did you mean `exclude`\?/);
  const dup = checkConfigText(remote("exclude: ^a/\nexclude: ^b/"));
  assert.ok(dup.findings.some((x) => x.rule === "duplicate-key" && /lines 6 and 7/.test(x.message)));
  const glued = checkConfigText(remote("args: ['--max-line-length 100', '--select=E,W', '--ignore E501']"));
  assert.equal(glued.findings.filter((x) => x.rule === "args-glued").length, 2);
});

test("prek keys are named as prek's, not typos", () => {
  const r = checkConfigText(remote("priority: 0\nenv: {A: b}"));
  assert.equal(r.findings.filter((x) => x.rule === "prek-key").length, 2);
  assert.equal(r.findings.filter((x) => x.rule === "unknown-hook-key").length, 0);
});

test("tag vs SHA note", () => {
  const r = checkConfigText(remote("id: h", "v1.2.3"));
  assert.ok(r.findings.some((x) => x.rule === "tag-not-sha" && x.level === "info"));
  const sha = checkConfigText(remote("id: h", "0123456789abcdef0123456789abcdef01234567"));
  assert.ok(!sha.findings.some((x) => x.rule === "tag-not-sha"));
});
