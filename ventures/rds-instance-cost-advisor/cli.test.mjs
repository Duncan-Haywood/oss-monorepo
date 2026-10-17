import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/instances.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints commands and findings; warnings alone pass by default", async () => {
  const r = await run(["analyze", "i.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /modify-db-instance --db-instance-identifier staging-orders --no-multi-az/);
  assert.match(r.output, /io1-to-gp3/);
});

test("--fail-on warn exits 1; a clean list passes", async () => {
  assert.equal((await run(["analyze", "i", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "i", "--fail-on", "warn"], { readFile: async () => "A,db.m6g.large,postgres,no,gp3,100,,50,prod" })).exitCode, 0);
});

test("--json parses; --prices changes the answer", async () => {
  const j = JSON.parse((await run(["analyze", "i", "--json"], io)).output);
  const dear = JSON.parse((await run(["analyze", "i", "--json", "--prices", "p.json"], { readFile: async (p) => (p === "p.json" ? JSON.stringify({ hourly: { "db.m5.2xlarge": 5 } }) : text) })).output);
  assert.ok(dear.totals.current > j.totals.current);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["analyze", "i", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "i"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "i"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["analyze", "i", "--prices", "p"], { readFile: async (p) => { if (p === "p") throw new Error("x"); return text; } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("real process: reads a file and exits cleanly", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /instance\(s\)/);
});
