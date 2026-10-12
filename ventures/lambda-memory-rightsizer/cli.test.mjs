import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/report-lines.txt", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };
const oom = { readFile: async () => "REPORT RequestId: a Duration: 10 ms Billed Duration: 10 ms Memory Size: 128 MB Max Memory Used: 127 MB" };

test("analyze prints the three scenarios and findings; exit 0 on warnings by default", async () => {
  const r = await run(["analyze", "logs.txt", "--invocations", "5000000"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /I\/O-bound/);
  assert.match(r.output, /memory-overprovisioned/);
});

test("--fail-on warn fails on warnings; an out-of-memory risk fails by default", async () => {
  assert.equal((await run(["analyze", "p", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "p"], oom)).exitCode, 1);
});

test("--json is parseable; --arch arm drops the arm64 note; --prices overrides", async () => {
  const j = JSON.parse((await run(["analyze", "p", "--json"], io)).output);
  assert.equal(j.summary.status, "warn");
  const arm = JSON.parse((await run(["analyze", "p", "--json", "--arch", "arm"], io)).output);
  assert.ok(!arm.findings.some((f) => f.rule === "try-arm64"));
  const prices = { readFile: async (p) => (p === "pr.json" ? JSON.stringify({ x86: { label: "x", perGbSecond: 0.001 }, arm: { label: "a", perGbSecond: 0.0008 }, perMillionRequests: 0 }) : text) };
  const cheap = JSON.parse((await run(["analyze", "logs", "--json", "--prices", "pr.json"], prices)).output);
  assert.ok(cheap.current.costPerMillion > j.current.costPerMillion);
});

test("bad input exits 2; stdin works", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "no reports here" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--cpu-bound", "2"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--arch", "mips"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => text })).exitCode, 0);
  assert.equal((await run([], io)).exitCode, 1);
});

test("the real process reads the file", () => {
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname, "--fail-on", "warn"], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /Cheapest size/);
});
