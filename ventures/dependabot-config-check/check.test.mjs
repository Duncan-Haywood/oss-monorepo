import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze, parseYaml, detectManifests, generateConfig, summary, hasRisk } from "./check.mjs";

const rules = (r) => r.findings.map((f) => f.rule);
const GOOD = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
    groups:
      all:
        patterns: ["*"]
`;

test("parses block maps, sequences, flow lists, quotes and comments", () => {
  const d = parseYaml(`# top\nversion: 2 # inline\nupdates:\n- package-ecosystem: 'npm'\n  directories: ["/a", /b]\n  ignore:\n    - dependency-name: "x"\n      versions: [">=2"]\n`);
  assert.equal(d.version, 2);
  assert.equal(d.updates[0]["package-ecosystem"], "npm");
  assert.deepEqual(d.updates[0].directories, ["/a", "/b"]);
  assert.equal(d.updates[0].ignore[0].versions[0], ">=2");
});

test("a clean config has no findings", () => {
  const r = analyze(GOOD, ["package.json"]);
  assert.deepEqual(r.findings, []);
  assert.equal(summary(r), "No findings.");
  assert.equal(hasRisk(r), false);
});

test("reports missing version, unknown ecosystem, missing schedule and bad interval", () => {
  const r = analyze(`updates:\n  - package-ecosystem: go\n    directory: /\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: hourly\n`);
  for (const rule of ["version", "unknown-ecosystem", "missing-schedule", "bad-interval"]) assert.ok(rules(r).includes(rule), rule);
  assert.match(r.findings.find((f) => f.rule === "unknown-ecosystem").fix, /gomod/);
});

test("duplicate ecosystem + directory is an error, a different target-branch is not", () => {
  const dup = analyze(`version: 2\nupdates:\n  - {package-ecosystem: npm, directory: /, schedule: {interval: daily}}\n  - {package-ecosystem: npm, directory: /, schedule: {interval: weekly}}\n`);
  assert.ok(rules(dup).includes("duplicate-entry"));
  const ok = analyze(`version: 2\nupdates:\n  - {package-ecosystem: npm, directory: /, schedule: {interval: daily}}\n  - {package-ecosystem: npm, directory: /, target-branch: next, schedule: {interval: weekly}}\n`);
  assert.ok(!rules(ok).includes("duplicate-entry"));
});

test("pr limit of zero and relative directory are flagged", () => {
  const r = analyze(`version: 2\nupdates:\n  - package-ecosystem: pip\n    directory: app\n    open-pull-requests-limit: 0\n    schedule:\n      interval: weekly\n`);
  assert.ok(rules(r).includes("pr-limit-zero"));
  assert.ok(rules(r).includes("relative-directory"));
});

test("no-groups is a warning for npm and only a suggestion for github-actions; cooldown is a suggestion", () => {
  const r = analyze(`version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule: {interval: weekly}\n  - package-ecosystem: github-actions\n    directory: /\n    schedule: {interval: weekly}\n`);
  const g = r.findings.filter((f) => f.rule === "no-groups");
  assert.deepEqual(g.map((f) => f.severity).sort(), ["info", "warn"]);
  assert.ok(r.findings.filter((f) => f.rule === "no-cooldown").every((f) => f.severity === "info"));
});

test("uncovered ecosystems are found from a file list, and aliases and globs count as coverage", () => {
  const files = ["package.json", "web/package.json", "Dockerfile", ".github/workflows/ci.yml", "svc/go.mod", "uv.lock", "pyproject.toml", "node_modules/x/package.json"];
  const r = analyze(GOOD, files);
  const un = r.findings.filter((f) => f.rule === "uncovered-ecosystem").map((f) => f.message);
  assert.equal(un.length, 5, un.join("\n"));
  assert.ok(un.some((m) => m.startsWith("npm manifest at web/package.json")));
  assert.ok(un.some((m) => m.startsWith("docker")));
  assert.ok(un.some((m) => m.startsWith("github-actions")));
  assert.ok(un.some((m) => m.startsWith("gomod")));
  assert.ok(un.some((m) => m.startsWith("pip")));
  assert.ok(!un.some((m) => m.includes("node_modules")));
  const covered = analyze(`version: 2\nupdates:\n  - package-ecosystem: bun\n    directories: ["/", "/*"]\n    schedule: {interval: weekly}\n    groups: {a: {patterns: ["*"]}}\n    cooldown: {default-days: 3}\n`, ["package.json", "web/package.json"]);
  assert.ok(!rules(covered).includes("uncovered-ecosystem"));
});

test("a config entry with no matching manifest is reported as a stale suggestion", () => {
  const r = analyze(GOOD, ["README.md"]);
  assert.ok(rules(r).includes("stale-entry"));
  assert.equal(r.findings.find((f) => f.rule === "stale-entry").severity, "info");
});

test("yaml that does not parse is one error naming the line, not a crash", () => {
  const r = analyze("version: 2\nupdates:\n  - package-ecosystem: [npm\n");
  assert.equal(r.parseError, true);
  assert.equal(r.findings[0].rule, "yaml-parse");
  assert.equal(r.findings[0].line, 3);
  assert.equal(analyze("").findings[0].rule, "empty-config");
});

test("detectManifests dedupes per directory and ignores vendored trees", () => {
  const m = detectManifests(["a/package.json", "a/package-lock.json", "a/b/package.json", "vendor/x/go.mod", "app/Dockerfile.dev", "infra/main.tf", "infra/vars.tf"]);
  const keys = m.map((x) => `${x.ecosystem}:${x.directory}`).sort();
  assert.deepEqual(keys, ["docker:/app", "npm:/a", "npm:/a/b", "terraform:/infra"]);
});

test("generateConfig output passes its own checker with no findings", () => {
  const files = ["package.json", "Dockerfile", ".github/workflows/ci.yml", "a/go.mod", "b/go.mod"];
  const y = generateConfig(files);
  assert.match(y, /directories:/);
  assert.deepEqual(analyze(y, files).findings, []);
  assert.equal(generateConfig(["README.md"]), "");
});

test("CLI: exit codes, json output and generate mode", () => {
  const dir = mkdtempSync(join(tmpdir(), "dcc-"));
  mkdirSync(join(dir, ".github"));
  writeFileSync(join(dir, "package.json"), "{}");
  writeFileSync(join(dir, "go.mod"), "module x");
  writeFileSync(join(dir, ".github", "dependabot.yml"), GOOD);
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const bad = spawnSync("node", [cli, dir, "--fail-on-risk"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /uncovered-ecosystem/);
  const soft = spawnSync("node", [cli, dir], { encoding: "utf8" });
  assert.equal(soft.status, 0);
  const json = JSON.parse(execFileSync("node", [cli, dir, "--format", "json"], { encoding: "utf8" }));
  assert.equal(json.findings[0].rule, "uncovered-ecosystem");
  const gen = execFileSync("node", [cli, dir, "--generate"], { encoding: "utf8" });
  assert.match(gen, /package-ecosystem: "gomod"/);
  const none = spawnSync("node", [cli, mkdtempSync(join(tmpdir(), "dcc-"))], { encoding: "utf8" });
  assert.equal(none.status, 1);
});
