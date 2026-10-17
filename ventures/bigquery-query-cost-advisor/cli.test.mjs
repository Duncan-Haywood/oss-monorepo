import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fixture = new URL("./fixtures/queries.csv", import.meta.url);
const text = readFileSync(fixture, "utf8");
const io = { readFile: async () => text };

test("analyze prints guardrails and findings; warnings alone pass by default", async () => {
  const r = await run(["analyze", "q.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /--maximum_bytes_billed=/);
  assert.match(r.output, /editions-cheaper/);
});

test("--fail-on warn exits 1; a clean list passes", async () => {
  assert.equal((await run(["analyze", "q", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "q", "--fail-on", "warn"], { readFile: async () => "a,10,1,5000" })).exitCode, 0);
});

test("--json parses; --guardrail-usd and --prices change the answer", async () => {
  const j = JSON.parse((await run(["analyze", "q", "--json"], io)).output);
  const strict = JSON.parse((await run(["analyze", "q", "--json", "--guardrail-usd", "0.5"], io)).output);
  assert.ok(strict.findings.filter((f) => f.rule === "expensive-single-run").length > j.findings.filter((f) => f.rule === "expensive-single-run").length);
  const dear = JSON.parse((await run(["analyze", "q", "--json", "--prices", "p.json"], { readFile: async (p) => (p === "p.json" ? JSON.stringify({ perTib: 12.5 }) : text) })).output);
  assert.ok(dear.totals.onDemand > j.totals.onDemand);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["analyze", "q", "--guardrail-usd", "0"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "q", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "q"], { readFile: async () => "junk" })).exitCode, 2);
  assert.equal((await run(["analyze", "q"], { readFile: async () => { throw new Error("nope"); } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("real process: reads a file and exits cleanly", () => {
  const r = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", fixture.pathname], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /query group\(s\)/);
});
