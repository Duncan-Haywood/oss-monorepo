import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORK_EXPOSED,
  SELF_HOSTED_OTHER_TRIGGER,
  GITHUB_HOSTED,
  RUNNER_GROUP,
  DYNAMIC,
  NO_RUNS_ON,
  NO_JOBS,
  scanText,
  scanFiles,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
} from "./classify.mjs";

const CLI = fileURLToPath(new URL("./check.py", import.meta.url));

test("self-hosted plus pull_request is fork-exposed", () => {
  const text = "on: pull_request\njobs:\n  build:\n    runs-on: self-hosted\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, FORK_EXPOSED);
});

test("self-hosted plus push is not flagged", () => {
  const text = "on: push\njobs:\n  build:\n    runs-on: self-hosted\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, SELF_HOSTED_OTHER_TRIGGER);
});

test("github-hosted labels are never flagged regardless of trigger", () => {
  const text = "on: pull_request_target\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, GITHUB_HOSTED);
});

test("block sequence runs-on with self-hosted is flagged", () => {
  const text = "on: issue_comment\njobs:\n  build:\n    runs-on:\n      - self-hosted\n      - linux\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, FORK_EXPOSED);
});

test("flow-list runs-on with self-hosted is flagged", () => {
  const text = "on: workflow_run\njobs:\n  build:\n    runs-on: [self-hosted, linux, x64]\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, FORK_EXPOSED);
});

test("runner group selection is disclosed as unknown, not flagged", () => {
  const text = "on: pull_request\njobs:\n  build:\n    runs-on:\n      group: prod-runners\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, RUNNER_GROUP);
});

test("dynamic runs-on expression is disclosed as unknown, not flagged", () => {
  const text = "on: pull_request\njobs:\n  build:\n    runs-on: ${{ matrix.os }}\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, DYNAMIC);
});

test("no runs-on at all is reported, not flagged", () => {
  const text = "on: pull_request\njobs:\n  build:\n    steps:\n      - run: echo hi\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, NO_RUNS_ON);
});

test("no jobs section is reported at workflow scope", () => {
  const findings = scanText("on: pull_request\n", "wf.yml");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, NO_JOBS);
  assert.equal(findings[0].scope, "workflow");
});

test("a commented-out runs-on line is ignored", () => {
  const text = "on: pull_request\njobs:\n  build:\n    # runs-on: self-hosted\n    runs-on: ubuntu-latest\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, GITHUB_HOSTED);
});

test("multiple jobs are scanned independently", () => {
  const text = `on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
  deploy:
    runs-on: self-hosted
`;
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.find((f) => f.scope === "job:build").classification, GITHUB_HOSTED);
  assert.equal(findings.find((f) => f.scope === "job:deploy").classification, FORK_EXPOSED);
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const files = [
    { name: "ci.yml", text: "on: push\njobs:\n  build:\n    runs-on: self-hosted\n" },
    { name: "deploy.yml", text: "on: pull_request\njobs:\n  deploy:\n    runs-on: self-hosted\n" },
  ];
  const findings = scanFiles(files);
  assert.equal(findings[0].file, "ci.yml");
  assert.equal(findings.at(-1).file, "deploy.yml");
});

test("hasUnresolvedRisk is true only when fork-exposed exists", () => {
  assert.equal(hasUnresolvedRisk([{ classification: GITHUB_HOSTED }, { classification: FORK_EXPOSED }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: GITHUB_HOSTED }, { classification: SELF_HOSTED_OTHER_TRIGGER }]), false);
  assert.equal(hasUnresolvedRisk([]), false);
});

test("classificationCounts tallies by classification", () => {
  const text = "on: pull_request\njobs:\n  build:\n    runs-on: ubuntu-latest\n  deploy:\n    runs-on: self-hosted\n";
  const counts = classificationCounts(scanText(text, "wf.yml"));
  assert.equal(counts[GITHUB_HOSTED], 1);
  assert.equal(counts[FORK_EXPOSED], 1);
});

test("summaryLine flags exposed findings", () => {
  const findings = scanText("on: pull_request\njobs:\n  build:\n    runs-on: self-hosted\n", "wf.yml");
  assert.match(summaryLine(findings), /1 fork-exposed self-hosted job/);
});

test("summaryLine reports a clean scan", () => {
  const findings = scanText("on: pull_request\njobs:\n  build:\n    runs-on: ubuntu-latest\n", "wf.yml");
  assert.match(summaryLine(findings), /No fork-exposed self-hosted jobs found/);
});

// The guard that matters most: the CLI and the browser port must never
// disagree about what a workflow means. Both are run over the same
// workflow text and their findings compared field for field, so a
// classification rule changed in one file and not the other fails here
// rather than showing a visitor a different verdict than their own CI run.
test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-self-hosted-parity-"));
  const workflowsDir = path.join(dir, ".github", "workflows");
  mkdirSync(workflowsDir, { recursive: true });
  const workflowText = `name: ci
on: [pull_request, push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
  deploy:
    runs-on: self-hosted
    steps:
      - run: npm run deploy
  notify:
    runs-on:
      - self-hosted
      - gpu
    steps:
      - run: echo notify
  release:
    runs-on:
      group: prod-runners
    steps:
      - run: echo release
`;
  writeFileSync(path.join(workflowsDir, "ci.yml"), workflowText);

  const stdout = execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" });
  const pythonFindings = JSON.parse(stdout);

  const jsFindings = scanText(workflowText, path.join(workflowsDir, "ci.yml"));

  assert.equal(jsFindings.length, pythonFindings.length);
  for (let i = 0; i < jsFindings.length; i++) {
    const js = jsFindings[i];
    const py = pythonFindings[i];
    assert.equal(js.scope, py.scope, `scope mismatch at index ${i}`);
    assert.equal(js.classification, py.classification, `classification mismatch at index ${i}`);
    assert.equal(js.line, py.line, `line mismatch at index ${i}`);
    assert.equal(js.detail, py.detail, `detail mismatch at index ${i}`);
  }
});

test("parity holds for a workflow with no risky trigger at all", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-self-hosted-parity-"));
  const workflowsDir = path.join(dir, ".github", "workflows");
  mkdirSync(workflowsDir, { recursive: true });
  const workflowText = `on: schedule
jobs:
  build:
    runs-on: self-hosted
    steps:
      - run: npm test
`;
  writeFileSync(path.join(workflowsDir, "ci.yml"), workflowText);

  const stdout = execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" });
  const pythonFindings = JSON.parse(stdout);
  const jsFindings = scanText(workflowText, path.join(workflowsDir, "ci.yml"));

  assert.deepEqual(jsFindings, pythonFindings);
});
