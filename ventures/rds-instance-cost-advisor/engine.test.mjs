import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseInstances, analyze, summarize, smallerClass, gravitonTwin, HOURLY } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/instances.csv", import.meta.url), "utf8");
const by = (r) => Object.fromEntries(r.instances.map((w) => [w.name, w]));
const rule = (r, name, row) => r.findings.find((f) => f.rule === name && (row === undefined || f.row === row));

test("class helpers: one size down and the Graviton twin; unknowns are null", () => {
  assert.equal(smallerClass("db.r5.xlarge"), "db.r5.large");
  assert.equal(smallerClass("db.t3.micro"), null);
  assert.equal(gravitonTwin("db.m5.2xlarge"), "db.m6g.2xlarge");
  assert.equal(gravitonTwin("db.m6g.large"), null);
});

test("parser maps headers, reads yes/no, skips unknown classes, engines, io1 without IOPS and bad CPU", () => {
  const p = parseInstances("# c\nclass,instance,engine,multi,storage_type,gb\ndb.m5.large,A,postgres,yes,gp2,100\ndb.m5.large,B,oracle-ee,no,gp2,100\ndb.x9.huge,C,mysql,no,gp2,100\ndb.m5.large,D,mysql,no,io1,100\ndb.m5.large,E,mysql,maybe,gp2,100\n");
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].name, "A");
  assert.equal(p.rows[0].multiAz, true);
  assert.equal(p.skipped, 4);
  assert.equal(parseInstances("A,db.m5.large,mysql,no,gp2,10,,150").skipped, 1);
});

test("fixture: cost is class price x 730 h (doubled for Multi-AZ) plus storage and IOPS", () => {
  const r = analyze(parseInstances(text));
  const orders = by(r)["orders-prod"];
  const expected = HOURLY["db.m5.2xlarge"] * 730 * 2 + (1000 * 0.125 + 10000 * 0.1) * 2;
  assert.ok(Math.abs(orders.current - expected) < 1e-6);
  assert.ok(Math.abs(by(r)["reports-prod"].current - (HOURLY["db.r5.xlarge"] * 730 + 500 * 0.115)) < 1e-6);
});

test("io1 with IOPS inside the gp3 baseline saves the IOPS charge and the io1 premium; counted in totals", () => {
  const r = analyze(parseInstances(text));
  const f = rule(r, "io1-to-gp3", "orders-prod");
  assert.match(f.message, /--storage-type gp3/);
  const storageSaving = ((1000 * 0.125 + 10000 * 0.1) - 1000 * 0.115) * 2;
  const gravSaving = (HOURLY["db.m5.2xlarge"] - HOURLY["db.m6g.2xlarge"]) * 730 * 2;
  assert.ok(Math.abs(by(r)["orders-prod"].saving - (storageSaving + gravSaving)) < 1e-6);
  const over = analyze(parseInstances("A,db.m5.large,mysql,no,io1,100,5000,50,prod"));
  assert.ok(!over.findings.some((x) => x.rule === "io1-to-gp3"), "5000 IOPS on 100 GB exceeds the 3000 gp3 baseline");
});

test("Multi-AZ outside production saves half the instance and storage bill; prod Multi-AZ is left alone", () => {
  const r = analyze(parseInstances(text));
  const f = rule(r, "multi-az-nonprod", "staging-orders");
  assert.match(f.message, /--no-multi-az/);
  assert.ok(f.message.includes('"staging"'));
  assert.ok(!rule(r, "multi-az-nonprod", "orders-prod"));
  const staging = by(r)["staging-orders"];
  assert.ok(staging.saving >= staging.current / 2 - 1e-6);
});

test("idle instance saves its compute, is not also counted for other fixes, and prints the snapshot-then-delete commands", () => {
  const r = analyze(parseInstances(text));
  const f = rule(r, "idle-instance", "dev-sandbox");
  assert.match(f.message, /create-db-snapshot/);
  assert.match(f.message, /restarts by itself after 7 days/);
  const dev = by(r)["dev-sandbox"];
  assert.ok(Math.abs(dev.saving - HOURLY["db.t3.large"] * 730 * 2) < 1e-6);
  assert.ok(!rule(r, "multi-az-nonprod", "dev-sandbox"));
});

test("right-sizing and Reserved Instance figures are upper bounds, never in the totals", () => {
  const r = analyze(parseInstances(text));
  assert.ok(rule(r, "oversized-for-cpu", "analytics-legacy"));
  assert.ok(!rule(r, "oversized-for-cpu", "orders-prod"));
  assert.ok(rule(r, "reserved-instance-candidate", "orders-prod"));
  assert.ok(!rule(r, "reserved-instance-candidate", "staging-orders"));
  const counted = Object.values(by(r)).reduce((a, w) => a + w.saving, 0);
  assert.ok(Math.abs(r.totals.saving - counted) < 1e-6);
  assert.ok(r.totals.potential > 0);
});

test("prices are overridable", () => {
  const dear = analyze(parseInstances("A,db.m5.large,mysql,no,gp2,100,,50,prod"), { prices: { hourly: { "db.m5.large": 1 } } });
  assert.ok(Math.abs(dear.totals.current - (730 + 100 * 0.115)) < 1e-6);
});

test("a healthy instance is fine; summary and empty input", () => {
  const r = analyze(parseInstances("A,db.m6g.large,postgres,yes,gp3,100,,50,prod"));
  assert.ok(r.findings.some((f) => f.rule === "instances-fine") || r.findings.every((f) => f.severity === "info"));
  assert.equal(summarize(analyze(parseInstances(text))).status, "warn");
  assert.equal(summarize(analyze(parseInstances("nothing"))).status, "none");
});
