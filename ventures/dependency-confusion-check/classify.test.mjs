import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  scanPipText,
  scanNpm,
  hasRisk,
  summaryLine,
  PIP_EXTRA_INDEX_URL,
  NPM_UNSCOPED_PRIVATE_DEPENDENCY,
} from "./classify.mjs";

test("flags --extra-index-url in a requirements-style file", () => {
  const findings = scanPipText("--extra-index-url https://pkgs.internal.example.com/simple/\nrequests==2.31.0\n");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, PIP_EXTRA_INDEX_URL);
  assert.equal(findings[0].line, 1);
});

test("a commented-out line is not flagged", () => {
  const findings = scanPipText("# --extra-index-url https://x\nrequests==2.31.0\n");
  assert.deepEqual(findings, []);
});

test("--index-url alone is not flagged", () => {
  const findings = scanPipText("--index-url https://pkgs.internal.example.com/simple/\n");
  assert.deepEqual(findings, []);
});

test("flags --extra-index-url inside a workflow pip install step", () => {
  const text =
    "on: push\njobs:\n  build:\n    steps:\n" +
    "      - run: pip install -r requirements.txt --extra-index-url https://pkgs.internal.example.com/simple/\n";
  const findings = scanPipText(text, ".github/workflows/ci.yml");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 5);
});

const PACKAGE_JSON = JSON.stringify(
  {
    name: "acme-service",
    dependencies: { "acme-internal-utils": "^1.0.0", "@acme/other-internal": "^2.0.0", "left-pad": "^1.3.0" },
    devDependencies: { "acme-test-helpers": "^0.1.0" },
  },
  null,
  2,
);

test("unscoped names are flagged when .npmrc sets a private registry, scoped ones are not", () => {
  const findings = scanNpm(PACKAGE_JSON, "registry=https://npm.internal.example.com/\n");
  assert.equal(findings.length, 3);
  const details = findings.map((f) => f.detail).join(" | ");
  assert.match(details, /acme-internal-utils/);
  assert.match(details, /acme-test-helpers/);
  assert.match(details, /left-pad/);
  assert.doesNotMatch(details, /@acme\/other-internal/);
  for (const f of findings) assert.equal(f.type, NPM_UNSCOPED_PRIVATE_DEPENDENCY);
});

test("no .npmrc means no findings", () => {
  assert.deepEqual(scanNpm(PACKAGE_JSON, ""), []);
});

test(".npmrc pointing at the public registry is not flagged", () => {
  assert.deepEqual(scanNpm(PACKAGE_JSON, "registry=https://registry.npmjs.org/\n"), []);
});

test("a scope-only registry override is not flagged", () => {
  assert.deepEqual(scanNpm(PACKAGE_JSON, "@acme:registry=https://npm.internal.example.com/\n"), []);
});

test("invalid JSON is ignored, not thrown", () => {
  assert.deepEqual(scanNpm("not json", "registry=https://npm.internal.example.com/\n"), []);
});

test("hasRisk and summaryLine", () => {
  assert.equal(hasRisk([]), false);
  assert.equal(summaryLine([]), "No findings.");
  const findings = scanPipText("--extra-index-url https://x\n");
  assert.equal(hasRisk(findings), true);
  assert.match(summaryLine(findings), /1 pip-extra-index-url finding/);
});

test("the browser port and the Python CLI produce identical pip findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dependency-confusion-check-parity-"));
  try {
    const requirementsText = "--extra-index-url https://pkgs.internal.example.com/simple/\nrequests==2.31.0\n";
    writeFileSync(path.join(dir, "requirements.txt"), requirementsText);

    const pyOutput = execFileSync(
      "python3",
      [path.join(import.meta.dirname, "check.py"), dir, "--format", "json"],
      { encoding: "utf8" },
    );
    const pyFindings = JSON.parse(pyOutput).map((f) => ({ ...f, file: path.basename(f.file) }));

    const jsFindings = scanPipText(requirementsText, "requirements.txt");

    assert.deepEqual(jsFindings, pyFindings);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the browser port and the Python CLI produce identical npm findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "dependency-confusion-check-parity-npm-"));
  try {
    writeFileSync(path.join(dir, "package.json"), PACKAGE_JSON);
    writeFileSync(path.join(dir, ".npmrc"), "registry=https://npm.internal.example.com/\n");

    const pyOutput = execFileSync(
      "python3",
      [path.join(import.meta.dirname, "check.py"), dir, "--format", "json"],
      { encoding: "utf8" },
    );
    const pyFindings = JSON.parse(pyOutput).map((f) => ({ ...f, file: path.basename(f.file) }));

    const jsFindings = scanNpm(PACKAGE_JSON, "registry=https://npm.internal.example.com/\n", "package.json");

    assert.deepEqual(jsFindings, pyFindings);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
