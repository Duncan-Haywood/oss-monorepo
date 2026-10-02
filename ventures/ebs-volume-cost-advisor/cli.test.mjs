import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/volumes.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints the commands and findings; the fixture has a throttled gp2 so exit 1", async () => {
  const r = await run(["analyze", "v.csv"], io);
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /aws ec2 modify-volume --volume-id vol-0a3 --volume-type gp3/);
  assert.match(r.output, /unattached-volume/);
});

test("--fail-on warn fails on a warning-only fleet; default passes", async () => {
  const warnOnly = { readFile: async () => "vol-1,gp2,500,,,900,60,in-use" };
  assert.equal((await run(["analyze", "p"], warnOnly)).exitCode, 0);
  assert.equal((await run(["analyze", "p", "--fail-on", "warn"], warnOnly)).exitCode, 1);
});

test("--json parses; --prices and --headroom change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "p", "--json"], io)).output);
  assert.equal(j.summary.status, "error");
  const prices = { readFile: async (p) => (p === "pr.json" ? JSON.stringify({ gp2: { gb: 0.5 } }) : text) };
  const dear = JSON.parse((await run(["analyze", "i", "--json", "--prices", "pr.json"], prices)).output);
  assert.ok(dear.totals.current > j.totals.current);
  const tight = JSON.parse((await run(["analyze", "p", "--json", "--headroom", "1"], io)).output);
  assert.ok(tight.totals.best <= j.totals.best);
});

test("bad input exits 2; stdin works; no args prints usage", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "nothing useful" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--headroom", "9"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--fail-on", "x"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--prices", "bad.json"], { readFile: async (p) => { if (p === "bad.json") throw new Error("nope"); return text; } })).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => text })).exitCode, 1);
  assert.equal((await run([], io)).exitCode, 1);
});

test("the real process reads the file", () => {
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /Modelled monthly cost/);
});
