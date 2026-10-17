import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "./cli.mjs";

const SAMPLE = readFileSync(new URL("./sample.txt", import.meta.url), "utf8");
const OK = "Index Scan using users_pkey on users  (cost=0.29..8.30 rows=1 width=40) (actual time=0.020..0.022 rows=1 loops=1)\n  Index Cond: (id = 42)\nExecution Time: 0.05 ms";

test("analyze a real file: error findings exit 1 and print fixes", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pea-"));
  const f = path.join(dir, "plan.txt"); writeFileSync(f, SAMPLE);
  const { exitCode, output } = await run(["analyze", f]);
  assert.equal(exitCode, 1);
  assert.match(output, /nested-loop-seq-scan/);
  assert.match(output, /Fix: Index the join column/);
  assert.match(output, /Where the time went/);
});

test("a healthy plan exits 0", async () => {
  const { exitCode } = await run(["analyze", "-"], { stdin: async () => OK });
  assert.equal(exitCode, 0);
});

test("--max-ms turns a healthy-but-slow plan into a failing gate", async () => {
  const slow = OK.replace("0.05 ms", "400 ms");
  assert.equal((await run(["analyze", "-", "--max-ms", "500"], { stdin: async () => slow })).exitCode, 0);
  const r = await run(["analyze", "-", "--max-ms", "100"], { stdin: async () => slow });
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /Over the/);
});

test("--fail-on warn fails on a warning-only plan", async () => {
  const warnOnly = "Seq Scan on t  (cost=0.00..10.00 rows=5 width=4) (actual time=0.1..2.0 rows=2000 loops=1)\nExecution Time: 2.1 ms";
  assert.equal((await run(["analyze", "-"], { stdin: async () => warnOnly })).exitCode, 0);
  assert.equal((await run(["analyze", "-", "--fail-on", "warn"], { stdin: async () => warnOnly })).exitCode, 1);
});

test("--json is machine-readable", async () => {
  const { output } = await run(["analyze", "-", "--json"], { stdin: async () => SAMPLE });
  const j = JSON.parse(output);
  assert.equal(j.summary.status, "error");
  assert.ok(j.findings.length >= 4);
});

test("usage and bad input exit codes", async () => {
  assert.equal((await run([])).exitCode, 1);
  assert.equal((await run(["--help"])).exitCode, 0);
  assert.equal((await run(["frob"])).exitCode, 2);
  assert.equal((await run(["analyze", "-", "--max-ms", "abc"], { stdin: async () => OK })).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => "nonsense" })).exitCode, 2);
  assert.equal((await run(["analyze", "/no/such/file"])).exitCode, 2);
});
