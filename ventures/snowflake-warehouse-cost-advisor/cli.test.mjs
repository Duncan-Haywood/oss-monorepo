import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/warehouses.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints commands and findings; warnings alone pass by default", async () => {
  const r = await run(["analyze", "w.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /ALTER WAREHOUSE BI_DASHBOARDS SET AUTO_SUSPEND = 60/);
  assert.match(r.output, /idle-warehouse/);
});

test("--fail-on warn exits 1; a clean list passes", async () => {
  assert.equal((await run(["analyze", "w", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "w", "--fail-on", "warn"], { readFile: async () => "ETL,XL,300,60,400,500,20" })).exitCode, 0);
});

test("--json parses; --suspend and --prices change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "w", "--json"], io)).output);
  const loose = JSON.parse((await run(["analyze", "w", "--json", "--suspend", "600"], io)).output);
  assert.ok(loose.totals.saving < j.totals.saving);
  const dear = JSON.parse((await run(["analyze", "w", "--json", "--prices", "p.json"], { readFile: async (p) => (p === "p.json" ? JSON.stringify({ credit: 6 }) : text) })).output);
  assert.ok(dear.totals.current > j.totals.current);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["analyze", "w", "--suspend", "10"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "w", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "w"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "w"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("real process: reads a file and exits cleanly", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /warehouse\(s\)/);
});
