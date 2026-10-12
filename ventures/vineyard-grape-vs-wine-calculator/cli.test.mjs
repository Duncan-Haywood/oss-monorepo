import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("wine winning exits 0 and json parses", () => {
  const r = run("--acres", "10", "--tons", "4", "--grape-price", "500", "--dtc-share", "100", "--dtc-price", "60", "--fixed", "10000", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).winner, "wine");
});

test("grapes winning exits 1", () => {
  const r = run("--acres", "10", "--tons", "4", "--grape-price", "30000");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /selling the grapes wins/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--acres", "10", "--tons", "4", "--unsold", "100").status, 2);
  assert.equal(run("--bogus").status, 2);
});
