import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/box.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };

test("price prints the season, the wage price and the sweep", async () => {
  const r = await run(["price", "b.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /you lose \$13,025\.00 after paying yourself/);
  assert.match(r.output, /Price that pays \$20\.00 an hour at 60 shares: \$723\.80/);
  assert.match(r.output, /Price sweep/);
});

test("--json parses and the price flag changes the answer", async () => {
  const a = JSON.parse((await run(["price", "b", "--json", "--price", "500"], io)).output);
  const b = JSON.parse((await run(["price", "b", "--json", "--price", "800"], io)).output);
  assert.ok(a.now.afterPay < 0 && b.now.afterPay > a.now.afterPay);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["price", "b", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["price", "b", "--price", "abc"], io)).exitCode, 2);
  assert.equal((await run(["price"], io)).exitCode, 2);
  assert.equal((await run(["price", "b", "--weeks", "5"], io)).exitCode, 2);
  assert.equal((await run(["price", "b"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["price", "b"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
});
