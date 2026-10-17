import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const csv = "product,usage\nworkers_requests_m,200\nr2_storage_gb,300\nr2_class_b_m,500\n";
const files = { "u.csv": csv, "bad.csv": "workers_requests_m,x", "p.json": JSON.stringify({ workers_requests_m: { label: "C", unit: "M requests", rate: 1, per: 1, included: 0 } }) };
const io = { readFile: async (p) => { if (p in files) return files[p]; throw new Error("ENOENT"); }, stdin: async () => csv };

test("estimate prints products, total and ranked levers", async () => {
  const { exitCode, output } = await run(["estimate", "u.csv"], io);
  assert.equal(exitCode, 0);
  assert.match(output, /TOTAL/);
  assert.match(output, /Levers that cut the bill most/);
  assert.match(output, /not a bill/);
});

test("reads stdin with - and template prints a CSV", async () => {
  assert.match((await run(["estimate", "-"], io)).output, /Workers requests/);
  assert.match((await run(["template"], io)).output, /^product,usage/);
});

test("--budget is a gate: exit 1 over, 0 under", async () => {
  assert.equal((await run(["estimate", "u.csv", "--budget", "20"], io)).exitCode, 1);
  assert.equal((await run(["estimate", "u.csv", "--budget", "100000"], io)).exitCode, 0);
});

test("--set overrides, --json is machine readable, --prices overrides", async () => {
  const j = JSON.parse((await run(["estimate", "u.csv", "--json", "--set", "workers_requests_m=10", "--prices", "p.json"], io)).output);
  assert.equal(j.estimate.items.find((i) => i.key === "workers_requests_m").monthly, 10);
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

test("--minimum sets the plan floor and prints the top-up", async () => {
  const lowCsv = { readFile: async () => "r2_storage_gb,2" , stdin: async () => "" };
  const out = (await run(["estimate", "u.csv", "--minimum", "69"], lowCsv)).output;
  assert.match(out, /Top-up to the \$69\.00 plan minimum/);
  assert.match(out, /\$69\.00 +TOTAL/);
  assert.equal((await run(["estimate", "u.csv", "--minimum", "x"], io)).exitCode, 2);
});
