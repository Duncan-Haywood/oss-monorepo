import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/jobs.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("plan prints the route, declines and baselines", async () => {
  const r = await run(["plan", "j.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Run 6 of 10 turnovers with 2 crews/);
  assert.match(r.output, /Crew 1:\n {2}1\. 10:30-12:00 {2}Downtown Loft/);
  assert.match(r.output, /\[warn\] decline: Pine Cabin/);
  assert.match(r.output, /Biggest fees first/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "s", "--json"], io)).output);
  const b = JSON.parse((await run(["plan", "s", "--json", "--hourly", "80"], io)).output);
  const c = JSON.parse((await run(["plan", "s", "--json", "--end", "13:00"], io)).output);
  assert.equal(a.options.hourly, 40);
  const one = JSON.parse((await run(["plan", "s", "--json", "--crews", "1"], io)).output);
  assert.ok(one.profit < a.profit);
  assert.ok(b.profit < a.profit);
  assert.ok(c.accepted < a.accepted);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "s", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--speed", "0"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--crews", "4"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--end", "soon"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--hourly"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["nope", "s"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "# only a comment" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});
