import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("profitable job exits 0 and json parses", () => {
  const r = run("--logs", "24", "--dia", "14", "--json");
  assert.equal(r.status, 0);
  assert.ok(JSON.parse(r.stdout).job.quotePerBf > 0);
});

test("a job that loses on both models exits 1", () => {
  const r = run("--logs", "24", "--dia", "14", "--rate", "0.1", "--hourly", "20");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /A sawing hour costs/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--logs", "5", "--dia", "3").status, 2);
  assert.equal(run("--bogus").status, 2);
});
