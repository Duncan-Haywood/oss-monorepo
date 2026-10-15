import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanText, scanFiles, hasRisk, summaryLine, WITH_UPLOAD, PERSISTS } from "./check.mjs";

const SAMPLE = `name: ci
on: push
jobs:
  plain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make
  safe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - run: make
  safe_named:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
  exported:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-artifact@v4
        with:
          path: .
  neighbour_is_safe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: o/r
          persist-credentials: false
`;

test("same lines and types as test_check.py", () => {
  assert.deepEqual(
    scanText(SAMPLE).map((f) => [f.line, f.type]),
    [[7, PERSISTS], [27, WITH_UPLOAD], [34, PERSISTS]],
  );
});

test("expression value is trusted; no jobs is clean; cache counts as export", () => {
  const e = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          persist-credentials: ${{ inputs.p }}\n";
  assert.deepEqual(scanText(e), []);
  assert.deepEqual(scanText("name: x\non: push\n"), []);
  const c = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/cache@v4\n";
  assert.equal(scanText(c)[0].type, WITH_UPLOAD);
});

test("CRLF input gives the same findings", () => {
  assert.deepEqual(scanText(SAMPLE.replace(/\n/g, "\r\n")), scanText(SAMPLE));
});

test("scanFiles keeps file names; summary and risk reflect findings", () => {
  const f = scanFiles([{ name: "a.yml", text: SAMPLE }, { name: "b.yml", text: "name: x\n" }]);
  assert.equal(f.length, 3);
  assert.ok(f.every((x) => x.file === "a.yml"));
  assert.ok(hasRisk(f));
  assert.match(summaryLine(f), /3 checkout step/);
  assert.match(summaryLine([]), /No checkout steps/);
});

test("parity: findings equal `python3 check.py --format json` on the same input", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-"));
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), SAMPLE);
  let out;
  try {
    out = execFileSync("python3", [new URL("./check.py", import.meta.url).pathname, root, "--format", "json"], { encoding: "utf8" });
  } catch {
    return; // python3 absent: the Python suite still covers the CLI
  }
  const py = JSON.parse(out).map((f) => ({ ...f, file: "x" }));
  const js = scanText(SAMPLE, "x");
  assert.deepEqual(js, py);
});
