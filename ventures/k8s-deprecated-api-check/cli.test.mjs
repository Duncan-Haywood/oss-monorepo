import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const CLEAN = "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n";
const OLD_INGRESS =
  "apiVersion: extensions/v1beta1\nkind: Ingress\nmetadata:\n  name: web-ingress\nspec:\n  rules: []\n";

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
  assert.match(output, /--target-version/);
});

test("no subcommand exits 1 with usage", async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("check on a clean manifest exits 0", async () => {
  const { exitCode, output } = await run(["check", "m.yaml"], { readFile: fakeReadFile({ "m.yaml": CLEAN }) });
  assert.equal(exitCode, 0);
  assert.match(output, /0 deprecated or removed/);
});

test("check with no --target-version exits 1 on a known-removed API and lists it as informational", async () => {
  const { exitCode, output } = await run(["check", "m.yaml"], { readFile: fakeReadFile({ "m.yaml": OLD_INGRESS }) });
  assert.equal(exitCode, 1);
  assert.match(output, /extensions\/v1beta1/);
  assert.match(output, /networking\.k8s\.io\/v1/);
  assert.match(output, /No --target-version was given/);
});

test("check --target-version past removal exits 1 and says it would fail to apply", async () => {
  const { exitCode, output } = await run(["check", "m.yaml", "--target-version", "1.24"], {
    readFile: fakeReadFile({ "m.yaml": OLD_INGRESS }),
  });
  assert.equal(exitCode, 1);
  assert.match(output, /1 would fail to apply now/);
});

test("check --target-version before removal exits 0 without --strict", async () => {
  const { exitCode, output } = await run(["check", "m.yaml", "--target-version", "1.18"], {
    readFile: fakeReadFile({ "m.yaml": OLD_INGRESS }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /0 would fail to apply now, 1 still work/);
});

test("check --target-version before removal with --strict exits 1", async () => {
  const { exitCode } = await run(["check", "m.yaml", "--target-version", "1.18", "--strict"], {
    readFile: fakeReadFile({ "m.yaml": OLD_INGRESS }),
  });
  assert.equal(exitCode, 1);
});

test("check --json emits parseable JSON with the same totals", async () => {
  const { exitCode, output } = await run(["check", "m.yaml", "--json"], {
    readFile: fakeReadFile({ "m.yaml": OLD_INGRESS }),
  });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.findings[0].kind, "Ingress");
});

test("check on a missing file exits 2", async () => {
  const { exitCode, output } = await run(["check", "missing.yaml"], { readFile: fakeReadFile({}) });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("check on garbage input exits 2 with a readable error", async () => {
  const { exitCode, output } = await run(["check", "m.yaml"], { readFile: fakeReadFile({ "m.yaml": "   \n" }) });
  assert.equal(exitCode, 2);
  assert.match(output, /no YAML documents/);
});

test("check with an unparseable --target-version exits 2", async () => {
  const { exitCode, output } = await run(["check", "m.yaml", "--target-version", "banana"], {
    readFile: fakeReadFile({ "m.yaml": CLEAN }),
  });
  assert.equal(exitCode, 2);
  assert.match(output, /must look like/);
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
