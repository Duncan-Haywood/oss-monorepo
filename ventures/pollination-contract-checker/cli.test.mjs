import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("healthy contract exits 0 and json parses", () => {
  const r = run("--hives", "200", "--fee", "200", "--miles", "100", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).loses, false);
});

test("long haul at a low fee exits 1 with the break-even fee", () => {
  const r = run("--hives", "100", "--fee", "100", "--miles", "2500", "--per-load", "50");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /[Bb]reak-even fee/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--hives", "10", "--fee", "100", "--fail", "100").status, 2);
  assert.equal(run("--bogus").status, 2);
});
