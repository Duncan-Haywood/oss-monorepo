import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseInput, analyze, summarize, buildTable, CLASS_TABLE, GRAVITON_OF, maxConnections, modifyCommand, shQuote, fmtUsd } from "./engine.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const HEAD = "db_identifier,engine,instance_class,multi_az,storage_gb,cpu_avg,cpu_p95,freeable_mem_gb_min,connections_p95,count";
const one = (row, opts) => analyze(parseInput(`${HEAD}\n${row}`), opts);
const inst = (row, opts) => one(row, opts).instances[0];
const rules = (r) => r.findings.map((f) => f.rule);

test("class table: vCPU, memory and price are consistent within and across families", () => {
  assert.equal(CLASS_TABLE["db.m6g.large"].vcpu, 2);
  assert.equal(CLASS_TABLE["db.m6g.large"].memGib, 8);
  assert.equal(CLASS_TABLE["db.r6g.large"].memGib, 16);
  assert.equal(CLASS_TABLE["db.r6g.4xlarge"].memGib, 128);
  assert.equal(CLASS_TABLE["db.t4g.medium"].memGib, 4);
  assert.equal(CLASS_TABLE["db.t3.medium"].baseline, 0.2);
  for (const fam of ["m5", "m6g", "m7g", "r5", "r6g", "r7g"]) {
    assert.ok(Math.abs(CLASS_TABLE[`db.${fam}.xlarge`].price - 2 * CLASS_TABLE[`db.${fam}.large`].price) < 0.002, fam);
  }
  // Graviton is listed cheaper than the x86 class it replaces at the same shape
  for (const [x86, g] of Object.entries(GRAVITON_OF)) {
    for (const size of ["large", "xlarge"]) {
      const a = CLASS_TABLE[`db.${x86}.${size}`], b = CLASS_TABLE[`db.${g}.${size}`];
      if (!a || !b) continue;
      assert.equal(a.vcpu, b.vcpu); assert.equal(a.memGib, b.memGib);
      assert.ok(b.price < a.price, `${g}.${size}`);
    }
  }
});

test("max_connections follows the parameter-group default and is capped", () => {
  assert.equal(maxConnections(8), Math.floor((8 * 1024 ** 3) / 9531392));
  assert.equal(maxConnections(1024), 5000);
});

test("over-provisioned: steps down the family to the smallest class that fits CPU, memory and connections", () => {
  const r = inst("a,postgres,db.m6g.4xlarge,false,100,5,10,50,40,1");
  assert.equal(r.verdict, "over-provisioned");
  // 10% on 16 vCPU = 160 vCPU-% -> needs >= 3 vCPU at 70% -> 4 vCPU; memory used 14 GiB needs 14/0.8 = 17.5 -> 32 GiB
  assert.equal(r.target, "db.m6g.2xlarge");
  assert.equal(r.finalCls, "db.m6g.2xlarge");
  assert.ok(r.savings > 0);
  assert.equal(r.command, "aws rds modify-db-instance --db-instance-identifier a --db-instance-class db.m6g.2xlarge");
});

test("a smaller class is rejected when memory headroom would drop under the reserve", () => {
  // used peak 20 GiB of 32: xlarge (16 GiB) cannot hold it, so stay.
  const r = inst("a,postgres,db.m6g.2xlarge,false,100,5,8,12,10,1");
  assert.equal(r.verdict, "right-sized");
  assert.equal(r.target, null);
  assert.ok(rules(one("a,postgres,db.m6g.2xlarge,false,100,5,8,12,10,1")).includes("memory-bound"));
  // with a 0% reserve the same instance may shrink only if used <= 16: it is 20, so still stays
  assert.equal(inst("a,postgres,db.m6g.2xlarge,false,100,5,8,12,10,1", { memReserve: 0 }).target, null);
  // but 30 GiB free (2 GiB used) moves down
  assert.equal(inst("a,postgres,db.m6g.2xlarge,false,100,5,8,30,10,1").target, "db.m6g.large");
});

