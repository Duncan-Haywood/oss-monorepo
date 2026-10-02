import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseClass, parseInput, analyze, summarize, defaultPrices, DEFAULT_PRICES } from "./engine.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const HEAD = "instance_id,class,engine,multi_az,env,avg_cpu,p95_cpu,min_freeable_gib,max_connections,storage_gib,storage_type,iops";
const one = (row, opts) => analyze(parseInput(`${HEAD}\n${row}`), opts);
const rules = (r) => r.findings.map((f) => f.rule);

test("price table covers every required family and is editable", () => {
  for (const c of ["db.t3.micro", "db.t4g.medium", "db.m5.large", "db.m6g.xlarge", "db.m6i.2xlarge", "db.m7g.4xlarge", "db.r5.large", "db.r6g.8xlarge", "db.r6i.16xlarge", "db.r7g.large"]) {
    assert.ok(DEFAULT_PRICES.classes[c] > 0, c);
  }
  assert.ok(DEFAULT_PRICES.classes["db.m6g.large"] < DEFAULT_PRICES.classes["db.m5.large"]);
  assert.deepEqual(parseClass("db.r6g.xlarge"), { family: "r6g", size: "xlarge", index: 1, vcpu: 4, ram: 32 });
  assert.equal(parseClass("db.x2g.large"), null);
  const cheap = defaultPrices();
  cheap.classes["db.m5.xlarge"] = 0.01;
  assert.notEqual(DEFAULT_PRICES.classes["db.m5.xlarge"], 0.01, "defaultPrices returns a fresh copy");
});

test("describe-db-instances JSON and a metrics CSV merge by instance id", () => {
  const p = parseInput(`${fx("describe.json")}\n${fx("metrics.csv")}`);
  assert.equal(p.records.length, 3);
  const o = p.records.find((r) => r.id === "orders-prod");
  assert.equal(o.cls, "db.m5.2xlarge");
  assert.equal(o.p95Cpu, 22);
  assert.equal(o.env, "prod");
  assert.equal(p.sawJson, true);
});

test("over-provisioned: smaller class in the same family, saving and modify command", () => {
  const r = one("a,db.m5.2xlarge,postgres,false,prod,9,22,24,140,100,gp3,");
  assert.ok(rules(r).includes("over-provisioned"));
  const i = r.instances[0];
  assert.equal(i.target.cls, "db.m6g.xlarge");
  assert.ok(i.savings.rightsize > 0 && i.savings.graviton > 0);
  assert.match(i.command, /^aws rds modify-db-instance --db-instance-identifier a --db-instance-class db\.m6g\.xlarge/);
});

test("savings do not double count: total = now - after for a stacked change", () => {
  const r = one("b,db.r5.xlarge,mysql,true,staging,6,14,20,25,200,io1,3000");
  const i = r.instances[0];
  const p = DEFAULT_PRICES;
  const after = p.classes["db.r6g.large"] * 730 + 200 * p.storage.gp3; // single-AZ, gp3, Graviton, smaller
  assert.ok(Math.abs(i.monthlyNow - i.savings.total - after) < 0.01, `${i.monthlyNow} - ${i.savings.total} vs ${after}`);
});

test("Graviton swap alone when the size is right", () => {
  const r = one("c,db.m5.large,mysql,false,prod,40,60,4,100,100,gp3,");
  assert.deepEqual(rules(r), ["graviton-swap"]);
  assert.match(r.instances[0].command, /db\.m6g\.large/);
  assert.equal(one("c,db.m6g.large,mysql,false,prod,40,60,4,100,100,gp3,").instances[0].command, null);
  assert.deepEqual(rules(one("c,db.m5.large,oracle-ee,false,prod,40,60,4,100,100,gp3,")), ["licensed-engine"]);
});

