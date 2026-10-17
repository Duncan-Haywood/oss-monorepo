import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/haul.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("pick prints the buy list, passes and baselines", async () => {
  const r = await run(["pick", "h.csv", "--budget", "80", "--max-hours", "2"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Buy 5 of 14 items for \$80\.00/);
  assert.match(r.output, /1\. Nintendo Game Boy lot {2}pay up to \$/);
  assert.match(r.output, /Pass:/);
  assert.match(r.output, /Bag of random mugs: expected -\$/);
  assert.match(r.output, /Rank by return on cash/);
  assert.match(r.output, /not a price guide/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["pick", "h", "--json"], io)).output);
  const b = JSON.parse((await run(["pick", "h", "--json", "--budget", "50"], io)).output);
  const c = JSON.parse((await run(["pick", "h", "--json", "--max-items", "2"], io)).output);
  const d = JSON.parse((await run(["pick", "h", "--json", "--hourly", "60"], io)).output);
  assert.ok(b.profit < a.profit);
  assert.equal(c.buy.length, 2);
  assert.ok(d.buy.length < a.buy.length);
  assert.equal(a.options.budget, null);
});

test("bad input exits 2; help exits 0", async () => {
  assert.equal((await run(["pick", "h", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["pick", "h", "--fee", "150"], io)).exitCode, 2);
  assert.equal((await run(["pick", "h", "--fee"], io)).exitCode, 2);
  assert.equal((await run(["pick"], io)).exitCode, 2);
  assert.equal((await run(["nope", "h"], io)).exitCode, 2);
  assert.equal((await run(["pick", "h"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["pick", "h"], { readFile: async () => "# only a comment" })).exitCode, 2);
  assert.equal((await run(["pick", "h"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});
