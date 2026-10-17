import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/cards.csv", import.meta.url), "utf8");
const io = { readFile: async (f) => (f === "tiers.csv" ? "Only,10,100000,10" : text) };

test("pick prints the send list, holds and baselines", async () => {
  const r = await run(["pick", "c.csv", "--budget", "400"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /^Send 3 of 13 cards/);
  assert.match(r.output, /1\. Charizard Base Set Shadowless {2}tier Premium/);
  assert.match(r.output, /Sell raw \/ hold:/);
  assert.match(r.output, /Pristine vintage grail: no fee tier covers/);
  assert.match(r.output, /not a price guide/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["pick", "c", "--json"], io)).output);
  const b = JSON.parse((await run(["pick", "c", "--json", "--budget", "100"], io)).output);
  const c = JSON.parse((await run(["pick", "c", "--json", "--max-cards", "2"], io)).output);
  const d = JSON.parse((await run(["pick", "c", "--json", "--tiers", "tiers.csv"], io)).output);
  assert.ok(b.uplift < a.uplift);
  assert.equal(c.submit.length, 2);
  assert.equal(d.hold.some((h) => /no fee tier/.test(h.reason)), false);
  assert.equal(a.options.budget, null);
});

test("bad input exits 2; help and example tiers exit 0", async () => {
  assert.equal((await run(["pick", "c", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["pick", "c", "--ship", "-3"], io)).exitCode, 2);
  assert.equal((await run(["pick", "c", "--ship"], io)).exitCode, 2);
  assert.equal((await run(["pick", "c", "--condition", "mint"], io)).exitCode, 2);
  assert.equal((await run(["pick"], io)).exitCode, 2);
  assert.equal((await run(["nope", "c"], io)).exitCode, 2);
  assert.equal((await run(["pick", "c"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["pick", "c"], { readFile: async () => "# only a comment" })).exitCode, 2);
  assert.equal((await run(["pick", "c"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["pick", "c", "--tiers", "t"], { readFile: async (f) => (f === "t" ? "bad" : text) })).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
  const ex = await run(["--example-tiers"], io);
  assert.equal(ex.exitCode, 0);
  assert.match(ex.output, /EXAMPLE tiers only/);
});
