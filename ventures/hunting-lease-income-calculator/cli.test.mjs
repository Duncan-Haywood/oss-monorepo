import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("profitable lease exits 0 and json parses", () => {
  const r = run("--acres", "200", "--rate", "12", "--insurance", "350", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).best, "club");
});

test("unprofitable inputs exit 1", () => {
  assert.equal(run("--acres", "100", "--rate", "1", "--insurance", "5000").status, 1);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--bogus").status, 2);
});