test("no memory data means no downsizing recommendation", () => {
  const r = one("a,postgres,db.m6g.2xlarge,false,100,5,8,,10,1");
  assert.equal(r.instances[0].verdict, "right-sized");
  assert.ok(rules(r).includes("no-memory-data"));
});

test("connections can block a downsize and flag the current class", () => {
  const r = inst("a,mysql,db.m6g.2xlarge,false,100,5,8,30,2000,1");
  assert.equal(r.target, null); // large (8 GiB, ~901 conns) cannot hold 2000
  const hot = one("a,mysql,db.m6g.large,false,100,20,30,5,1100,1");
  assert.ok(rules(hot).includes("connections-near-max"));
  assert.equal(hot.instances[0].verdict, "under-provisioned");
  assert.equal(hot.instances[0].target, "db.m6g.xlarge"); // 16 GiB -> ~1802 connections, 1100 <= 80%
});

test("under-provisioned: CPU saturation and memory pressure are errors; the next larger class that fits is recommended", () => {
  const cpu = one("a,mysql,db.m6g.xlarge,false,100,80,97,8,100,1");
  assert.ok(rules(cpu).includes("cpu-saturated"));
  assert.equal(cpu.instances[0].verdict, "under-provisioned");
  assert.equal(cpu.instances[0].target, "db.m6g.2xlarge"); // 97% * 4/8 = 48.5%
  assert.equal(summarize(cpu).status, "error");
  const mem = one("a,postgres,db.r6g.large,false,100,20,30,0.8,50,1");
  assert.ok(rules(mem).includes("memory-pressure"));
  assert.equal(mem.instances[0].target, "db.r6g.xlarge");
  assert.ok(mem.instances[0].savings < 0);
  assert.ok(mem.totals.added > 0 && mem.totals.savings === 0);
  const warn = one("a,mysql,db.m6g.xlarge,false,100,60,88,8,100,1");
  assert.ok(rules(warn).includes("cpu-high"));
  assert.equal(summarize(warn).status, "warn");
});

test("right-sized instance produces no warnings, no command and an ok summary", () => {
  const r = one("a,postgres,db.m6g.xlarge,false,100,35,55,6,100,1");
  assert.equal(r.instances[0].verdict, "right-sized");
  assert.equal(r.instances[0].command, null);
  assert.equal(summarize(r).status, "ok");
  assert.equal(r.totals.savings, 0);
});

test("burstable: average above the credit baseline is flagged, and a t3 shrink respects the target baseline", () => {
  const hot = one("a,mysql,db.t3.medium,false,20,45,60,2,10,1");
  assert.ok(rules(hot).includes("burstable-credit-risk"));
  assert.equal(hot.instances[0].verdict, "under-provisioned");
  // idle t3.xlarge (4 vCPU): on medium (2 vCPU) the 8% average becomes 16%, under medium's 20% baseline;
  // small (2 GiB) would not hold the 2 GiB peak with a 20% reserve
  const idle = inst("a,mysql,db.t3.xlarge,false,20,8,20,14,10,1");
  assert.equal(idle.verdict, "over-provisioned");
  assert.equal(idle.target, "db.t3.medium");
  // 12% average doubles to 24% on 2 vCPU: over medium's 20% baseline, so the credit check rejects it and large (30%) is chosen
  assert.equal(inst("a,mysql,db.t3.xlarge,false,20,12,20,14,10,1").target, "db.t3.large");
  // avg 15% on 2 vCPU: small/medium baseline is 20% (same vCPU), micro baseline 10% fails -> never micro
  const mid = inst("a,mysql,db.t3.large,false,20,15,30,6,10,1");
  assert.notEqual(mid.target, "db.t3.micro");
});

