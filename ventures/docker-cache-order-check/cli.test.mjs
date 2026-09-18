import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";

function makeFixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "docker-cache-order-check-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

test("--help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage: node cli\.mjs/);
});

test("scans a directory tree and finds a cache-order issue, exit 0 by default", async () => {
  const dir = makeFixture({ Dockerfile: "FROM node:20\nCOPY . .\nCOPY package.json ./\nRUN npm ci\n" });
  const { exitCode, output } = await run([dir]);
  assert.equal(exitCode, 0);
  assert.match(output, /manifest copied\/installed/);
  assert.match(output, /Scanned 1 Dockerfile/);
});

test("--fail-on-risk exits 2 when a finding exists", async () => {
  const dir = makeFixture({ Dockerfile: "FROM ubuntu:24.04\nRUN apt-get update\n" });
  const { exitCode } = await run([dir, "--fail-on-risk"]);
  assert.equal(exitCode, 2);
});

test("--fail-on-risk exits 0 on a clean Dockerfile", async () => {
  const dir = makeFixture({ Dockerfile: "FROM ubuntu:24.04\nRUN apt-get update && apt-get install -y curl\n" });
  const { exitCode, output } = await run([dir, "--fail-on-risk"]);
  assert.equal(exitCode, 0);
  assert.match(output, /No cache-order issues found/);
});

test("--format json emits parseable findings", async () => {
  const dir = makeFixture({ Dockerfile: "FROM python:3.12\nCOPY . .\nRUN pip install -r requirements.txt\n" });
  const { exitCode, output } = await run([dir, "--format", "json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].kind, "install-missing-manifest-copy");
});

test("discovers Dockerfile.* and *.dockerfile variants recursively, skipping node_modules", async () => {
  const dir = makeFixture({
    "svc-a/Dockerfile": "FROM node:20\nRUN apt-get update && apt-get install -y curl\n",
    "svc-b/Dockerfile.prod": "FROM node:20\nRUN apt-get update\n",
    "svc-c/build.dockerfile": "FROM node:20\nRUN apt-get update\n",
    "node_modules/some-pkg/Dockerfile": "FROM node:20\nRUN apt-get update\n",
  });
  const { output } = await run([dir, "--format", "json"]);
  const parsed = JSON.parse(output);
  assert.equal(parsed.length, 2);
  assert.ok(parsed.every((f) => !f.file.includes("node_modules")));
});

test("reports no Dockerfiles found for an empty directory", async () => {
  const dir = makeFixture({});
  const { exitCode, output } = await run([dir]);
  assert.equal(exitCode, 0);
  assert.match(output, /No Dockerfile/);
});
