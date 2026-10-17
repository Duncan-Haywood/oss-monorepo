import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (...args) => spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, ...args], { encoding: "utf8" });

test("exits 1 on a forecast loss and prints scenarios", () => {
  const r = run("--price", "80000", "--budget", "62000", "--complete", "45", "--spent", "55500", "--planned", "50");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Cost efficiency so far continues/);
});

test("exits 0 on a healthy job and 2 on bad input", () => {
  assert.equal(run("--price", "80000", "--budget", "60000", "--complete", "50", "--spent", "30000").status, 0);
  assert.equal(run("--price", "80000").status, 2);
});

test("--json prints parseable output", () => {
  const r = run("--price", "80000", "--budget", "62000", "--complete", "45", "--spent", "55500", "--json");
  assert.ok(JSON.parse(r.stdout).cpi > 0);
});
