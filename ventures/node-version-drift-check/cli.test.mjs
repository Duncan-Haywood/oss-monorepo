import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";

function makeFixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "node-version-drift-check-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}
const TODAY = ["--today", "2026-10-11"];
const PKG = (range) => JSON.stringify({ name: "x", engines: { node: range } });

test("--help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage: node cli\.mjs/);
});

test("finds drift in a directory tree, exit 0 by default", async () => {
  const dir = makeFixture({ "package.json": PKG(">=22"), ".nvmrc": "20\n" });
  const { exitCode, output } = await run([dir, ...TODAY]);
  assert.equal(exitCode, 0);
  assert.match(output, /pin-violates-engines/);
  assert.match(output, /Read 2 file/);
});

test("--fail-on-risk exits 2 when a risk finding exists", async () => {
  const dir = makeFixture({ "package.json": PKG("^22"), ".nvmrc": "18" });
  const { exitCode } = await run([dir, "--fail-on-risk", ...TODAY]);
  assert.equal(exitCode, 2);
});

test("--fail-on-risk exits 0 on a consistent repo", async () => {
  const dir = makeFixture({
    "package.json": PKG(">=22 <25"),
    ".nvmrc": "22.11.0\n",
    Dockerfile: "FROM node:22-alpine\n",
    ".github/workflows/ci.yml": "jobs:\n  t:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version-file: .nvmrc\n",
  });
  const { exitCode, output } = await run([dir, "--fail-on-risk", ...TODAY]);
  assert.equal(exitCode, 0);
  assert.match(output, /No Node\.js version drift found/);
});

test("--format json emits a parseable report", async () => {
  const dir = makeFixture({ "package.json": PKG(">=18") });
  const { exitCode, output } = await run([dir, "--format", "json", ...TODAY]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.today, "2026-10-11");
  assert.ok(parsed.findings.some((f) => f.kind === "engines-unbounded"));
});

test("--today changes the end-of-life verdict", async () => {
  const dir = makeFixture({ ".nvmrc": "20" });
  const before = JSON.parse((await run([dir, "--format", "json", "--today", "2026-01-01"])).output);
  const after = JSON.parse((await run([dir, "--format", "json", "--today", "2026-06-01"])).output);
  assert.equal(before.findings.some((f) => f.kind === "eol-node"), false);
  assert.equal(after.findings.some((f) => f.kind === "eol-node"), true);
});

test("discovers nested package.json, Dockerfile variants and workflows, skipping node_modules", async () => {
  const dir = makeFixture({
    "services/api/package.json": PKG("^20"),
    "services/api/Dockerfile.prod": "FROM node:18\n",
    "node_modules/x/.nvmrc": "10\n",
    ".github/workflows/ci.yaml": "jobs:\n  t:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n",
  });
  const { output } = await run([dir, "--format", "json", ...TODAY]);
  const parsed = JSON.parse(output);
  assert.ok(parsed.pins.every((p) => !p.file.includes("node_modules")));
  assert.ok(parsed.findings.some((f) => f.kind === "pin-violates-engines" && f.file === "services/api/Dockerfile.prod"));
});

test("reports a clear message for an empty directory", async () => {
  const dir = makeFixture({});
  const { exitCode, output } = await run([dir]);
  assert.equal(exitCode, 0);
  assert.match(output, /No package\.json/);
});

test("rejects a bad --today, --format or option with exit 2", async () => {
  assert.equal((await run(["--today", "yesterday"])).exitCode, 2);
  assert.equal((await run(["--format", "xml"])).exitCode, 2);
  assert.equal((await run(["--bogus"])).exitCode, 2);
});
