import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const LOG = "abc1234|Ada|2026-09-01T09:00:00Z|feat: a\ndef5678|Ada|2026-09-01T10:00:00Z|fix: b\n";
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: "utf8" });

test("stdin log renders a markdown report", () => {
  const r = run(["--rate", "100", "--client", "Acme"], LOG);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Acme/);
  assert.match(r.stdout, /1\.5 h/);
  assert.match(r.stdout, /150\.00/);
});

test("--format json and csv", () => {
  assert.equal(JSON.parse(run(["--format", "json"], LOG).stdout).hours, 1.5);
  assert.match(run(["--format", "csv"], LOG).stdout, /^date,hours,commits,summary/);
});

test("--max-hours gates with exit 1", () => {
  assert.equal(run(["--max-hours", "1"], LOG).status, 1);
  assert.equal(run(["--max-hours", "5"], LOG).status, 0);
});

test("bad input exits 2", () => {
  assert.equal(run(["--gap", "-3"], LOG).status, 2);
  assert.equal(run([], "garbage\n").status, 2);
  assert.equal(run(["--format", "pdf"], LOG).status, 2);
});

test("--repo reads this repository's own history", () => {
  const r = run(["--repo", fileURLToPath(new URL("../..", import.meta.url)), "--format", "json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).commits > 0);
});
