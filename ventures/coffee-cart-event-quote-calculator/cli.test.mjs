import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("profitable run exits 0 and json parses", () => {
  const r = run("--hours", "5", "--price", "5.75", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).anyProfit, true);
});

test("no profitable deal exits 1", () => {
  const r = run("--hours", "5", "--price", "5", "--cups", "5", "--fee", "0", "--guarantee", "0");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /No deal covers/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--hours", "5", "--price", "5", "--share", "150").status, 2);
  assert.equal(run("--bogus").status, 2);
});
