import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseVolume } from "./cli.mjs";

const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/workload.txt", import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("parseVolume understands suffixes", () => {
  assert.equal(parseVolume("20M"), 20e6);
  assert.equal(parseVolume("1,500k"), 1.5e6);
  assert.ok(Number.isNaN(parseVolume("lots")));
});

test("compare prints each platform and the break-even", () => {
  const r = run("compare", "--requests", "10M");
  assert.equal(r.status, 0);
  for (const name of ["lambda", "cloud-run", "fargate", "ec2"]) assert.match(r.stdout, new RegExp(name));
  assert.match(r.stdout, /Break-even vs Fargate/);
  assert.match(r.stdout, /not a bill/);
});

test("compare reads a workload file, flags override it, --json is valid", () => {
  const r = run("compare", FIXTURE, "--requests", "1M", "--json");
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.workload.requestsPerMonth, 1e6);
  assert.equal(j.workload.durationMs, 180);
  assert.ok(Array.isArray(j.sensitivity));
});

test("--expect gates CI on the cheapest platform", () => {
  assert.equal(run("compare", "--requests", "500M", "--concurrency", "20", "--expect", "fargate").status, 0);
  assert.equal(run("compare", "--requests", "500M", "--concurrency", "20", "--expect", "lambda").status, 1);
  assert.equal(run("compare", "--expect", "azure").status, 2);
});

test("breakeven prints a volume; bad usage exits 2", () => {
  const r = run("breakeven");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Fargate becomes cheaper than Lambda at about \d/);
  assert.equal(run().status, 2);
  assert.equal(run("compare", "--bogus").status, 2);
  assert.equal(run("compare", "--requests", "lots").status, 2);
  assert.equal(run("frobnicate").status, 2);
  assert.equal(run("--help").status, 0);
});

test("price overrides change the answer", () => {
  const base = JSON.parse(run("compare", "--json").stdout).results.lambda.total;
  const cheap = JSON.parse(run("compare", "--json", "--lambda-per-m-req", "0").stdout).results.lambda.total;
  assert.ok(cheap < base);
});
