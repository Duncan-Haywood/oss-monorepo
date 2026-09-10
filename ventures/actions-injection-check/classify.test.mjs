import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  untrustedContextPaths,
  hasUntrustedCheckoutRef,
  scanText,
  scanFiles,
  hasRisk,
  summaryLine,
  PWN_REQUEST_CHECKOUT,
  SCRIPT_INJECTION,
} from "./classify.mjs";

test("title is untrusted", () => {
  assert.deepEqual(untrustedContextPaths("${{ github.event.pull_request.title }}"), [
    "github.event.pull_request.title",
  ]);
});

test("body is untrusted", () => {
  assert.deepEqual(untrustedContextPaths("${{ github.event.issue.body }}"), ["github.event.issue.body"]);
});

test("bare head_ref is untrusted", () => {
  assert.deepEqual(untrustedContextPaths("${{ github.head_ref }}"), ["github.head_ref"]);
});

test("number is not untrusted", () => {
  assert.deepEqual(untrustedContextPaths("${{ github.event.pull_request.number }}"), []);
});

test("full_name is not untrusted", () => {
  assert.deepEqual(untrustedContextPaths("${{ github.event.repository.full_name }}"), []);
});

test("finds a path embedded in a function call", () => {
  assert.deepEqual(
    untrustedContextPaths("${{ format('hello {0}', github.event.pull_request.title) }}"),
    ["github.event.pull_request.title"],
  );
});

test("hasUntrustedCheckoutRef flags pr head sha and bare head_ref", () => {
  assert.ok(hasUntrustedCheckoutRef("${{ github.event.pull_request.head.sha }}"));
  assert.ok(hasUntrustedCheckoutRef("${{ github.head_ref }}"));
  assert.ok(hasUntrustedCheckoutRef("${{ github.event.workflow_run.head_sha }}"));
  assert.ok(!hasUntrustedCheckoutRef("main"));
  assert.ok(!hasUntrustedCheckoutRef("${{ github.event.pull_request.base.ref }}"));
});

const UNTRUSTED_WORKFLOW = `name: pr
on:
  pull_request_target:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm test
`;

test("flags an untrusted checkout ref under pull_request_target", () => {
  const findings = scanText(UNTRUSTED_WORKFLOW);
  const pwn = findings.filter((f) => f.type === PWN_REQUEST_CHECKOUT);
  assert.equal(pwn.length, 1);
  assert.equal(pwn[0].line, 10);
});

test("the same checkout under plain pull_request is not flagged", () => {
  const text = UNTRUSTED_WORKFLOW.replace("pull_request_target:", "pull_request:");
  const findings = scanText(text);
  assert.deepEqual(findings.filter((f) => f.type === PWN_REQUEST_CHECKOUT), []);
});

test("checkout with no ref is not flagged", () => {
  const text = `on:
  pull_request_target:
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
  assert.deepEqual(scanText(text).filter((f) => f.type === PWN_REQUEST_CHECKOUT), []);
});

test("a ref belonging to a later unrelated step is not attributed to checkout", () => {
  const text = `on:
  pull_request_target:
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - uses: some/other-action@v1
        with:
          ref: \${{ github.event.pull_request.head.sha }}
`;
  assert.deepEqual(scanText(text).filter((f) => f.type === PWN_REQUEST_CHECKOUT), []);
});

test("single-line run with untrusted title is flagged", () => {
  const text = `on: pull_request
jobs:
  build:
    steps:
      - run: echo "\${{ github.event.pull_request.title }}"
`;
  const findings = scanText(text).filter((f) => f.type === SCRIPT_INJECTION);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 5);
});

test("block scalar run is scanned line by line", () => {
  const text = `on: issue_comment
jobs:
  build:
    steps:
      - run: |
          echo "start"
          echo "\${{ github.event.comment.body }}"
          echo "done"
`;
  const findings = scanText(text).filter((f) => f.type === SCRIPT_INJECTION);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 7);
});

test("block scalar ends at dedent, not at the next run", () => {
  const text = `on: pull_request
jobs:
  build:
    steps:
      - run: |
          echo "safe"
      - run: echo "\${{ github.event.pull_request.title }}"
`;
  const findings = scanText(text).filter((f) => f.type === SCRIPT_INJECTION);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 7);
});

test("env indirection (the safe pattern) is not flagged", () => {
  const text = `on: pull_request
jobs:
  build:
    steps:
      - env:
          TITLE: \${{ github.event.pull_request.title }}
        run: echo "$TITLE"
`;
  assert.deepEqual(scanText(text), []);
});

test("script injection is flagged regardless of trigger type", () => {
  const text = `on: push
jobs:
  build:
    steps:
      - run: echo "\${{ github.event.head_commit.message }}"
`;
  assert.equal(scanText(text).filter((f) => f.type === SCRIPT_INJECTION).length, 1);
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const findings = scanFiles([
    { name: "a.yml", text: `on: push\njobs:\n  b:\n    steps:\n      - run: echo "\${{ github.event.head_commit.message }}"\n` },
    { name: "b.yml", text: `on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n` },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, "a.yml");
});

test("hasRisk and summaryLine", () => {
  assert.equal(hasRisk([]), false);
  assert.equal(summaryLine([]), "No findings.");
  const findings = scanText(UNTRUSTED_WORKFLOW);
  assert.equal(hasRisk(findings), true);
  assert.match(summaryLine(findings), /1 pwn-request checkout finding/);
});

test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-injection-check-parity-"));
  try {
    const workflowsDir = path.join(dir, ".github", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    const workflowText = UNTRUSTED_WORKFLOW + `
  extra:
    steps:
      - run: |
          echo "\${{ github.event.issue.body }}"
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
