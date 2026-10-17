import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/events.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };
const FLAGS = ["--cogs", "35", "--crew-rate", "15", "--max-per-week", "2"];

test("plan prints work, skip and comparison sections", async () => {
  const r = await run(["plan", "e.csv", ...FLAGS], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Work 6 of 10 events for \$8,721\.00 net/);
  assert.match(r.output, /\+ 2026-09-12 12:00-22:00 {2}Craft Brew Fest/);
  assert.match(r.output, /Harvest Fair -- overlaps Craft Brew Fest/);
  assert.match(r.output, /in the order listed \$8,241\.00/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "e", "--json", ...FLAGS], io)).output);
  const b = JSON.parse((await run(["plan", "e", "--json", "--cogs", "35", "--crew-rate", "15", "--max-per-week", "1"], io)).output);
  assert.equal(a.options.maxPerWeek, 2);
  assert.notEqual(a.totals.plan, b.totals.plan);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "e", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "e", "--cogs", "abc"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["plan", "e"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "e"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
});
