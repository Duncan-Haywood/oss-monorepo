import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/invoices.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints shares and findings; an error finding exits 1, a clean book exits 0", async () => {
  const r = await run(["analyze", "i.csv", "--costs", "24000"], io);
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /Northwind Logistics/);
  assert.match(r.output, /loses-money-without-top-client/);
  const clean = await run(["analyze", "x"], { readFile: async () => "A,10\nB,10\nC,10\nD,10\nE,10\nF,10\nG,10\nH,10" });
  assert.equal(clean.exitCode, 0);
  assert.match(clean.output, /No concentration warnings/);
});

test("--fail-on warn fails on a warning that passes by default; levels are adjustable", async () => {
  const book = { readFile: async () => "A,26\nB,7\nC,7\nD,7\nE,7\nF,7\nG,7\nH,8\nI,8\nJ,8\nK,8" };
  assert.equal((await run(["analyze", "x"], book)).exitCode, 0);
  assert.equal((await run(["analyze", "x", "--fail-on", "warn"], book)).exitCode, 1);
  assert.equal((await run(["analyze", "x", "--warn-top1", "35", "--fail-on", "warn"], book)).exitCode, 0);
});

test("--json parses and carries every client", async () => {
  const j = JSON.parse((await run(["analyze", "i", "--json"], io)).output);
  assert.equal(j.clients.length, 9);
  assert.ok(j.top1 > 0.4);
  assert.ok(j.trend.change > 0.1);
});

test("--json rounds shares to four decimals", async () => {
  const j = JSON.parse((await run(["analyze", "i", "--json"], io)).output);
  for (const v of [j.top1, j.top3, j.top5, ...j.clients.map((c) => c.share)]) {
    assert.ok(Math.abs(v * 10000 - Math.round(v * 10000)) < 1e-6, String(v));
  }
  const one = JSON.parse((await run(["analyze", "x", "--json"], { readFile: async () => "A,1\nB,2" })).output);
  assert.equal(one.top1, 0.6667);
});

test("bad input exits 2", async () => {
  for (const a of [["--costs", "-1"], ["--warn-top1", "0"], ["--error-top3", "150"], ["--months", "0"], ["--months", "2.5"], ["--months", "121"], ["--warn-top1", "100.5"], ["--bogus"]]) {
    assert.equal((await run(["analyze", "i", ...a], io)).exitCode, 2, a.join(" "));
  }
  assert.equal((await run(["analyze", "c"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "c"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "a", "b"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("reads stdin with '-'", async () => {
  assert.equal((await run(["analyze", "-"], { stdin: async () => text })).exitCode, 1);
});

test("real process: reads a file", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Clients by share of revenue/);
});
