import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/lot.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("plan prints the ranking, findings and the cost of waiting", async () => {
  const r = await run(["plan", "lot.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^10 units cost \$118\.80 a day to carry \(\$6,877\.07 so far\)\. Wholesale 3 now/);
  assert.match(r.output, /1\. A103 2012 Altima {2}day 74 {2}wholesale now/);
  assert.match(r.output, /A109 2013 Tahoe {2}day 66 {2}retail, wholesale at day 147 if unsold/);
  assert.match(r.output, /\[warn\] wholesale: A110 2017 Fusion/);
  assert.match(r.output, /\$1,117\.35 more in expected dollars/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "s", "--json"], io)).output);
  const b = JSON.parse((await run(["plan", "s", "--json", "--line-value", "2"], io)).output);
  const c = JSON.parse((await run(["plan", "s", "--json", "--apr", "20", "--curtail", "none", "--max-age", "120"], io)).output);
  assert.equal(a.options.apr, 9);
  assert.equal(a.options.curtailments.length, 3);
  assert.ok(b.totals.wholesaleNow > a.totals.wholesaleNow);
  assert.equal(c.options.maxAge, 120);
  assert.equal(c.options.curtailments.length, 0);
  assert.ok(c.totals.carryPerDay > a.totals.carryPerDay);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "s", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--apr", "-3"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--curtail", "ninety"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--max-age"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["nope", "s"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "# only a comment" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});
