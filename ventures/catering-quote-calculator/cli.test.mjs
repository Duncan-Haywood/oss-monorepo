import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/event.csv", import.meta.url);
const io = { readFile: async () => readFileSync(fixture, "utf8") };

test("quote prints price, tiers and findings; a losing offered price exits 1, a good one exits 0", async () => {
  const bad = await run(["quote", "e.csv", "--guests", "60", "--price", "28"], io);
  assert.equal(bad.exitCode, 1);
  assert.match(bad.output, /offered-price-below-target/);
  assert.match(bad.output, /break-even 66 guests/);
  const good = await run(["quote", "e.csv", "--guests", "60", "--price", "48"], io);
  assert.equal(good.exitCode, 0);
  assert.match(good.output, /Guests {3}Per guest/);
});

test("--fail-on warn fails on a high food-cost warning that passes by default", async () => {
  const lean = { readFile: async () => "Food,guest,1,20\nVan,flat,1,10" };
  assert.equal((await run(["quote", "x", "--guests", "20"], lean)).exitCode, 0);
  assert.equal((await run(["quote", "x", "--guests", "20", "--fail-on", "warn"], lean)).exitCode, 1);
  assert.equal((await run(["quote", "x", "--guests", "20", "--fail-on", "warn", "--warn-food", "90"], lean)).exitCode, 0);
});

test("--json parses and carries the tiers", async () => {
  const j = JSON.parse((await run(["quote", "e", "--guests", "60", "--json"], io)).output);
  assert.equal(j.tiers.length, 6);
  assert.equal(j.guests, 60);
  assert.ok(j.pricePerGuest > j.costPerGuest);
});

test("stdin works and bad input exits 2", async () => {
  assert.equal((await run(["quote", "-", "--guests", "10"], { stdin: async () => "Food,guest,1,5" })).exitCode, 0);
  assert.equal((await run(["quote", "x"], { readFile: async () => "" })).exitCode, 2);
  assert.equal((await run(["quote", "x", "--guests", "0"], io)).exitCode, 2);
  assert.equal((await run(["quote", "x", "--margin", "130"], io)).exitCode, 2);
  assert.equal((await run(["quote", "x", "--nope"], io)).exitCode, 2);
  assert.equal((await run(["quote", "x"], { readFile: async () => { throw new Error("ENOENT"); } })).exitCode, 2);
  assert.equal((await run(["bad"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("the real CLI runs end to end", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "quote", fixture.pathname, "--guests", "60"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Quote \$/);
});
