import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const files = { "top.txt": fx("top.txt"), "pods.json": fx("pods.json"), "c.csv": fx("containers.csv") };
const io = { readFile: async (p) => files[p] ?? fx("containers.csv") };
const ok = { readFile: async () => "ns,web,web,200m,256Mi,170m,200Mi,2" };

test("top + pods JSON: table, findings, snapshot note; an out-of-memory risk exits 1 by default", async () => {
  const r = await run(["analyze", "top.txt", "pods.json"], io);
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /prod\/api/);
  assert.match(r.output, /oom-risk/);
  assert.match(r.output, /single sample/);
  assert.match(r.output, /not a bill/);
});

test("CSV only: warnings alone exit 0, --fail-on warn exits 1", async () => {
  const csv = await run(["analyze", "c.csv"], io);
  assert.equal(csv.exitCode, 0);
  assert.match(csv.output, /memory-overprovisioned/);
  assert.equal((await run(["analyze", "c.csv", "--fail-on", "warn"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "c.csv", "--fail-on", "warn"], ok)).exitCode, 0);
});

test("--patch prints YAML; --json is parseable and carries patches and totals", async () => {
  const p = await run(["analyze", "c.csv", "--patch"], io);
  assert.match(p.output, /containers:\n\s+- name: api/);
  const j = JSON.parse((await run(["analyze", "c.csv", "--json"], io)).output);
  assert.equal(j.summary.status, "warn");
  assert.ok(j.patches.length > 0);
  assert.ok(j.totals.savings > 0);
});

test("editable headroom and prices change the answer", async () => {
  const base = JSON.parse((await run(["analyze", "c.csv", "--json"], io)).output);
  const hi = JSON.parse((await run(["analyze", "c.csv", "--json", "--cpu-headroom", "100", "--mem-headroom", "100", "--cpu-price", "0.1", "--mem-price", "0.01"], io)).output);
  assert.ok(hi.totals.nowMonthly > base.totals.nowMonthly * 2);
  const a = base.containers.find((c) => c.container === "api");
  const b = hi.containers.find((c) => c.container === "api");
  assert.ok(b.cpu.rec > a.cpu.rec);
});

test("bad input exits 2; stdin works", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "nothing useful" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--cpu-headroom", "x"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--fail-on", "never"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => files["c.csv"] })).exitCode, 0);
  assert.equal((await run(["analyze", "nope"], { readFile: async () => { throw new Error("ENOENT"); } })).exitCode, 2);
  assert.equal((await run([], io)).exitCode, 1);
});

test("the real process reads two files", () => {
  const d = new URL("./fixtures/", import.meta.url).pathname;
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", `${d}top.txt`, `${d}pods.json`, "--patch"], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /Patch snippets/);
});
