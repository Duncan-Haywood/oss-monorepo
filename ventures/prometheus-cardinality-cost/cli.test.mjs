import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const metrics = Array.from({ length: 80 }, (_, i) => `req_total{path="/p${i}"} 1`).join("\n");
const files = { "m.txt": metrics, "empty.txt": "", "p.json": JSON.stringify({ x: { label: "X", perThousand: 1, free: 0 } }) };
const io = { readFile: async (p) => { if (p in files) return files[p]; throw new Error("ENOENT"); }, stdin: async () => metrics };

test("analyze prints series, finding, savings and cost", async () => {
  const { exitCode, output } = await run(["analyze", "m.txt", "--targets", "10"], io);
  assert.equal(exitCode, 0);
  assert.match(output, /80 series across 1 metric/);
  assert.match(output, /high-cardinality-label/);
  assert.match(output, /drop "path" from req_total/);
  assert.match(output, /Grafana Cloud/);
});

test("reads stdin with -", async () => {
  const { output } = await run(["analyze", "-"], io);
  assert.match(output, /80 series/);
});

test("--max-series is a gate: exit 1 over budget, 0 under", async () => {
  assert.equal((await run(["analyze", "m.txt", "--max-series", "50"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "m.txt", "--max-series", "500"], io)).exitCode, 0);
  assert.equal((await run(["analyze", "m.txt", "--targets", "10", "--max-series", "500"], io)).exitCode, 1);
});

test("--fail-on warn fails on warnings", async () => {
  assert.equal((await run(["analyze", "m.txt", "--fail-on", "warn"], io)).exitCode, 1);
});

test("--json is machine readable; --prices overrides", async () => {
  const { output } = await run(["analyze", "m.txt", "--json", "--prices", "p.json", "--targets", "1000"], io);
  const j = JSON.parse(output);
  assert.equal(j.totalSeries, 80);
  assert.equal(j.estimate.costs[0].monthly, 80);
});

test("bad input exits 2", async () => {
  assert.equal((await run(["analyze", "nope.txt"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "m.txt", "--targets", "x"], io)).exitCode, 2);
  assert.equal((await run(["frob"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "m.txt", "--bogus"], io)).exitCode, 2);
  assert.equal((await run([], io)).exitCode, 1);
});
