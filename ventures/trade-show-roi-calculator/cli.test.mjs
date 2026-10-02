import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const text = readFileSync(new URL("./fixtures/shows.csv", import.meta.url), "utf8");
const io = { readFile: async () => text };
const FLAGS = ["--lead-qual", "30", "--close", "20", "--deal-value", "12000", "--margin", "60", "--budget", "40000", "--max-per-quarter", "2"];

test("plan prints ranking, buy, skip and comparison sections", async () => {
  const r = await run(["plan", "s.csv", ...FLAGS], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Buy 2 of 10 shows: spend \$38,800\.00 for \$28,160\.00 expected net gain/);
  assert.match(r.output, /\+ FabTech Midwest/);
  assert.match(r.output, /Trade Mart Fall Market -- loses \$2,400\.00/);
  assert.match(r.output, /every show \$75,376\.00 \(spend \$159,200\.00, over budget\)/);
});

test("--json parses and options change the answer", async () => {
  const a = JSON.parse((await run(["plan", "s", "--json", ...FLAGS], io)).output);
  const b = JSON.parse((await run(["plan", "s", "--json", "--lead-qual", "30", "--close", "20", "--deal-value", "12000", "--margin", "60", "--budget", "100000"], io)).output);
  assert.equal(a.options.budget, 40000);
  assert.ok(b.totals.plan > a.totals.plan);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["plan", "s", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s", "--budget", "abc"], io)).exitCode, 2);
  assert.equal((await run(["plan"], io)).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => "x,y" })).exitCode, 2);
  assert.equal((await run(["plan", "s"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
});
