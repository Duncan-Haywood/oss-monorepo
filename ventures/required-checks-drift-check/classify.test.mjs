import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseTriggers,
  scanText,
  scanFiles,
  parseRequiredChecks,
  compare,
  hasStale,
  summaryLine,
  CURRENT,
  STALE,
  NO_PR_TRIGGER,
  UNVERIFIABLE,
} from "./classify.mjs";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "check.py");

test("parseTriggers: scalar", () => {
  assert.deepEqual(parseTriggers("on: push\njobs:\n"), new Set(["push"]));
});

test("parseTriggers: flow list", () => {
  assert.deepEqual(parseTriggers("on: [push, pull_request]\n"), new Set(["push", "pull_request"]));
});

test("parseTriggers: block mapping ignores nested config keys", () => {
  const text = "on:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  x:\n";
  assert.deepEqual(parseTriggers(text), new Set(["push", "pull_request"]));
});

test("parseTriggers: block list", () => {
  const text = "on:\n  - push\n  - workflow_dispatch\njobs:\n";
  assert.deepEqual(parseTriggers(text), new Set(["push", "workflow_dispatch"]));
});

test("scanText: simple job uses id as name", () => {
  const reports = scanText("on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n", "w.yml");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].baseName, "lint");
  assert.deepEqual(reports[0].checkNames, ["lint"]);
  assert.equal(reports[0].runsOnPr, true);
});

test("scanText: name field overrides job id", () => {
  const text = "on: pull_request\njobs:\n  build:\n    name: Build and Test\n    runs-on: ubuntu-latest\n";
  const reports = scanText(text, "w.yml");
  assert.equal(reports[0].baseName, "Build and Test");
});

test("scanText: workflow without pull_request trigger is flagged", () => {
  const reports = scanText("on: push\njobs:\n  release:\n    runs-on: ubuntu-latest\n", "w.yml");
  assert.equal(reports[0].runsOnPr, false);
});

test("scanText: flow matrix expands cartesian", () => {
  const text =
    "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n" +
    "    strategy:\n      matrix:\n        node: [16, 18, 20]\n";
  const reports = scanText(text, "w.yml");
  assert.deepEqual(reports[0].checkNames, ["test (16)", "test (18)", "test (20)"]);
});

test("scanText: multi-axis matrix is full cartesian product", () => {
  const text =
    "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n" +
    "    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest]\n" +
    "        node: [16, 18]\n";
  const reports = scanText(text, "w.yml");
  assert.deepEqual(reports[0].checkNames, [
    "test (ubuntu-latest, 16)",
    "test (ubuntu-latest, 18)",
    "test (macos-latest, 16)",
    "test (macos-latest, 18)",
  ]);
});

test("scanText: dynamic matrix expression is unenumerable", () => {
  const text =
    "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n" +
    "    strategy:\n      matrix: ${{ fromJson(needs.setup.outputs.matrix) }}\n";
  const reports = scanText(text, "w.yml");
  assert.equal(reports[0].dynamic, true);
  assert.equal(reports[0].checkNames, null);
});

test("scanText: reusable workflow call is flagged not computed", () => {
  const reports = scanText("on: pull_request\njobs:\n  call:\n    uses: ./.github/workflows/shared.yml\n", "w.yml");
  assert.equal(reports[0].reusable, true);
  assert.equal(reports[0].checkNames, null);
});

test("scanText: a top-level key after jobs: is not mistaken for a job", () => {
  const text = "on: pull_request\njobs:\n  a:\n    runs-on: ubuntu-latest\nenv:\n  FOO: bar\n";
  const reports = scanText(text, "w.yml");
  assert.deepEqual(reports.map((r) => r.jobId), ["a"]);
});

test("parseRequiredChecks: plain lines and bullets", () => {
  assert.deepEqual(parseRequiredChecks("lint\n- build\n"), ["lint", "build"]);
});

test("parseRequiredChecks: branch-protection JSON shape", () => {
  const payload = JSON.stringify({ required_status_checks: { contexts: ["lint", "build"] } });
  assert.deepEqual(parseRequiredChecks(payload), ["lint", "build"]);
});

