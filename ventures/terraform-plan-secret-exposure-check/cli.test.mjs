import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const CLEAN_PLAN = JSON.stringify({
  format_version: "1.2",
  resource_changes: [
    {
      address: "aws_instance.web",
      change: { after: { instance_type: "t3.micro", ami: "ami-0abcd1234" }, after_sensitive: {} },
    },
  ],
  output_changes: {},
});

const LEAKY_PLAN = JSON.stringify({
  format_version: "1.2",
  resource_changes: [
    {
      address: "aws_ssm_parameter.example",
      change: { after: { value: "AKIAABCDEFGHIJKLMNOP" }, after_sensitive: {} },
    },
  ],
  output_changes: {},
});

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
  assert.match(output, /terraform show -json/);
});

test("no subcommand exits 1 with usage", async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("check on a clean plan exits 0", async () => {
  const { exitCode, output } = await run(["check", "plan.json"], { readFile: fakeReadFile({ "plan.json": CLEAN_PLAN }) });
  assert.equal(exitCode, 0);
  assert.match(output, /0 unmarked secret-shaped value/);
});

test("check on a leaky plan exits 1 and redacts the value", async () => {
  const { exitCode, output } = await run(["check", "plan.json"], { readFile: fakeReadFile({ "plan.json": LEAKY_PLAN }) });
  assert.equal(exitCode, 1);
  assert.match(output, /aws-access-key-id/);
  assert.doesNotMatch(output, /AKIAABCDEFGHIJKLMNOP/);
  assert.match(output, /sensitive = true/);
});

test("check --json emits parseable JSON with the same totals", async () => {
  const { exitCode, output } = await run(["check", "plan.json", "--json"], { readFile: fakeReadFile({ "plan.json": LEAKY_PLAN }) });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.resourcesChecked, 1);
});

test("check on a missing file exits 2 with a readable error", async () => {
  const { exitCode, output } = await run(["check", "missing.json"], { readFile: fakeReadFile({}) });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("check on non-plan JSON exits 2 naming the right command", async () => {
  const { exitCode, output } = await run(["check", "plan.json"], { readFile: fakeReadFile({ "plan.json": '{"foo": "bar"}' }) });
  assert.equal(exitCode, 2);
  assert.match(output, /resource_changes/);
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
