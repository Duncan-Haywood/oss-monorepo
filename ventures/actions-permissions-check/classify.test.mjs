import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPLICIT,
  WRITE_ALL,
  UNSPECIFIED,
  scanText,
  scanFiles,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
} from "./classify.mjs";

const CLI = fileURLToPath(new URL("./check.py", import.meta.url));

test("no permissions key and no jobs is unspecified", () => {
  const findings = scanText("name: ci\non: push\n", "wf.yml");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].classification, UNSPECIFIED);
  assert.equal(findings[0].scope, "workflow");
});

test("workflow-level write-all is flagged", () => {
  const text = "name: ci\npermissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const findings = scanText(text, "wf.yml");
  const top = findings.find((f) => f.scope === "workflow");
  assert.equal(top.classification, WRITE_ALL);
  assert.equal(top.line, 2);
});

test("workflow-level read-all is explicit", () => {
  const text = "permissions: read-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const top = scanText(text, "wf.yml").find((f) => f.scope === "workflow");
  assert.equal(top.classification, EXPLICIT);
});

test("workflow-level block mapping is explicit and lists scopes", () => {
  const text = "permissions:\n  contents: read\n  pull-requests: write\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const top = scanText(text, "wf.yml").find((f) => f.scope === "workflow");
  assert.equal(top.classification, EXPLICIT);
  assert.match(top.detail, /contents: read/);
  assert.match(top.detail, /pull-requests: write/);
});

test("job with no permissions and no workflow-level is unspecified", () => {
  const text = "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, UNSPECIFIED);
});

test("job inherits explicit workflow-level grant", () => {
  const text = "permissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, EXPLICIT);
  assert.match(job.detail, /inherited/);
});

test("job inherits write-all from workflow level", () => {
  const text = "permissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, WRITE_ALL);
});

test("job-level permissions overrides workflow-level write-all", () => {
  const text = "permissions: write-all\njobs:\n  build:\n    permissions:\n      contents: read\n    runs-on: ubuntu-latest\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, EXPLICIT);
});

test("job-level write-all is flagged even with a scoped workflow level", () => {
  const text = "permissions:\n  contents: read\njobs:\n  build:\n    permissions: write-all\n    runs-on: ubuntu-latest\n";
  const job = scanText(text, "wf.yml").find((f) => f.scope === "job:build");
  assert.equal(job.classification, WRITE_ALL);
});

test("multiple jobs are scanned independently", () => {
  const text = `jobs:
  build:
    permissions:
      contents: read
    runs-on: ubuntu-latest
  deploy:
    runs-on: ubuntu-latest
`;
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.find((f) => f.scope === "job:build").classification, EXPLICIT);
  assert.equal(findings.find((f) => f.scope === "job:deploy").classification, UNSPECIFIED);
});

test("a commented-out permissions line is ignored", () => {
  const text = "# permissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n";
  const findings = scanText(text, "wf.yml");
  assert.equal(findings.find((f) => f.scope === "workflow"), undefined);
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const files = [
    { name: "ci.yml", text: "jobs:\n  build:\n    runs-on: ubuntu-latest\n" },
    { name: "deploy.yml", text: "permissions:\n  contents: read\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n" },
  ];
  const findings = scanFiles(files);
  assert.equal(findings[0].file, "ci.yml");
  assert.equal(findings.at(-1).file, "deploy.yml");
});

test("hasUnresolvedRisk is true only when write-all or unspecified exists", () => {
  assert.equal(hasUnresolvedRisk([{ classification: EXPLICIT }, { classification: WRITE_ALL }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: EXPLICIT }, { classification: UNSPECIFIED }]), true);
  assert.equal(hasUnresolvedRisk([{ classification: EXPLICIT }]), false);
  assert.equal(hasUnresolvedRisk([]), false);
});

test("classificationCounts tallies by classification", () => {
  const text = "permissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n  deploy:\n    permissions: write-all\n    runs-on: ubuntu-latest\n";
  const counts = classificationCounts(scanText(text, "wf.yml"));
  assert.equal(counts[EXPLICIT], 2); // workflow-level + build (inherited)
  assert.equal(counts[WRITE_ALL], 1); // deploy
});

test("summaryLine flags risky findings", () => {
  const findings = scanText("jobs:\n  build:\n    runs-on: ubuntu-latest\n", "wf.yml");
  assert.match(summaryLine(findings), /1 risky finding/);
});

test("summaryLine reports a clean scan", () => {
  const findings = scanText("permissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n", "wf.yml");
  assert.match(summaryLine(findings), /explicit permissions grant/);
});

// The guard that matters most: the CLI and the browser port must never
// disagree about what a workflow's or job's permissions mean. Both are run
// over the same workflow text and their findings compared field for field,
// so a classification rule changed in one file and not the other fails here
// rather than showing a visitor a different verdict than their own CI run.
test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-permissions-parity-"));
  const workflowsDir = path.join(dir, ".github", "workflows");
  mkdirSync(workflowsDir, { recursive: true });
  const workflowText = `name: ci
on: pull_request_target
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
  deploy:
    permissions: write-all
    runs-on: ubuntu-latest
    steps:
      - run: npm run deploy
  notify:
    permissions:
      issues: write
    runs-on: ubuntu-latest
    steps:
      - run: echo notify
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

test("parity holds for an unspecified job with no workflow-level grant at all", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-permissions-parity-"));
  const workflowsDir = path.join(dir, ".github", "workflows");
  mkdirSync(workflowsDir, { recursive: true });
  const workflowText = `on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;
  writeFileSync(path.join(workflowsDir, "ci.yml"), workflowText);

  const stdout = execFileSync("python3", [CLI, dir, "--format", "json"], { encoding: "utf8" });
  const pythonFindings = JSON.parse(stdout);
  const jsFindings = scanText(workflowText, path.join(workflowsDir, "ci.yml"));

  assert.deepEqual(jsFindings, pythonFindings);
});
