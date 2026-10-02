import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "./cli.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const files = { "d.json": fx("describe.json"), "m.csv": fx("metrics.csv"), "i.csv": fx("instances.csv") };
const io = { readFile: async (p) => files[p] ?? fx("instances.csv") };
const HEAD = "instance_id,class,engine,multi_az,env,avg_cpu,p95_cpu,min_freeable_gib,max_connections,storage_gib,storage_type,iops";
const fine = { readFile: async () => `${HEAD}\nweb,db.m6g.large,mysql,false,prod,40,60,4,100,100,gp3,` };
const warnOnly = { readFile: async () => `${HEAD}\nweb,db.m5.large,mysql,false,prod,40,60,4,100,100,gp3,\ndev,db.m6g.large,mysql,true,dev,40,60,4,100,100,gp3,` };

test("JSON + metrics CSV: table, findings, snapshot disclaimer", async () => {
  const r = await run(["analyze", "d.json", "m.csv"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /orders-prod/);
  assert.match(r.output, /over-provisioned/);
  assert.match(r.output, /not a bill/);
  assert.match(r.output, /representative period/);
});

test("an under-provisioned instance exits 1 by default; warnings alone exit 0 and fail with --fail-on warn", async () => {
  assert.equal((await run(["analyze", "i.csv"], io)).exitCode, 1);
  assert.equal((await run(["analyze", "x"], warnOnly)).exitCode, 0);
  assert.equal((await run(["analyze", "x", "--fail-on", "warn"], warnOnly)).exitCode, 1);
  assert.equal((await run(["analyze", "x", "--fail-on", "warn"], fine)).exitCode, 0);
});

test("--commands prints modify-db-instance lines; --json is parseable", async () => {
  const c = await run(["analyze", "i.csv", "--commands"], io);
  assert.match(c.output, /aws rds modify-db-instance --db-instance-identifier reports-staging/);
  assert.match(c.output, /restarts the instance/);
  const j = JSON.parse((await run(["analyze", "i.csv", "--json"], io)).output);
  assert.equal(j.summary.status, "error");
  assert.ok(j.commands.length >= 3);
  assert.ok(j.totals.savings > 0);
});

test("--prices file and --target-cpu change the answer; --print-prices emits the table", async () => {
  const base = JSON.parse((await run(["analyze", "i.csv", "--json"], io)).output);
  const custom = { readFile: async (p) => (p === "p.json" ? JSON.stringify({ classes: { "db.m5.2xlarge": 9 } }) : files[p]) };
  const dear = JSON.parse((await run(["analyze", "i.csv", "--json", "--prices", "p.json"], custom)).output);
  assert.ok(dear.totals.nowMonthly > base.totals.nowMonthly);
  const tight = JSON.parse((await run(["analyze", "i.csv", "--json", "--target-cpu", "10"], io)).output);
  assert.notDeepEqual(tight.commands, base.commands);
  assert.ok(JSON.parse((await run(["--print-prices"], io)).output).classes["db.m6g.large"] > 0);
});

test("bad input exits 2; stdin works", async () => {
  assert.equal((await run(["analyze", "p"], { readFile: async () => "nothing useful" })).exitCode, 2);
  assert.equal((await run(["analyze"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--bogus"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--target-cpu", "x"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--fail-on", "never"], io)).exitCode, 2);
  assert.equal((await run(["analyze", "p", "--prices", "bad"], { readFile: async (p) => (p === "bad" ? "{" : "") })).exitCode, 2);
  assert.equal((await run(["analyze", "-"], { stdin: async () => `${HEAD}\nweb,db.m6g.large,mysql,false,prod,40,60,4,100,100,gp3,` })).exitCode, 0);
  assert.equal((await run(["analyze", "nope"], { readFile: async () => { throw new Error("ENOENT"); } })).exitCode, 2);
  assert.equal((await run([], io)).exitCode, 1);
});

test("the real process reads two files", () => {
  const d = new URL("./fixtures/", import.meta.url).pathname;
  const p = spawnSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "analyze", `${d}describe.json`, `${d}metrics.csv`, "--commands"], { encoding: "utf8" });
  assert.equal(p.status, 0);
  assert.match(p.stdout, /Commands \(review each/);
});
