import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const csv = "product,usage\ninfra_pro_hosts,50\nlogs_indexed_million,800\ncustom_metrics,12000\n";
const files = { "u.csv": csv, "bad.csv": "containers,x", "p.json": JSON.stringify({ infraProHost: { label: "X", annual: 1, monthly: 1 } }) };
const io = { readFile: async (p) => { if (p in files) return files[p]; throw new Error("ENOENT"); }, stdin: async () => csv };

test("estimate prints products, total and ranked levers", async () => {
  const { exitCode, output } = await run(["estimate", "u.csv"], io);
  assert.equal(exitCode, 0);
  assert.match(output, /TOTAL/);
  assert.match(output, /Levers that cut the bill most/);
  assert.match(output, /Flex Logs or archive/);
  assert.match(output, /not a bill/);
});

test("reads stdin with - and template prints a CSV", async () => {
  assert.match((await run(["estimate", "-"], io)).output, /Infrastructure Pro/);
  assert.match((await run(["template"], io)).output, /^product,usage/);
});

test("--budget is a gate: exit 1 over, 0 under", async () => {
  assert.equal((await run(["estimate", "u.csv", "--budget", "100"], io)).exitCode, 1);
  assert.equal((await run(["estimate", "u.csv", "--budget", "100000"], io)).exitCode, 0);
});

test("--set overrides, --json is machine readable, --prices overrides", async () => {
  const j = JSON.parse((await run(["estimate", "u.csv", "--json", "--set", "infra_pro_hosts=10", "--prices", "p.json"], io)).output);
  assert.equal(j.estimate.items.find((i) => i.key === "infra_pro").monthly, 10);
  assert.ok(Array.isArray(j.levers));
});

test("bad input exits 2", async () => {
  assert.equal((await run(["estimate", "nope.csv"], io)).exitCode, 2);
  assert.equal((await run(["estimate", "bad.csv"], io)).exitCode, 2);
  assert.equal((await run(["estimate", "u.csv", "--budget", "x"], io)).exitCode, 2);
  assert.equal((await run(["frob"], io)).exitCode, 2);
  assert.equal((await run(["estimate", "u.csv", "--bogus"], io)).exitCode, 2);
  assert.equal((await run([], io)).exitCode, 1);
});
