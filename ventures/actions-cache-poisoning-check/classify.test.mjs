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
  CACHE_WRITE_ON_UNTRUSTED_TRIGGER,
  UNSCOPED_RESTORE_KEYS,
} from "./classify.mjs";

const UNTRUSTED_WORKFLOW = `name: pr
on:
  pull_request_target:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: ~/.pnpm-store
          key: pnpm-\${{ github.event.pull_request.head.sha }}
      - run: pnpm install
`;

test("flags the unified cache action under pull_request_target", () => {
  const findings = scanText(UNTRUSTED_WORKFLOW);
  const writes = findings.filter((f) => f.type === CACHE_WRITE_ON_UNTRUSTED_TRIGGER);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].line, 9);
  assert.equal(writes[0].detail, "actions/cache");
});

test("the same cache step under plain pull_request is not flagged", () => {
  const text = UNTRUSTED_WORKFLOW.replace("pull_request_target:", "pull_request:");
  const findings = scanText(text);
  assert.deepEqual(findings.filter((f) => f.type === CACHE_WRITE_ON_UNTRUSTED_TRIGGER), []);
});

test("explicit actions/cache/save is flagged", () => {
  const text = UNTRUSTED_WORKFLOW.replace("uses: actions/cache@v4", "uses: actions/cache/save@v4");
  const findings = scanText(text);
  assert.equal(findings.filter((f) => f.type === CACHE_WRITE_ON_UNTRUSTED_TRIGGER).length, 1);
});

test("read-only actions/cache/restore is not a write finding", () => {
  const text = UNTRUSTED_WORKFLOW.replace("uses: actions/cache@v4", "uses: actions/cache/restore@v4");
  const findings = scanText(text);
  assert.deepEqual(findings.filter((f) => f.type === CACHE_WRITE_ON_UNTRUSTED_TRIGGER), []);
});

test("cache step on a trusted trigger is not flagged", () => {
  const text = `on: push
jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: pnpm-\${{ hashFiles('pnpm-lock.yaml') }}
`;
  assert.deepEqual(scanText(text).filter((f) => f.type === CACHE_WRITE_ON_UNTRUSTED_TRIGGER), []);
});

test("restore-keys on the unified cache action is flagged regardless of trigger", () => {
  const text = `on: push
jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: pnpm-\${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            pnpm-
`;
  const findings = scanText(text).filter((f) => f.type === UNSCOPED_RESTORE_KEYS);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 8);
});

test("restore-keys on a save-only step is not flagged", () => {
  const text = `on: push
jobs:
  build:
    steps:
      - uses: actions/cache/save@v4
        with:
          key: pnpm-\${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: pnpm-
`;
  assert.deepEqual(scanText(text).filter((f) => f.type === UNSCOPED_RESTORE_KEYS), []);
});

test("cache step without restore-keys is not flagged", () => {
  const text = `on: push
jobs:
  build:
    steps:
      - uses: actions/cache@v4
        with:
          key: pnpm-\${{ hashFiles('pnpm-lock.yaml') }}
`;
  assert.deepEqual(scanText(text), []);
});

test("scanFiles concatenates findings across pasted files in order", () => {
  const findings = scanFiles([
    { name: "a.yml", text: UNTRUSTED_WORKFLOW },
    { name: "b.yml", text: "on: push\njobs:\n  b:\n    steps:\n      - run: echo hi\n" },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, "a.yml");
});

test("hasRisk and summaryLine", () => {
  assert.equal(hasRisk([]), false);
  assert.equal(summaryLine([]), "No findings.");
  const findings = scanText(UNTRUSTED_WORKFLOW);
  assert.equal(hasRisk(findings), true);
  assert.match(summaryLine(findings), /1 cache-write-on-untrusted-trigger finding/);
});

test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-cache-poisoning-check-parity-"));
  try {
    const workflowsDir = path.join(dir, ".github", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    const workflowText =
      UNTRUSTED_WORKFLOW +
      `
  extra:
    steps:
      - uses: actions/cache/restore@v4
        with:
          key: pnpm-\${{ hashFiles('pnpm-lock.yaml') }}
          restore-keys: |
            pnpm-
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
