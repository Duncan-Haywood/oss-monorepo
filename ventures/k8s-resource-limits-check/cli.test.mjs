import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const CLEAN = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      containers:
      - name: web
        resources:
          requests: {cpu: 250m, memory: 128Mi}
          limits: {memory: 256Mi, ephemeral-storage: 1Gi}
`;

const UNBOUNDED = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      containers:
      - name: web
        resources: {}
`;

function fakeReadFile(files) {
  return async (p) => {
    if (!(p in files)) throw new Error(`ENOENT: no such file, open '${p}'`);
    return files[p];
  };
}

test("--help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
  assert.match(output, /--fail-on-risk/);
});

test("no subcommand exits 1 with usage", async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("check on a clean manifest exits 0 and says so", async () => {
  const { exitCode, output } = await run(["check", "m.yaml"], { readFile: fakeReadFile({ "m.yaml": CLEAN }) });
  assert.equal(exitCode, 0);
  assert.match(output, /No resource-limit problems/);
});

test("check on an unbounded container exits 0 without --fail-on-risk (informational by default)", async () => {
  const { exitCode, output } = await run(["check", "m.yaml"], { readFile: fakeReadFile({ "m.yaml": UNBOUNDED }) });
  assert.equal(exitCode, 0);
  assert.match(output, /left unbounded or invalid/);
  assert.match(output, /no-memory-limit|No memory limit/i);
});

test("check --fail-on-risk exits 1 on an unbounded container", async () => {
  const { exitCode } = await run(["check", "m.yaml", "--fail-on-risk"], {
    readFile: fakeReadFile({ "m.yaml": UNBOUNDED }),
  });
  assert.equal(exitCode, 1);
});

test("check --fail-on-risk exits 0 on a merely review-level (WARN-only) manifest", async () => {
  const warnOnly = `apiVersion: v1
kind: Pod
metadata:
  name: web
spec:
  containers:
  - name: web
    resources:
      requests: {}
      limits: {memory: 256Mi, ephemeral-storage: 1Gi}
`;
  const { exitCode, output } = await run(["check", "m.yaml", "--fail-on-risk"], {
    readFile: fakeReadFile({ "m.yaml": warnOnly }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /worth reviewing/);
});

test("check --json emits parseable JSON with the same totals", async () => {
  const { exitCode, output } = await run(["check", "m.yaml", "--json", "--fail-on-risk"], {
    readFile: fakeReadFile({ "m.yaml": UNBOUNDED }),
  });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.counts.risk, 1);
  assert.ok(parsed.findings.some((f) => f.id === "no-memory-limit"));
});

test("check on a missing file exits 2", async () => {
  const { exitCode, output } = await run(["check", "missing.yaml"], { readFile: fakeReadFile({}) });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("check on unparseable YAML exits 2 with a readable error", async () => {
  const { exitCode, output } = await run(["check", "m.yaml"], {
    readFile: fakeReadFile({ "m.yaml": "foo: &a bar\nbaz: *a\n" }),
  });
  assert.equal(exitCode, 2);
  assert.match(output, /Error parsing/);
});

test("check with no path argument exits 2", async () => {
  const { exitCode } = await run(["check"]);
  assert.equal(exitCode, 2);
});

test("unknown subcommand exits 2", async () => {
  const { exitCode, output } = await run(["frobnicate"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});

test("skipped resources (no recognised pod template) are named in the output", async () => {
  const mixed = `apiVersion: v1
kind: ConfigMap
metadata:
  name: settings
data: {}
---
${CLEAN}`;
  const { output } = await run(["check", "m.yaml"], { readFile: fakeReadFile({ "m.yaml": mixed }) });
  assert.match(output, /Skipped/);
  assert.match(output, /ConfigMap\/settings/);
});
