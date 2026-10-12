import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...a) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...a], { encoding: "utf8" });

test("healthy crop exits 0 and json parses", () => {
  const r = run("--seed", "250000", "--premium-price", "0.85", "--json");
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).loses, false);
});

test("low prices exit 1 with the break-even price", () => {
  const r = run("--seed", "100000", "--premium-price", "0.3", "--standard-price", "0.2");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /break-even/);
});

test("bad usage exits 2", () => {
  assert.equal(run().status, 2);
  assert.equal(run("--seed", "100", "--mortality", "100").status, 2);
  assert.equal(run("--bogus").status, 2);
});