test("Graviton: x86 classes get the same-size g class and the listed difference; engines without Graviton do not", () => {
  const r = inst("a,postgres,db.m5.xlarge,false,100,35,55,6,100,1");
  assert.equal(r.graviton, "db.m6g.xlarge");
  assert.equal(r.finalCls, "db.m6g.xlarge");
  const expected = (CLASS_TABLE["db.m5.xlarge"].price - CLASS_TABLE["db.m6g.xlarge"].price) * 730;
  assert.ok(Math.abs(r.savings - expected) < 0.01);
  assert.equal(inst("a,postgres,db.r6i.large,false,100,35,55,10,100,1").graviton, "db.r6g.large");
  assert.equal(inst("a,postgres,db.t3.medium,false,100,10,20,1.2,10,1").graviton, "db.t4g.medium");
  // already Graviton: nothing to add
  assert.equal(inst("a,postgres,db.m6g.xlarge,false,100,35,55,6,100,1").graviton, null);
  // Oracle and SQL Server cannot run on Graviton
  const ora = one("a,oracle-ee,db.m5.xlarge,false,100,35,55,6,100,1");
  assert.equal(ora.instances[0].graviton, null);
  assert.ok(rules(ora).includes("pricing-approx"));
  assert.equal(inst("a,sqlserver-se,db.m5.xlarge,false,100,35,55,6,100,1").graviton, null);
});

test("Graviton stacks with a downsize: the recommendation is the g class at the smaller size", () => {
  const r = inst("a,postgres,db.m5.4xlarge,false,100,5,10,40,40,1");
  assert.equal(r.verdict, "over-provisioned");
  assert.equal(r.target, "db.m5.2xlarge");
  assert.equal(r.finalCls, "db.m6g.2xlarge");
  const expected = (CLASS_TABLE["db.m5.4xlarge"].price - CLASS_TABLE["db.m6g.2xlarge"].price) * 730;
  assert.ok(Math.abs(r.savings - expected) < 0.01);
});

test("Multi-AZ doubles the instance cost and the saving; Aurora ignores the Multi-AZ column; count multiplies", () => {
  const single = inst("a,postgres,db.m6g.4xlarge,false,100,5,10,50,40,1");
  const multi = inst("a,postgres,db.m6g.4xlarge,true,100,5,10,50,40,1");
  assert.ok(Math.abs(multi.monthlyNow - 2 * single.monthlyNow) < 0.01);
  assert.ok(Math.abs(multi.savings - 2 * single.savings) < 0.01);
  const aurora = inst("a,aurora-postgresql,db.r6g.2xlarge,true,0,5,10,60,40,1");
  const auroraSingle = inst("a,aurora-postgresql,db.r6g.2xlarge,false,0,5,10,60,40,1");
  assert.equal(aurora.monthlyNow, auroraSingle.monthlyNow);
  const three = inst("a,aurora-postgresql,db.r6g.2xlarge,false,0,5,10,60,40,3");
  assert.ok(Math.abs(three.monthlyNow - 3 * auroraSingle.monthlyNow) < 0.01);
  assert.ok(Math.abs(CLASS_TABLE["db.m6g.4xlarge"].price * 730 - single.monthlyNow) < 0.01);
});

test("modify command: apply-immediately only on request, and hostile identifiers are quoted", () => {
  assert.ok(!inst("a,postgres,db.m6g.4xlarge,false,100,5,10,50,40,1").command.includes("--apply-immediately"));
  assert.ok(inst("a,postgres,db.m6g.4xlarge,false,100,5,10,50,40,1", { applyImmediately: true }).command.endsWith(" --apply-immediately"));
  assert.equal(shQuote("prod-db_1.x"), "prod-db_1.x");
  assert.equal(shQuote("a;rm -rf ~"), "'a;rm -rf ~'");
  assert.equal(shQuote("it's"), "'it'\\''s'");
  assert.equal(modifyCommand("x", "db.m6g.large"), "aws rds modify-db-instance --db-instance-identifier x --db-instance-class db.m6g.large");
  // ids with metacharacters are refused at parse time
  const p = parseInput(`${HEAD}\nbad;id,postgres,db.m6g.large,false,1,1,1,1,1,1`);
  assert.equal(p.instances.length, 0);
  assert.ok(p.issues.length);
});