test("parseRequiredChecks: checks array shape", () => {
  const payload = JSON.stringify({ checks: [{ context: "lint", app_id: 1 }, { context: "build" }] });
  assert.deepEqual(parseRequiredChecks(payload), ["lint", "build"]);
});

test("compare: matching name is current", () => {
  const reports = scanText("on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n", "w.yml");
  const results = compare(["lint"], reports);
  assert.equal(results[0].status, CURRENT);
});

test("compare: unmatched name is stale", () => {
  const reports = scanText("on: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n", "w.yml");
  const results = compare(["gone"], reports);
  assert.equal(results[0].status, STALE);
  assert.match(results[0].note, /Waiting for status/);
});

test("compare: matched job without pr trigger is flagged", () => {
  const reports = scanText("on: push\njobs:\n  release:\n    runs-on: ubuntu-latest\n", "w.yml");
  const results = compare(["release"], reports);
  assert.equal(results[0].status, NO_PR_TRIGGER);
});

test("compare: dynamic matrix prefix match is unverifiable", () => {
  const reports = scanText(
    "on: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix: ${{ fromJson(x) }}\n",
    "w.yml",
  );
  const results = compare(["test (foo, bar)"], reports);
  assert.equal(results[0].status, UNVERIFIABLE);
});

test("hasStale detects any stale result", () => {
  assert.equal(hasStale([{ status: CURRENT }, { status: STALE }]), true);
  assert.equal(hasStale([{ status: CURRENT }]), false);
});

test("summaryLine reports counts", () => {
  assert.match(summaryLine([{ status: CURRENT }, { status: STALE }]), /can never be satisfied/);
  assert.match(summaryLine([{ status: CURRENT }]), /match a job/);
});

test("scanFiles concatenates findings across files in order", () => {
  const files = [
    { name: "a.yml", text: "on: pull_request\njobs:\n  a:\n    runs-on: ubuntu-latest\n" },
    { name: "b.yml", text: "on: pull_request\njobs:\n  b:\n    runs-on: ubuntu-latest\n" },
  ];
  const reports = scanFiles(files);
  assert.deepEqual(reports.map((r) => r.jobId), ["a", "b"]);
});

// Parity: the browser port must never disagree with the canonical Python
// CLI on the same input. Skips cleanly if python3 is unavailable.
test("classify.mjs and check.py agree on a mixed fixture", { skip: !hasPython() }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rcdc-parity-"));
  try {
    const wfDir = path.join(dir, ".github", "workflows");
    mkdirSync(wfDir, { recursive: true });
    const ciYaml =
      "name: ci\non: [push, pull_request]\njobs:\n" +
      "  build:\n    name: Build and Test\n    runs-on: ubuntu-latest\n" +
      "    strategy:\n      matrix:\n        node: [16, 18]\n" +
      "  lint:\n    runs-on: ubuntu-latest\n";
    const deployYaml = "name: deploy\non:\n  push:\n    branches: [main]\njobs:\n  release:\n    runs-on: ubuntu-latest\n";
    writeFileSync(path.join(wfDir, "ci.yml"), ciYaml);
    writeFileSync(path.join(wfDir, "deploy.yml"), deployYaml);
    const requiredPath = path.join(dir, "required.txt");
    writeFileSync(requiredPath, "Build and Test (16)\nlint\nrelease\nold-job-name\n");

    const stdout = execFileSync(
      "python3",
      [CLI, dir, "--required-checks", requiredPath, "--format", "json"],
      { encoding: "utf8" },
    );
    const pyOutput = JSON.parse(stdout);

    const jsReports = scanFiles([
      { name: path.join(wfDir, "ci.yml"), text: ciYaml },
      { name: path.join(wfDir, "deploy.yml"), text: deployYaml },
    ]);
    const jsResults = compare(parseRequiredChecks("Build and Test (16)\nlint\nrelease\nold-job-name\n"), jsReports);

    assert.deepEqual(
      jsResults.map((r) => r.status),
      pyOutput.results.map((r) => r.status),
    );
    assert.deepEqual(
      jsReports.map((r) => r.checkNames),
      pyOutput.jobs.map((r) => r.check_names),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function hasPython() {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
