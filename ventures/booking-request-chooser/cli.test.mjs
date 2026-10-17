import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/calendar.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };
const FLAGS = ["--turnover", "60", "--night-value", "50", "--min-stay", "3"];

test("plan prints accept, decline and counter-offer sections", async () => {
  const r = await run(["plan", "c.csv", ...FLAGS], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Accept 3 of 6/);
  assert.match(r.output, /\+ 2026-07-05 to 2026-07-09 {2}\$440\.00 {2}Dana 4 nights/);
  assert.match(r.output, /Counter-offers/);
  assert.match(r.output, /arrival order \$2,570\.00/);
});

test("--json parses and the options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "c", "--json", ...FLAGS], io)).output);
  const b = JSON.parse((await run(["plan", "c", "--json", "--turnover", "60", "--night-value", "0", "--min-stay", "1"], io)).output);
  assert.equal(a.options.minStay, 3);
  assert.notEqual(a.totals.plan, b.totals.plan);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "c", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "c", "--turnover", "abc"], io)).exitCode, 2);
  assert.equal((await run(["plan", "c"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["plan", "c"], { readFile: async () => "booked,2026-07-01,2026-07-05,100" })).exitCode, 2);
  assert.equal((await run(["plan", "c"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("real process: reads a file and exits cleanly", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "plan", fixture.pathname, ...FLAGS], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Accept 3 of 6/);
});

test("real process: stdin works", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "plan", "-"], { encoding: "utf8", input: text });
  assert.equal(r.status, 0);
});
