import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/groups.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints commands and findings; warnings alone pass by default", async () => {
  const r = await run(["analyze", "g.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /aws logs put-retention-policy --log-group-name \/aws\/lambda\/checkout-api/);
  assert.match(r.output, /dead-group/);
});

test("--fail-on warn exits 1; a clean list passes", async () => {
  assert.equal((await run(["analyze", "g", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "g", "--fail-on", "warn"], { readFile: async () => "/x,1,7,1" })).exitCode, 0);
});

test("--json parses; --retention and --prices change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "g", "--json"], io)).output);
  const short = JSON.parse((await run(["analyze", "g", "--json", "--retention", "7"], io)).output);
  assert.ok(short.totals.saving > j.totals.saving);
  const dear = JSON.parse((await run(["analyze", "g", "--json", "--prices", "p.json"], { readFile: async (p) => (p === "p.json" ? JSON.stringify({ storage: 0.3 }) : text) })).output);
  assert.ok(dear.totals.current > j.totals.current);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["analyze", "g", "--retention", "0"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "g", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "g"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "g"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("real process: reads a file and exits cleanly", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /log group\(s\)/);
});
