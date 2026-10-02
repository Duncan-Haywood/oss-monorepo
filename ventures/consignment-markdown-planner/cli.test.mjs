import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/items.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("plan prints items, findings and totals", async () => {
  const r = await run(["plan", "i.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Take 6 of 10 items/);
  assert.match(r.output, /- Graphic tee/);
  assert.match(r.output, /\[warn\] decline: Oak side table/);
  assert.match(r.output, /fixed 30\/60 rule/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "s", "--json"], io)).output);
  const b = JSON.parse((await run(["plan", "s", "--json", "--lift", "0"], io)).output);
  assert.equal(a.options.weeks, 12);
  assert.ok(b.totals.plan < a.totals.plan);
  const c = JSON.parse((await run(["plan", "s", "--json", "--levels", "0,50"], io)).output);
  assert.deepEqual(c.options.levels, [0, 50]);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "s", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--weeks", "abc"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--levels", "0,100"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
});
