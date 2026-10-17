import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/requests.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };
const FLAGS = ["--capacity", "480", "--turnover", "10", "--target-hourly", "45", "--max-large", "2"];

test("plan prints ranking, book, skip and comparison sections", async () => {
  const r = await run(["plan", "r.csv", ...FLAGS], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Book 6 of 10 dogs: 475 of 480 table minutes, \$424\.00 net/);
  assert.match(r.output, /\+ Tank \(giant\)/);
  assert.match(r.output, /- Rocco -- taking it would cut the day's net by \$59\.00/);
  assert.match(r.output, /arrival order \$381\.00/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "r", "--json", ...FLAGS], io)).output);
  const b = JSON.parse((await run(["plan", "r", "--json", "--capacity", "720"], io)).output);
  assert.equal(a.options.maxLarge, 2);
  assert.ok(b.totals.plan > a.totals.plan);
});

test("price subcommand quotes a groom", async () => {
  const r = await run(["price", "--minutes", "80", "--supplies", "6", "--target-hourly", "45"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Charge \$74\.00 \(exact \$73\.50\) for 90 table minutes/);
  assert.equal((await run(["price"])).exitCode, 2);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "r", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "r", "--capacity", "abc"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["plan", "r"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "r"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["plan", "r", "--no-show", "150"], io)).exitCode, 2);
});
