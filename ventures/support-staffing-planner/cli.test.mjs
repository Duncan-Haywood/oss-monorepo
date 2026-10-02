import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/demand.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("plan prints schedule, cost curve, what-ifs and comparisons", async () => {
  const r = await run(["plan", "d.csv", "--sl", "80", "--answer", "20", "--shrinkage", "30", "--shifts", "8,4", "--wage", "22"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Staff \d+ shifts/);
  assert.match(r.output, /Mon: \d+ contacts/);
  assert.match(r.output, /<- your target/);
  assert.match(r.output, /Handle time 10% shorter/);
  assert.match(r.output, /flat peak staffing \$/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "d", "--json"], io)).output);
  const b = JSON.parse((await run(["plan", "d", "--json", "--sl", "95"], io)).output);
  const c = JSON.parse((await run(["plan", "d", "--json", "--wage", "44"], io)).output);
  assert.equal(a.options.serviceLevel, 80);
  assert.ok(b.totals.cost > a.totals.cost);
  assert.equal(c.totals.cost, a.totals.cost * 2);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "d", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "d", "--sl", "abc"], io)).exitCode, 2);
  assert.equal((await run(["plan", "d", "--shifts", "x"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["plan", "d"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "d"], { readFile: async () => "Mon,09:00,20\nMon,09:30,20" })).exitCode, 2);
  assert.equal((await run(["plan", "d"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
});
