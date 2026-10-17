import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/jobs.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };
const SHOP = ["--heads", "2", "--spm", "650", "--efficiency", "75", "--margin", "40", "--min-charge", "75", "--min-hourly", "35", "--flat-per-1000", "1"];

test("quote prints each job with cost, break table, sensitivity, flat-rule check and verdicts", async () => {
  const r = await run(["quote", "jobs.csv", ...SHOP], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /== Dental office polos ==/);
  assert.match(r.output, /Quote \$829\.20 for 24 pieces \(\$34\.55 a piece\)/);
  assert.match(r.output, /flat rule LOSES money/);
  assert.match(r.output, /Offered \$156\.00 \(\$13\.00 a piece\): profit -\$11\.01, -7\.1% margin/);
  assert.match(r.output, /COUNTER Little league caps/);
  assert.match(r.output, /TAKE    Landscaper crew jackets/);
  assert.match(r.output, /Stitch count vs price at 12 pieces/);
});

test("--json parses; flags change the answer; a CSV cell beats a flag", async () => {
  const a = JSON.parse((await run(["quote", "j", "--json", ...SHOP], io)).output);
  const b = JSON.parse((await run(["quote", "j", "--json", ...SHOP, "--margin", "55"], io)).output);
  assert.equal(a.length, 5);
  assert.ok(b[0].quote.total > a[0].quote.total);
  const c = JSON.parse((await run(["quote", "j", "--json", "--quantity", "999"], io)).output);
  assert.equal(c[0].job.quantity, 24);
});

test("no file quotes a single job from flags", async () => {
  const r = JSON.parse((await run(["quote", "--json", "--quantity", "30", "--stitches", "9000", "--breaks", "10,30,60"])).output);
  assert.equal(r.job.quantity, 30);
  assert.deepEqual(r.breaks.map((b) => b.qty), [10, 30, 60]);
  const t = await run(["quote", "--quantity", "6", "--min-charge", "400"]);
  assert.equal(t.exitCode, 0);
  assert.match(t.output, /set by the minimum charge/);
  assert.match(t.output, /min charge/);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["quote", "s", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["quote", "s", "--margin", "abc"], io)).exitCode, 2);
  assert.equal((await run(["quote", "s", "--margin"], io)).exitCode, 2);
  assert.equal((await run(["quote", "s", "--margin", "100"], io)).exitCode, 2);
  assert.equal((await run([])).exitCode, 2);
  assert.equal((await run(["price"])).exitCode, 2);
  assert.equal((await run(["quote", "s"], { readFile: async () => "" })).exitCode, 2);
  assert.equal((await run(["quote", "s"], { readFile: async () => "Bad,0,5,5000,2,10" })).exitCode, 2);
  assert.equal((await run(["quote", "s"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["--help"])).exitCode, 0);
});
