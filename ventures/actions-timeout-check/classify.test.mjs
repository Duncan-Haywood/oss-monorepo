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
  JOB_MISSING_TIMEOUT,
  JOB_TIMEOUT_AT_DEFAULT,
} from "./classify.mjs";

const SAMPLE = `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
        timeout-minutes: 5
  mac:
    runs-on: macos-latest
    timeout-minutes: 360
    steps:
      - run: x
  ok:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: x
  call:
    uses: ./.github/workflows/r.yml
  win:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - run: x
`;

test("flags a job with no job-level timeout-minutes, ignoring a step-level one", () => {
  const f = scanText(SAMPLE).filter((x) => x.type === JOB_MISSING_TIMEOUT);
  assert.deepEqual(f.map((x) => x.line), [4, 21]);
  assert.match(f[0].detail, /job 'test'/);
  assert.match(f[0].detail, /up to 360 billed min/);
});

test("flags a timeout restating the 360-minute default, with the macOS multiplier", () => {
  const f = scanText(SAMPLE).filter((x) => x.type === JOB_TIMEOUT_AT_DEFAULT);
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 9);
  assert.match(f[0].detail, /3,600 billed min/);
});

test("a matrix runner expression picks up the Windows multiplier from the job body", () => {
  const f = scanText(SAMPLE).find((x) => x.line === 21);
  assert.match(f.detail, /720 billed min/);
});

test("a sensible timeout, and a reusable-workflow call, are not flagged", () => {
  const names = scanText(SAMPLE).map((x) => x.detail);
  assert.ok(!names.some((d) => d.includes("job 'ok'")));
  assert.ok(!names.some((d) => d.includes("job 'call'")));
});

test("a timeout set by expression is trusted, not flagged", () => {
  const text = "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    timeout-minutes: ${{ vars.T }}\n";
  assert.deepEqual(scanText(text), []);
});

test("self-hosted runners are flagged without a billing multiplier", () => {
  const text = "on: push\njobs:\n  a:\n    runs-on: [self-hosted, linux]\n    steps: []\n";
  const f = scanText(text);
  assert.equal(f.length, 1);
  assert.match(f[0].detail, /not metered by GitHub/);
});

test("a file with no jobs mapping yields nothing", () => {
  assert.deepEqual(scanText("on: push\n"), []);
});

test("scanFiles/hasRisk/summaryLine", () => {
  const findings = scanFiles([{ name: "ci.yml", text: SAMPLE }]);
  assert.equal(findings[0].file, "ci.yml");
  assert.ok(hasRisk(findings));
  assert.equal(summaryLine(findings), "2 job-missing-timeout findings, 1 job-timeout-at-default finding.");
  assert.equal(summaryLine([]), "No findings.");
});

test("parity: classify.mjs and check.py agree on the same workflow", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "timeout-parity-"));
  try {
    mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(path.join(dir, ".github", "workflows", "ci.yml"), SAMPLE);
    const out = execFileSync(
      "python3",
      [new URL("./check.py", import.meta.url).pathname, dir, "--format", "json"],
      { encoding: "utf8" },
    );
    const py = JSON.parse(out).map(({ line, type, detail, remediation }) => ({ line, type, detail, remediation }));
    const js = scanText(SAMPLE).map(({ line, type, detail, remediation }) => ({ line, type, detail, remediation }));
    assert.deepEqual(js, py);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
