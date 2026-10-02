import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/clusters.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints settings and findings; warnings alone pass by default", async () => {
  const r = await run(["analyze", "c.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /autotermination_minutes": 30/);
  assert.match(r.output, /scheduled-on-all-purpose/);
});

test("--fail-on warn exits 1; a clean list passes", async () => {
  assert.equal((await run(["analyze", "c", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "c", "--fail-on", "warn"], { readFile: async () => "J,jobs,300,0,10,20" })).exitCode, 0);
});

test("--json parses; --terminate and --prices change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "c", "--json"], io)).output);
  const loose = JSON.parse((await run(["analyze", "c", "--json", "--terminate", "120"], io)).output);
  assert.ok(loose.totals.saving < j.totals.saving);
  const dear = JSON.parse((await run(["analyze", "c", "--json", "--prices", "p.json"], { readFile: async (p) => (p === "p.json" ? JSON.stringify({ allPurpose: 1.1 }) : text) })).output);
  assert.ok(dear.totals.current > j.totals.current);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["analyze", "c", "--terminate", "1"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "c", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "c"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "c"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("real process: reads a file and exits cleanly", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /cluster\(s\)/);
});
