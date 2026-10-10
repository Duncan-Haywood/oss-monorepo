import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("profitable run exits 0 and json parses", () => {
  const r = run("--acres", "80", "--tons", "4", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).anyProfit, true);
});

test("no profitable channel exits 1", () => {
  const r = run("--acres", "80", "--tons", "4", "--small", "1", "--large", "1", "--round", "1");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /No channel covers/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--acres", "10", "--tons", "4", "--loss", "100").status, 2);
  assert.equal(run("--bogus").status, 2);
});
