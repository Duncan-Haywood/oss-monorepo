import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/nat.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints the commands and findings; the fixture has 6 TB of S3 through NAT so exit 1", async () => {
  const r = await run(["analyze", "n.csv"], io);
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /aws ec2 create-vpc-endpoint .*--vpc-endpoint-type Gateway --service-name com\.amazonaws\.us-east-1\.s3/);
  assert.match(r.output, /nat-gateway-idle/);
});

test("--fail-on warn fails on a warning-only setup; default passes", async () => {
  const warnOnly = { readFile: async () => "n1,s3,200\nn1,internet,100" };
  assert.equal((await run(["analyze", "p"], warnOnly)).exitCode, 0);
  assert.equal((await run(["analyze", "p", "--fail-on", "warn"], warnOnly)).exitCode, 1);
});

test("--json parses; --region, --azs and --prices change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "p", "--json"], io)).output);
  assert.equal(j.summary.status, "error");
  const eu = await run(["analyze", "p", "--region", "eu-west-1"], io);
  assert.match(eu.output, /eu-west-1\.s3/);
  const wide = JSON.parse((await run(["analyze", "p", "--json", "--azs", "5"], io)).output);
  assert.ok(wide.totals.saving < j.totals.saving);
  const prices = { readFile: async (p) => (p === "pr.json" ? JSON.stringify({ natGb: 0.09 }) : text) };
  const dear = JSON.parse((await run(["analyze", "i", "--json", "--prices", "pr.json"], prices)).output);
  assert.ok(dear.totals.nat > j.totals.nat);
});

test("bad input exits 2; stdin works; no args prints usage", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "nothing useful" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--azs", "9"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--region", "mars"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--fail-on", "x"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--prices", "bad.json"], { readFile: async (p) => { if (p === "bad.json") throw new Error("nope"); return text; } })).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--prices", "neg.json"], { readFile: async (p) => (p === "neg.json" ? JSON.stringify({ natGb: -1 }) : text) })).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => text })).exitCode, 1);
  assert.equal((await run([], io)).exitCode, 1);
});

test("the real process reads the file", () => {
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /Modelled monthly cost/);
});
