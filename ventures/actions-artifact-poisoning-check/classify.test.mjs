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
  ARTIFACT_EXECUTED,
  UNSCOPED_ARTIFACT_DOWNLOAD,
} from "./classify.mjs";

const RISKY_WORKFLOW = `name: handle
on:
  workflow_run:
    workflows: [build]
    types: [completed]
jobs:
  run-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: test-results
      - name: Run it
        run: |
          chmod +x ./test-results/run.sh
          ./test-results/run.sh
`;

test("flags execution after download in the same job", () => {
  const findings = scanText(RISKY_WORKFLOW);
  const executed = findings.filter((f) => f.type === ARTIFACT_EXECUTED);
  assert.equal(executed.length, 1);
  assert.equal(executed[0].line, 15);
  assert.match(executed[0].detail, /line 11/);
});

test("a name: input avoids the unscoped finding but not the execution finding", () => {
  const findings = scanText(RISKY_WORKFLOW);
  assert.deepEqual(findings.map((f) => f.type), [ARTIFACT_EXECUTED]);
});

test("the dawidd6 third-party download action is also recognised", () => {
  const text = RISKY_WORKFLOW.replace(
    "uses: actions/download-artifact@v4",
    "uses: dawidd6/action-download-artifact@v3",
  );
  const findings = scanText(text).filter((f) => f.type === ARTIFACT_EXECUTED);
  assert.equal(findings.length, 1);
});

test("a plain pull_request trigger is not flagged", () => {
  const text = RISKY_WORKFLOW.replace(
    "  workflow_run:\n    workflows: [build]\n    types: [completed]\n",
    "  pull_request:\n",
  );
  assert.deepEqual(scanText(text), []);
});

test("a benign run step after a download is not flagged", () => {
  const text = RISKY_WORKFLOW.replace(
    '        run: |\n          chmod +x ./test-results/run.sh\n          ./test-results/run.sh\n',
    '        run: echo "done"\n',
  );
  assert.deepEqual(scanText(text), []);
});

test("a run step before the download is not attributed to it", () => {
  const text = `on:
  workflow_run:
jobs:
  handle:
    steps:
      - run: ./preexisting.sh
      - uses: actions/download-artifact@v4
`;
  const findings = scanText(text);
  assert.deepEqual(findings.map((f) => f.type), [UNSCOPED_ARTIFACT_DOWNLOAD]);
});

test("execution in a different job is not attributed", () => {
  const text = `on:
  workflow_run:
jobs:
  a:
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: x
  b:
    steps:
      - run: ./something.sh
`;
  assert.deepEqual(scanText(text), []);
});

test("a single-line run step is recognised", () => {
  const text = `on:
  workflow_run:
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: x
      - run: ./x/run.sh
`;
  assert.deepEqual(scanText(text).map((f) => f.type), [ARTIFACT_EXECUTED]);
});

test("download with no name is flagged", () => {
  const text = `on:
  workflow_run:
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
      - run: echo done
`;
  const findings = scanText(text).filter((f) => f.type === UNSCOPED_ARTIFACT_DOWNLOAD);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 6);
});

test("download with a name is not flagged", () => {
  const text = `on:
  workflow_run:
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: build-output
      - run: echo done
`;
  assert.deepEqual(scanText(text), []);
});

test("unscoped download on a trusted trigger is not flagged", () => {
  const text = `on: push
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
`;
  assert.deepEqual(scanText(text), []);
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const findings = scanFiles([
    { name: "a.yml", text: RISKY_WORKFLOW },
    { name: "b.yml", text: "on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n" },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, "a.yml");
});

test("hasRisk and summaryLine", () => {
  assert.equal(hasRisk([]), false);
  assert.equal(summaryLine([]), "No findings.");
  const findings = scanText(RISKY_WORKFLOW);
  assert.equal(hasRisk(findings), true);
  assert.match(summaryLine(findings), /1 artifact-executed-after-untrusted-download finding/);
});

test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-artifact-poisoning-check-parity-"));
  try {
    const workflowsDir = path.join(dir, ".github", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    const workflowText = `on:
  workflow_run:
jobs:
  handle:
    steps:
      - uses: actions/download-artifact@v4
      - run: |
          chmod +x ./x/run.sh
          ./x/run.sh
  other:
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: y
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