test("describe-db-instances JSON joined with a metrics-only CSV by identifier", () => {
  const p = parseInput(fx("describe-db-instances.json") + fx("metrics.csv"));
  assert.ok(p.sources.json && p.sources.csv);
  assert.equal(p.instances.length, 4);
  const orders = p.instances.find((i) => i.id === "orders-prod");
  assert.equal(orders.cls, "db.r5.2xlarge");
  assert.equal(orders.multiAz, true);
  assert.equal(orders.storageGb, 500);
  assert.equal(orders.cpuP95, 22);
  const r = analyze(p);
  assert.equal(r.count, 4);
  assert.equal(r.analysed, 3);
  const legacy = r.instances.find((i) => i.id === "legacy-oracle");
  assert.equal(legacy.verdict, "no-data");
  assert.ok(rules(r).includes("no-metrics"));
});

test("CSV: header optional, subset columns by name, % and blanks tolerated, bad numbers reported", () => {
  const noHead = parseInput("a,postgres,db.m6g.large,no,100,10%,20%,5,10,1");
  assert.equal(noHead.instances[0].cpuP95, 20);
  assert.equal(noHead.instances[0].multiAz, false);
  const sub = parseInput("db_identifier,cpu_p95\nx,33");
  assert.equal(sub.instances[0].cpuP95, 33);
  const bad = parseInput(`${HEAD}\nz,postgres,db.m6g.large,false,100,10,abc,5,10,1\ny,postgres,db.m6g.large,false,100,10,140,5,10,1`);
  assert.ok(bad.issues.some((s) => /z: not a non-negative number/.test(s)));
  assert.ok(bad.issues.some((s) => /y: cpuP95 is a percentage/.test(s)));
  assert.equal(parseInput("hello world").instances.length, 0);
});

test("unknown class is reported, not guessed; price overrides add and change classes", () => {
  const r = one("a,postgres,db.x2g.large,false,100,10,20,5,10,1");
  assert.equal(r.instances[0].verdict, "unknown-class");
  assert.equal(r.analysed, 0);
  assert.equal(summarize(r).status, "none");
  const custom = one("a,postgres,db.x2g.large,false,100,10,20,5,10,1", { prices: { "db.x2g.large": { price: 0.4, vcpu: 2, memGib: 16 } } });
  assert.equal(custom.analysed, 1);
  const pricier = inst("a,postgres,db.m6g.4xlarge,false,100,5,10,50,40,1", { prices: { "db.m6g.4xlarge": 2.4 } });
  const base = inst("a,postgres,db.m6g.4xlarge,false,100,5,10,50,40,1");
  assert.ok(pricier.savings > base.savings);
  const t = buildTable({ "nonsense": 1, "db.m6g.large": "x", "db.m6g.xlarge": -2 });
  assert.equal(t.issues.length, 3);
});

test("editable targets change the answer", () => {
  const row = "a,postgres,db.m6g.4xlarge,false,100,10,20,56,40,1";
  const tight = inst(row, { cpuTarget: 0.5 });
  const loose = inst(row, { cpuTarget: 0.9 });
  const rank = (c) => CLASS_TABLE[c].price;
  assert.ok(rank(loose.target) < rank(tight.target));
});

test("fixture end to end: verdict mix and totals", () => {
  const r = analyze(parseInput(fx("instances.csv")));
  const by = Object.fromEntries(r.instances.map((i) => [i.id, i.verdict]));
  assert.deepEqual(by, { "orders-prod": "right-sized", "reports-replica": "over-provisioned", "checkout-prod": "under-provisioned", "dev-sandbox": "over-provisioned", "analytics-aurora": "under-provisioned", "billing-prod": "under-provisioned" });
  assert.ok(r.totals.savings > 0 && r.totals.added > 0);
  assert.equal(summarize(r).status, "error");
  assert.equal(fmtUsd(1234.6), "$1,235");
  assert.equal(fmtUsd(-5), "-$5");
});
