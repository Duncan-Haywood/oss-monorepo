import test from "node:test";
import assert from "node:assert/strict";
import { run, parseArgs, FAIL_MODES } from "./cli.mjs";

const SAFE_PLAN = JSON.stringify({
  resource_changes: [
    { address: "aws_instance.web", mode: "managed", type: "aws_instance", change: { actions: ["update"] } },
    { address: "aws_iam_role.app", mode: "managed", type: "aws_iam_role", change: { actions: ["create"] } },
  ],
});

const STATEFUL_REPLACE_PLAN = JSON.stringify({
  resource_changes: [
    {
      address: "module.data.aws_db_instance.primary",
      module_address: "module.data",
      mode: "managed",
      type: "aws_db_instance",
      change: { actions: ["delete", "create"], replace_paths: [["engine_version"]] },
      action_reason: "replace_because_cannot_update",
    },
  ],
});

const PLAIN_DESTROY_PLAN = JSON.stringify({
  resource_changes: [
    {
      address: "aws_security_group_rule.temp",
      mode: "managed",
      type: "aws_security_group_rule",
      change: { actions: ["delete"] },
      action_reason: "delete_because_no_resource_config",
    },
  ],
});

function fakeReadFile(files) {
  return async (p) => {
    if (!(p in files)) throw new Error(`ENOENT: no such file, open '${p}'`);
    return files[p];
  };
}

// --- argument parsing ---------------------------------------------------

test("the default gate is replace-stateful, not every destroy", () => {
  // A gate that fires on every destroy fires on every plan in a repo that
  // uses count, and a gate that fires constantly gets continue-on-error'd.
  assert.equal(parseArgs(["check", "plan.json"]).failOn, "replace-stateful");
});

test("--fail-on is parsed off the = form", () => {
  assert.equal(parseArgs(["check", "plan.json", "--fail-on=destructive"]).failOn, "destructive");
});

// --- help ---------------------------------------------------------------

test("--help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
  assert.match(output, /terraform show -json/);
  for (const mode of Object.keys(FAIL_MODES)) assert.match(output, new RegExp(mode));
});

test("no subcommand exits 1 with usage", async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

// --- the gate -----------------------------------------------------------

test("a plan with nothing destructive exits 0", async () => {
  const { exitCode, output } = await run(["check", "plan.json"], { readFile: fakeReadFile({ "plan.json": SAFE_PLAN }) });
  assert.equal(exitCode, 0);
  assert.match(output, /No resource is destroyed or replaced/);
});

test("a replaced database exits 1 and names the attribute that forced it", async () => {
  const { exitCode, output } = await run(["check", "plan.json"], {
    readFile: fakeReadFile({ "plan.json": STATEFUL_REPLACE_PLAN }),
  });
  assert.equal(exitCode, 1);
  assert.match(output, /DATA LOSS RISK/);
  assert.match(output, /module\.data\.aws_db_instance\.primary/);
  assert.match(output, /forced by: engine_version/);
  assert.match(output, /ForceNew/);
  assert.match(output, /destroy then create/);
});

test("a plain stateless destroy does not trip the default gate", async () => {
  const { exitCode, output } = await run(["check", "plan.json"], {
    readFile: fakeReadFile({ "plan.json": PLAIN_DESTROY_PLAN }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /GOING AWAY/);
  assert.match(output, /aws_security_group_rule\.temp/);
});

test("--fail-on=destructive does trip on that same plan", async () => {
  const { exitCode } = await run(["check", "plan.json", "--fail-on=destructive"], {
    readFile: fakeReadFile({ "plan.json": PLAIN_DESTROY_PLAN }),
  });
  assert.equal(exitCode, 1);
});

test("--fail-on=never reports without ever failing", async () => {
  const { exitCode, output } = await run(["check", "plan.json", "--fail-on=never"], {
    readFile: fakeReadFile({ "plan.json": STATEFUL_REPLACE_PLAN }),
  });
  assert.equal(exitCode, 0);
  assert.match(output, /DATA LOSS RISK/);
});

test("--fail-on=delete-stateful catches an outright destroy of stored data", async () => {
  const plan = JSON.stringify({
    resource_changes: [
      { address: "aws_s3_bucket.logs", mode: "managed", type: "aws_s3_bucket", change: { actions: ["delete"] } },
    ],
  });
  const strict = await run(["check", "p.json", "--fail-on=delete-stateful"], { readFile: fakeReadFile({ "p.json": plan }) });
  assert.equal(strict.exitCode, 1);
  const lenient = await run(["check", "p.json"], { readFile: fakeReadFile({ "p.json": plan }) });
  assert.equal(lenient.exitCode, 0);
  assert.match(lenient.output, /DESTROYING STORED DATA/);
});

// --- machine output -----------------------------------------------------

test("--json emits parseable JSON carrying the same verdict", async () => {
  const { exitCode, output } = await run(["check", "plan.json", "--json"], {
    readFile: fakeReadFile({ "plan.json": STATEFUL_REPLACE_PLAN }),
  });
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  assert.equal(parsed.failed, true);
  assert.equal(parsed.failOn, "replace-stateful");
  assert.equal(parsed.dataLossRisks.length, 1);
  assert.equal(parsed.totals.replace, 1);
});

test("the human report groups by type and by module", async () => {
  const { output } = await run(["check", "plan.json"], {
    readFile: fakeReadFile({ "plan.json": STATEFUL_REPLACE_PLAN }),
  });
  assert.match(output, /By resource type:/);
  assert.match(output, /By module:/);
  assert.match(output, /module\.data: /);
});

// --- failure modes ------------------------------------------------------

test("a missing file exits 2 with a readable error", async () => {
  const { exitCode, output } = await run(["check", "missing.json"], { readFile: fakeReadFile({}) });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("non-plan JSON exits 2 naming the right command", async () => {
  const { exitCode, output } = await run(["check", "plan.json"], {
    readFile: fakeReadFile({ "plan.json": '{"foo":"bar"}' }),
  });
  assert.equal(exitCode, 2);
  assert.match(output, /resource_changes/);
});

test("an unknown --fail-on value exits 2 and lists the valid ones", async () => {
  const { exitCode, output } = await run(["check", "plan.json", "--fail-on=everything"], {
    readFile: fakeReadFile({ "plan.json": SAFE_PLAN }),
  });
  assert.equal(exitCode, 2);
  assert.match(output, /replace-stateful/);
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
