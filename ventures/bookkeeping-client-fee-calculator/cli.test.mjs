import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/roster.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("price prints the three numbers, cleanup and competitor", async () => {
  const r = await run(["price", "--cleanup", "3", "--competitor", "600"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Charge at least \$765\.00 a month/);
  assert.match(r.output, /Recommended fee {2}\$918\.00/);
  assert.match(r.output, /Walk-away price {2}\$583\.75/);
  assert.match(r.output, /One-time cleanup \$3,262\.50/);
  assert.match(r.output, /At \$600\.00: \$57\.93 an hour/);
  assert.match(r.output, /messy: \$1,140\.00/);
  assert.match(r.output, /not market rates/);
});

test("price --json and flags change the answer", async () => {
  const a = JSON.parse((await run(["price", "--json"])).output);
  const b = JSON.parse((await run(["price", "--json", "--cleanliness", "messy", "--target", "100"])).output);
  assert.ok(b.minimum > a.minimum);
  assert.equal(a.options.cleanliness, "average");
});

test("roster ranks clients and sizes raises", async () => {
  const r = await run(["roster", "c.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^5 of 7 clients are below \$75\.00 an hour/);
  assert.match(r.output, /1\. Garnet Boutique {2}\$275\.00 for 7 h = \$35\.71\/h {2}raise by \$275\.00 \(100%\) to \$550\.00/);
  assert.match(r.output, /Fir Ridge Plumbing.*at target/);
  const j = JSON.parse((await run(["roster", "c", "--json", "--target", "40"], io)).output);
  assert.ok(j.below < 5);
});

test("bad input exits 2; help exits 0", async () => {
  assert.equal((await run(["price", "--bogus"])).exitCode, 2);
  assert.equal((await run(["price", "--target"])).exitCode, 2);
  assert.equal((await run(["price", "--cleanliness", "dirty"])).exitCode, 2);
  assert.equal((await run(["price", "--transactions", "x"])).exitCode, 2);
  assert.equal((await run(["roster"], io)).exitCode, 2);
  assert.equal((await run(["nope"])).exitCode, 2);
  assert.equal((await run(["roster", "c"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["roster", "c"], { readFile: async () => "# only a comment" })).exitCode, 2);
  assert.equal((await run(["roster", "c"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"])).exitCode, 0);
});
