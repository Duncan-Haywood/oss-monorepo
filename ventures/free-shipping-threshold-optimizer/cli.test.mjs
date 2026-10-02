import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/orders.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };
const OPTS = ["--current", "35", "--margin", "55", "--fee", "4.99"];

test("analyze prints the sweep and findings; warnings alone pass by default", async () => {
  const r = await run(["analyze", "o.csv", ...OPTS], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /<- best/);
  assert.match(r.output, /better-threshold/);
  assert.match(r.output, /no free shipping/);
});

test("--fail-on warn exits 1 when a better threshold exists; a fine policy passes", async () => {
  assert.equal((await run(["analyze", "o", ...OPTS, "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "o", "--top-up", "0", "--drag", "0", "--fee", "7.1", "--fail-on", "warn"], io)).exitCode, 0);
});

test("--json parses with Infinity as 'none'; assumptions change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "o", "--json", ...OPTS], io)).output);
  assert.equal(j.table.at(-1).threshold, "none");
  assert.ok(j.findings.length > 0);
  const flat = JSON.parse((await run(["analyze", "o", "--json", "--top-up", "0", "--drag", "0", "--fee", "7.1"], io)).output);
  assert.equal(flat.best.threshold, "none");
});

test("bad input exits 2", async () => {
  for (const a of [["--margin", "0"], ["--drag", "90"], ["--top-up", "200"], ["--reach", "1"], ["--days", "0"], ["--fee", "-1"], ["--bogus"]]) {
    assert.equal((await run(["analyze", "o", ...a], io)).exitCode, 2, a.join(" "));
  }
  assert.equal((await run(["analyze", "c"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "c"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("reads stdin with '-'", async () => {
  const r = await run(["analyze", "-"], { stdin: async () => text });
  assert.equal(r.exitCode, 0);
});

test("real process: reads a file and exits cleanly", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /order\(s\)/);
});