test("storage: io1 -> gp3 saves, gp2 -> gp3 is flagged at a list-price tie, io1 over 64k IOPS is left alone", () => {
  const io = one("d,db.m6g.large,mysql,false,prod,40,60,4,100,500,io1,10000");
  assert.ok(io.instances[0].savings.storage > 500);
  assert.match(io.instances[0].command, /--storage-type gp3/);
  const gp2 = one("d,db.m6g.large,mysql,false,prod,40,60,4,100,500,gp2,");
  assert.ok(rules(gp2).includes("gp2-to-gp3"));
  assert.equal(gp2.instances[0].savings.storage, 0);
  const edited = one("d,db.m6g.large,mysql,false,prod,40,60,4,100,500,gp2,", { prices: { storage: { gp2: 0.2 } } });
  assert.ok(edited.instances[0].savings.storage > 0, "editing the price table changes the answer");
  assert.ok(!rules(one("d,db.m6g.large,mysql,false,prod,40,60,4,100,500,io1,70000")).includes("io1-to-gp3"));
  assert.ok(!rules(one("d,db.m6g.large,aurora-postgresql,false,prod,40,60,4,100,500,gp2,")).includes("gp2-to-gp3"));
});

test("Multi-AZ on non-prod is flagged by env column, tag-like name or not at all in prod", () => {
  assert.ok(rules(one("e,db.m6g.large,mysql,true,dev,40,60,4,100,100,gp3,")).includes("multi-az-nonprod"));
  assert.ok(rules(one("billing-staging-1,db.m6g.large,mysql,true,,40,60,4,100,100,gp3,")).includes("multi-az-nonprod"));
  assert.ok(!rules(one("e,db.m6g.large,mysql,true,prod,40,60,4,100,100,gp3,")).includes("multi-az-nonprod"));
  assert.ok(!rules(one("e,db.m6g.large,aurora-mysql,true,dev,40,60,4,100,100,gp3,")).includes("multi-az-nonprod"));
  const r = one("e,db.m6g.large,mysql,true,dev,40,60,4,100,100,gp3,").instances[0];
  assert.ok(Math.abs(r.savings.multiAz - r.monthlyNow / 2) < 0.01);
  assert.match(r.command, /--no-multi-az/);
});

test("idle: low CPU and no connections; the whole compute cost is the saving; no other compute rules", () => {
  const r = one("f,db.t3.large,mysql,false,prod,1.2,3,6.5,0,100,gp2,");
  assert.deepEqual(rules(r), ["idle-instance"]);
  assert.ok(Math.abs(r.instances[0].savings.idle - 0.136 * 730) < 0.01);
  assert.match(r.instances[0].command, /create-db-snapshot/);
  assert.ok(!rules(one("f,db.t3.large,mysql,false,prod,1.2,3,6.5,40,100,gp3,")).includes("idle-instance"));
});

test("under-provisioned: p95 CPU over 80% or freeable memory under 10% of RAM is an error", () => {
  const cpu = one("g,db.m6g.large,mysql,false,prod,55,91,3,100,100,gp3,");
  assert.deepEqual(rules(cpu), ["under-provisioned-cpu"]);
  assert.equal(cpu.instances[0].target.cls, "db.m6g.xlarge");
  assert.equal(cpu.instances[0].savings.total, 0);
  const mem = one("g,db.m6g.large,mysql,false,prod,20,40,0.5,100,100,gp3,");
  assert.deepEqual(rules(mem), ["under-provisioned-memory"]);
  assert.equal(summarize(mem).status, "error");
});

test("unknown class, missing metrics and an empty paste are reported rather than guessed", () => {
  assert.deepEqual(rules(one("h,db.z9.large,mysql,false,prod,1,1,1,1,1,gp3,")), ["unknown-class"]);
  const nm = analyze(parseInput(`${HEAD}\nh,db.m6g.large,mysql,false,prod,,,,,100,gp3,`));
  assert.ok(rules(nm).includes("no-metrics"));
  assert.equal(summarize(analyze(parseInput("nothing"))).status, "none");
});

test("headroom and price edits change the answer", () => {
  const row = "i,db.m5.2xlarge,postgres,false,prod,9,22,24,140,100,gp3,";
  const tight = one(row, { targetCpu: 0.6, memHeadroom: 0.2 }).instances[0];
  const loose = one(row, { targetCpu: 0.2, memHeadroom: 1 }).instances[0];
  assert.notEqual(tight.target.cls, loose.target?.cls);
  const dear = one(row, { prices: { classes: { "db.m5.2xlarge": 5 } } }).instances[0];
  assert.ok(dear.savings.rightsize > tight.savings.rightsize * 3);
});

test("summary text carries totals", () => {
  const s = summarize(analyze(parseInput(fx("instances.csv"))));
  assert.equal(s.status, "error");
  assert.match(s.text, /5 instance\(s\)/);
  assert.match(s.text, /saving/);
});
