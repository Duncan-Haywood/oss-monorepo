import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/consumed-capacity.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints the modes and findings; exit 0 on warnings by default", async () => {
  const r = await run(["analyze", "m.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /on-demand/);
  assert.match(r.output, /switch-capacity-mode/);
});

test("--fail-on warn fails on warnings; throttling fails by default", async () => {
  assert.equal((await run(["analyze", "p", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "p", "--current-rcu", "5", "--current-wcu", "1"], io)).exitCode, 1);
});

test("--json parses; --prices overrides; --period changes the window", async () => {
  const j = JSON.parse((await run(["analyze", "p", "--json"], io)).output);
  assert.equal(j.summary.status, "warn");
  const prices = { readFile: async (p) => (p === "pr.json" ? JSON.stringify({ onDemandPerMillionRead: 5, onDemandPerMillionWrite: 5, perRcuHour: 0.00013, perWcuHour: 0.00065 }) : text) };
  const dear = JSON.parse((await run(["analyze", "logs", "--json", "--prices", "pr.json"], prices)).output);
  assert.ok(dear.totals.onDemand > j.totals.onDemand);
  const short = JSON.parse((await run(["analyze", "p", "--json", "--period", "60"], io)).output);
  assert.ok(short.hours < j.hours);
});

test("bad input exits 2; stdin works", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "nothing useful" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--target", "2"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--current-rcu", "5"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => text })).exitCode, 0);
  assert.equal((await run([], io)).exitCode, 1);
});

test("the real process reads the file", () => {
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname, "--fail-on", "warn"], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /Modelled monthly cost/);
});
