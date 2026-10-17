import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("workable lease exits 0 and json parses", () => {
  const r = run("--acres", "320", "--forage", "2000", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).dealExists, true);
});

test("no overlapping rent exits 1", () => {
  const r = run("--acres", "320", "--forage", "2000", "--alt", "300");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /No rent works/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--acres", "10", "--forage", "1000", "--use", "0").status, 2);
  assert.equal(run("--bogus").status, 2);
});
