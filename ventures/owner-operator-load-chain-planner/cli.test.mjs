import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/loads.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };
const A = ["plan", "l.csv", "--start", "Dallas TX", "--horizon", "120"];

test("plan prints the chain, walk-away rates, left-out loads and baselines", async () => {
  const r = await run(A, io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Run 3 loads: Dallas to Atlanta dry van -> Memphis to Chicago -> Chicago to Dallas\./);
  assert.match(r.output, /1\. Dallas to Atlanta dry van {2}Dallas TX -> Atlanta GA {2}\$2,350\.00/);
  assert.match(r.output, /counter at or above \$2,264\.63/);
  assert.match(r.output, /Left out:/);
  assert.match(r.output, /Against simple rules:/);
  assert.match(r.output, /not hours-of-service compliance/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run([...A, "--json"], io)).output);
  const b = JSON.parse((await run(["plan", "l", "--start", "Dallas TX", "--horizon", "120", "--json", "--per-day"], io)).output);
  const c = JSON.parse((await run([...A, "--json", "--fuel", "6"], io)).output);
  const d = JSON.parse((await run([...A, "--json", "--return-home"], io)).output);
  assert.equal(a.status, "chain");
  assert.equal(b.options.objective, "perDay");
  assert.notDeepEqual(b.chain.map((x) => x.name), a.chain.map((x) => x.name));
  assert.ok(c.totals.profitBeforeFixed < a.totals.profitBeforeFixed);
  assert.equal(d.options.returnHome, true);
});

test("cities lists the built-in names", async () => {
  const r = await run(["cities"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Albany NY\n/);
  assert.match(r.output, /Dallas TX/);
});

test("bad input exits 2; help exits 0", async () => {
  assert.equal((await run(["plan", "l"], io)).exitCode, 2);
  assert.equal((await run(["plan", "l", "--start", "Nowhere"], io)).exitCode, 2);
  assert.equal((await run([...A, "--bogus"], io)).exitCode, 2);
  assert.equal((await run([...A, "--mph"], io)).exitCode, 2);
  assert.equal((await run([...A, "--mph", "0"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["nope"], io)).exitCode, 2);
  assert.equal((await run(A, { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(A, { readFile: async () => "# only a comment" })).exitCode, 2);
  assert.equal((await run(A, { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("a list with nothing worth running says so and exits 0", async () => {
  const r = await run(A, { readFile: async () => "bad,Dallas TX,Houston TX,100" });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^No load or chain here covers its running cost/);
});
