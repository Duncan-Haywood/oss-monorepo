import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  scanText,
  scanFiles,
  hasRisk,
  summaryLine,
  SECRETS_INHERIT_EXTERNAL_WORKFLOW,
  SECRETS_INHERIT_UNTRUSTED_TRIGGER,
} from "./classify.mjs";

const EXTERNAL_WORKFLOW = `on: push
jobs:
  call-workflow:
    uses: octo-org/example-repo/.github/workflows/reusable.yml@main
    secrets: inherit
`;

test("flags secrets: inherit on an external reusable workflow", () => {
  const findings = scanText(EXTERNAL_WORKFLOW);
  const external = findings.filter((f) => f.type === SECRETS_INHERIT_EXTERNAL_WORKFLOW);
  assert.equal(external.length, 1);
  assert.equal(external[0].line, 5);
  assert.match(external[0].detail, /octo-org\/example-repo/);
});

test("a local reusable workflow call is not flagged as external", () => {
  const text = EXTERNAL_WORKFLOW.replace(
    "octo-org/example-repo/.github/workflows/reusable.yml@main",
    "./.github/workflows/reusable.yml",
  );
  const findings = scanText(text);
  assert.deepEqual(findings.filter((f) => f.type === SECRETS_INHERIT_EXTERNAL_WORKFLOW), []);
});

test("named secrets on an external workflow is not flagged", () => {
  const text = EXTERNAL_WORKFLOW.replace("secrets: inherit", "secrets:\n      TOKEN: ${{ secrets.TOKEN }}");
  const findings = scanText(text);
  assert.deepEqual(findings, []);
});

test("an ordinary action uses: with no workflows path is ignored", () => {
  const text = `on: push
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
`;
  assert.deepEqual(scanText(text), []);
});

test("secrets: inherit belonging to an unrelated later job is not attributed", () => {
  const text = `on: push
jobs:
  call-workflow:
    uses: octo-org/example-repo/.github/workflows/reusable.yml@main
  other-job:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
    secrets: inherit
`;
  const findings = scanText(text);
  assert.deepEqual(findings.filter((f) => f.type === SECRETS_INHERIT_EXTERNAL_WORKFLOW), []);
});

test("flags secrets: inherit reachable from pull_request_target", () => {
  const text = `on:
  pull_request_target:
jobs:
  call-workflow:
    uses: ./.github/workflows/reusable.yml
    secrets: inherit
`;
  const findings = scanText(text).filter((f) => f.type === SECRETS_INHERIT_UNTRUSTED_TRIGGER);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 6);
});

test("workflow_run trigger also flags", () => {
  const text = `on:
  workflow_run:
    workflows: [ci]
jobs:
  call-workflow:
    uses: ./.github/workflows/reusable.yml
    secrets: inherit
`;
  assert.equal(scanText(text).filter((f) => f.type === SECRETS_INHERIT_UNTRUSTED_TRIGGER).length, 1);
});

test("the same call under plain push is not flagged as untrusted", () => {
  const text = `on: push
jobs:
  call-workflow:
    uses: ./.github/workflows/reusable.yml
    secrets: inherit
`;
  assert.deepEqual(scanText(text).filter((f) => f.type === SECRETS_INHERIT_UNTRUSTED_TRIGGER), []);
});

test("an external call on an untrusted trigger flags both types", () => {
  const text = `on:
  pull_request_target:
jobs:
  call-workflow:
    uses: octo-org/example-repo/.github/workflows/reusable.yml@main
    secrets: inherit
`;
  const types = scanText(text).map((f) => f.type).sort();
  assert.deepEqual(types, [SECRETS_INHERIT_EXTERNAL_WORKFLOW, SECRETS_INHERIT_UNTRUSTED_TRIGGER].sort());
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const findings = scanFiles([
    { name: "a.yml", text: EXTERNAL_WORKFLOW },
    { name: "b.yml", text: "on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n" },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, "a.yml");
});

test("hasRisk and summaryLine", () => {
  assert.equal(hasRisk([]), false);
  assert.equal(summaryLine([]), "No findings.");
  const findings = scanText(EXTERNAL_WORKFLOW);
  assert.equal(hasRisk(findings), true);
  assert.match(summaryLine(findings), /1 secrets-inherit-external-workflow finding/);
});

test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-secrets-inherit-check-parity-"));
  try {
    const workflowsDir = path.join(dir, ".github", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    const workflowText =
      EXTERNAL_WORKFLOW.replace("on: push", "on:\n  pull_request_target:") +
      `
  other-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
    writeFileSync(path.join(workflowsDir, "ci.yml"), workflowText);

    const pyOutput = execFileSync(
      "python3",
      [path.join(import.meta.dirname, "check.py"), dir, "--format", "json"],
      { encoding: "utf8" },
    );
    const pyFindings = JSON.parse(pyOutput).map((f) => ({ ...f, file: path.basename(f.file) }));

    const jsFindings = scanText(workflowText, "ci.yml");

    assert.deepEqual(jsFindings, pyFindings);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
