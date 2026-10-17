import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const files = { "i.csv": fx("instances.csv"), "d.json": fx("describe-db-instances.json"), "m.csv": fx("metrics.csv") };
const io = { readFile: async (p) => files[p] ?? p };
const HEAD = "db_identifier,engine,instance_class,multi_az,storage_gb,cpu_avg,cpu_p95,freeable_mem_gb_min,connections_p95";
const ok = { readFile: async () => `${HEAD}\na,postgres,db.m6g.xlarge,false,100,35,55,6,100` };
const over = { readFile: async () => `${HEAD}\na,postgres,db.m6g.4xlarge,false,100,5,10,50,40` };

test("fixture with an out-of-memory-risk instance exits 1 by default and prints the verdict table and commands", async () => {
  const r = await run(["analyze", "i.csv", "--commands"], io);
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /checkout-prod/);
  assert.match(r.output, /under-provisioned/);
  assert.match(r.output, /aws rds modify-db-instance --db-instance-identifier reports-replica --db-instance-class db\.m6g\.xlarge\n/);
  assert.doesNotMatch(r.output, /--apply-immediately\n/);
  assert.match(r.output, /restarts the instance/);
  assert.match(r.output, /not a bill/);
  assert.match(r.output, /representative period/);
});

test("--apply-immediately is only printed when asked for", async () => {
  const r = await run(["analyze", "i.csv", "--commands", "--apply-immediately"], io);
  assert.match(r.output, /db-instance-class db\.m6g\.xlarge --apply-immediately/);
});

test("warnings alone exit 0; --fail-on warn exits 1; a clean fleet exits 0 either way", async () => {
  assert.equal((await run(["analyze", "x"], over)).exitCode, 0);
  assert.equal((await run(["analyze", "x", "--fail-on", "warn"], over)).exitCode, 1);
  assert.equal((await run(["analyze", "x", "--fail-on", "warn"], ok)).exitCode, 0);
  assert.equal((await run(["analyze", "x"], ok)).exitCode, 0);
});

test("describe-db-instances JSON plus a metrics CSV", async () => {
  const r = await run(["analyze", "d.json", "m.csv", "--json"], io);
  const j = JSON.parse(r.output);
  assert.equal(r.exitCode, 0);
  assert.equal(j.analysed, 3);
  assert.equal(j.summary.status, "warn");
  assert.ok(j.totals.savings > 0);
  assert.equal(j.instances.find((i) => i.id === "reports-replica").finalCls, "db.m6g.xlarge");
});

test("--cpu-target, --mem-reserve and --prices change the answer", async () => {
  const base = JSON.parse((await run(["analyze", "x", "--json"], over)).output);
  const strict = JSON.parse((await run(["analyze", "x", "--json", "--cpu-target", "20", "--mem-reserve", "60"], over)).output);
  assert.notEqual(base.instances[0].finalCls, strict.instances[0].finalCls);
  const priced = JSON.parse((await run(["analyze", "x", "--json", "--prices", "p.json"], { readFile: async (p) => (p === "p.json" ? '{"db.m6g.4xlarge": 5}' : over.readFile()) })).output);
  assert.ok(priced.totals.savings > base.totals.savings);
});

test("classes prints the embedded table", async () => {
  const r = await run(["classes"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /db\.r6g\.large\s+2 vCPU\s+16 GiB\s+\$0\.260\/hr/);
  assert.match(r.output, /approximate/);
});

test("bad input exits 2; stdin works; help exits 0", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "nothing useful" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--cpu-target", "x"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--cpu-target", "150"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--fail-on", "never"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--prices", "bad.json"], { readFile: async (p) => (p === "bad.json" ? "[1]" : "x") })).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => files["i.csv"] })).exitCode, 1);
  assert.equal((await run(["analyze", "nope"], { readFile: async () => { throw new Error("ENOENT"); } })).exitCode, 2);
  assert.equal((await run(["frobnicate"], io)).exitCode, 2);
  assert.equal((await run([], io)).exitCode, 1);
  assert.equal((await run(["--help"], io)).exitCode, 0);
});

test("a hostile identifier is shell-quoted or refused, never pasted raw into a command", async () => {
  const r = await run(["analyze", "x", "--commands"], { readFile: async () => `${HEAD}\n$(touch pwned),postgres,db.m6g.4xlarge,false,100,5,10,50,40\nok-db,postgres,db.m6g.4xlarge,false,100,5,10,50,40` });
  assert.deepEqual(r.output.split("\n").filter((l) => l.startsWith("aws rds") && l.includes("$(")), []);
  assert.match(r.output, /ignored line/);
  assert.match(r.output, /--db-instance-identifier ok-db /);
});

test("the real process reads two files and exits with the gate code", () => {
  const d = new URL("./fixtures/", import.meta.url).pathname;
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", `${d}describe-db-instances.json`, `${d}metrics.csv`, "--commands", "--fail-on", "warn"], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /aws rds modify-db-instance/);
});
