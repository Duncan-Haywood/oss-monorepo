import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("profitable cycle exits 0 and json parses", () => {
  const r = run("--seed", "150000", "--survival", "70", "--price", "0.9", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).viable, true);
});

test("losing cycle exits 1", () => {
  const r = run("--seed", "100000", "--price", "0.2");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /loss/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--seed", "100", "--survival", "0").status, 2);
  assert.equal(run("--bogus").status, 2);
});
