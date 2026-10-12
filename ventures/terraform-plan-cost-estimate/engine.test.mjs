import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parsePlan, estimatePlan, checkBudget, formatUsd, formatDelta, summarize, detectRegion, priceValues,
  PRICE_TABLE_DATE, REGION_MULTIPLIERS, PRICED_TYPES,
} from "./engine.mjs";

const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const rc = (type, actions, before, after, extra = {}) => ({
  address: `${type}.x`, mode: "managed", type, name: "x",
  change: { actions, before, after, after_unknown: {}, ...extra },
});
const est = (changes, opts) => estimatePlan({ resource_changes: changes }, opts);
const monthly = (r) => r.items[0].after;

test("price table is dated and every region multiplier is sane", () => {
  assert.match(PRICE_TABLE_DATE, /^\d{4}-\d{2}-\d{2}$/);
  for (const [r, m] of Object.entries(REGION_MULTIPLIERS)) assert.ok(m >= 1 && m < 2, r);
  assert.equal(REGION_MULTIPLIERS["us-east-1"], 1);
});

test("EC2: m5.large is 0.096/hr * 730 = $70.08", () => {
  assert.equal(monthly(est([rc("aws_instance", ["create"], null, { instance_type: "m5.large" })])), 70.08);
});

test("EC2: size ladder scales (t3.micro, m5.4xlarge)", () => {
  assert.equal(monthly(est([rc("aws_instance", ["create"], null, { instance_type: "t3.micro" })])), 7.59);
  assert.equal(monthly(est([rc("aws_instance", ["create"], null, { instance_type: "m5.4xlarge" })])), 560.64);
});

test("EC2: root and extra EBS volumes are added as components", () => {
  const r = est([rc("aws_instance", ["create"], null, {
    instance_type: "m5.large",
    root_block_device: [{ volume_size: 100, volume_type: "gp3" }],
    ebs_block_device: [{ volume_size: 500, volume_type: "st1" }],
  })]);
  assert.equal(r.items[0].after, 70.08 + 8 + 22.5);
  assert.equal(r.items[0].components.length, 3);
});

test("EC2: an unknown instance family is unpriced with a reason, not zero", () => {
  const r = est([rc("aws_instance", ["create"], null, { instance_type: "x2gd.large" })]);
  assert.equal(r.items.length, 0);
  assert.equal(r.unpriced.length, 1);
  assert.match(r.unpriced[0].reason, /not in the bundled price table/);
  assert.equal(r.partial, true);
  assert.match(summarize(r), /unpriced/);
});

test("EC2: instance_type unknown until apply is unpriced", () => {
  const r = est([rc("aws_instance", ["create"], null, {}, { after_unknown: { instance_type: true } })]);
  assert.match(r.unpriced[0].reason, /not known until apply/);
});

test("EBS: gp3 with extra iops and throughput; io2 bills iops; unknown size unpriced", () => {
  const gp3 = est([rc("aws_ebs_volume", ["create"], null, { size: 100, type: "gp3", iops: 4000, throughput: 250 })]);
  assert.equal(gp3.items[0].after, 8 + 5 + 5);
  const io2 = est([rc("aws_ebs_volume", ["create"], null, { size: 100, type: "io2", iops: 1000 })]);
  assert.equal(io2.items[0].after, 12.5 + 65);
  const unk = est([rc("aws_ebs_volume", ["create"], null, { type: "gp3" })]);
  assert.equal(unk.unpriced.length, 1);
});

test("RDS: Multi-AZ doubles instance and storage; license-included engines are caveated", () => {
  const single = est([rc("aws_db_instance", ["create"], null, { instance_class: "db.m5.large", allocated_storage: 100, storage_type: "gp3", engine: "postgres" })]);
  const multi = est([rc("aws_db_instance", ["create"], null, { instance_class: "db.m5.large", allocated_storage: 100, storage_type: "gp3", engine: "postgres", multi_az: true })]);
  assert.equal(single.items[0].after, 136.33);
  assert.equal(multi.items[0].after, 272.66);
  const oracle = est([rc("aws_db_instance", ["create"], null, { instance_class: "db.m5.large", allocated_storage: 20, engine: "oracle-ee" })]);
  assert.ok(oracle.items[0].usage.some((n) => /license-included/.test(n)));
});

test("fixed-fee services: NAT, ALB, NLB, EIP, EKS control plane", () => {
  const r = est([
    rc("aws_nat_gateway", ["create"], null, {}),
    rc("aws_lb", ["create"], null, { load_balancer_type: "network" }),
    rc("aws_eip", ["create"], null, {}),
    rc("aws_eks_cluster", ["create"], null, {}),
  ]);
  const by = Object.fromEntries(r.items.map((i) => [i.type, i.after]));
  assert.equal(by.aws_nat_gateway, 32.85);
  assert.equal(by.aws_lb, 16.43);
  assert.equal(by.aws_eip, 3.65);
  assert.equal(by.aws_eks_cluster, 73);
});

test("EKS node group multiplies by desired_size", () => {
  const r = est([rc("aws_eks_node_group", ["create"], null, { instance_types: ["m5.large"], scaling_config: [{ desired_size: 3 }] })]);
  assert.equal(r.items[0].after, 210.24);
});

test("ElastiCache: node count from num_cache_nodes and from replica groups", () => {
  const a = est([rc("aws_elasticache_cluster", ["create"], null, { node_type: "cache.t3.micro", num_cache_nodes: 2 })]);
  assert.equal(a.items[0].after, 24.82);
  const b = est([rc("aws_elasticache_replication_group", ["create"], null, { node_type: "cache.t3.micro", num_node_groups: 2, replicas_per_node_group: 1 })]);
  assert.equal(b.items[0].after, 49.64);
});

test("DynamoDB: provisioned priced, on-demand is usage-based", () => {
  const p = est([rc("aws_dynamodb_table", ["create"], null, { billing_mode: "PROVISIONED", read_capacity: 100, write_capacity: 50 })]);
  assert.equal(p.items[0].after, 33.22);
  const o = est([rc("aws_dynamodb_table", ["create"], null, { billing_mode: "PAY_PER_REQUEST" })]);
  assert.equal(o.items.length, 0);
  assert.equal(o.usageBased.length, 1);
});

test("CloudWatch: alarms and dashboards priced, log groups usage-based", () => {
  const r = est([
    rc("aws_cloudwatch_metric_alarm", ["create"], null, { period: 300 }),
    rc("aws_cloudwatch_metric_alarm", ["create"], null, { period: 10 }),
    rc("aws_cloudwatch_dashboard", ["create"], null, {}),
    rc("aws_cloudwatch_log_group", ["create"], null, {}),
  ]);
  assert.equal(r.totals.delta, 0.1 + 0.3 + 3);
  assert.equal(r.usageBased.length, 1);
});

test("S3 and Lambda are named as usage-based, never priced", () => {
  const r = est([rc("aws_s3_bucket", ["create"], null, {}), rc("aws_lambda_function", ["create"], null, {})]);
  assert.equal(r.items.length, 0);
  assert.equal(r.usageBased.length, 2);
  assert.equal(r.totals.delta, 0);
  assert.equal(r.partial, false);
});

test("delete subtracts, update is after minus before, replace is after minus before", () => {
  const del = est([rc("aws_nat_gateway", ["delete"], {}, null)]);
  assert.equal(del.totals.delta, -32.85);
  const upd = est([rc("aws_instance", ["update"], { instance_type: "m5.2xlarge" }, { instance_type: "m5.large" })]);
  assert.equal(upd.totals.delta, -210.24);
  const rep = est([rc("aws_instance", ["delete", "create"], { instance_type: "m5.large" }, { instance_type: "m5.xlarge" })]);
  assert.equal(rep.totals.delta, 70.08);
  assert.equal(rep.items[0].action, "replace");
});

test("no-op and data sources are skipped; no-charge types counted separately", () => {
  const r = est([
    rc("aws_instance", ["no-op"], { instance_type: "m5.large" }, { instance_type: "m5.large" }),
    { address: "data.aws_ami.x", mode: "data", type: "aws_ami", change: { actions: ["read"] } },
    rc("aws_iam_role", ["create"], null, {}),
    rc("aws_security_group", ["create"], null, {}),
  ]);
  assert.equal(r.items.length, 0);
  assert.equal(r.noChargeCount, 2);
  assert.equal(r.unchangedCount, 1);
});

test("an autoscaling group is unpriced, not guessed", () => {
  const r = est([rc("aws_autoscaling_group", ["create"], null, { desired_capacity: 5 })]);
  assert.equal(r.unpriced.length, 1);
  assert.match(r.unpriced[0].reason, /launch template/);
});

test("region multiplier scales hourly and storage costs; unknown region throws", () => {
  const a = est([rc("aws_nat_gateway", ["create"], null, {})], { region: "eu-central-1" });
  assert.equal(a.items[0].after, Math.round(0.045 * 730 * 1.15 * 100) / 100);
  assert.equal(a.regionMultiplier, 1.15);
  assert.throws(() => est([], { region: "mars-1" }), /Unknown region/);
});

test("detectRegion reads a literal provider region and ignores anything else", () => {
  assert.equal(detectRegion(JSON.parse(fixture("plan-mixed.json"))), "us-east-1");
  assert.equal(detectRegion({}), null);
});

test("drivers are the biggest absolute deltas, descending, at most five", () => {
  const r = estimatePlan(parsePlan(fixture("plan-mixed.json")));
  assert.equal(r.drivers.length, 5);
  for (let i = 1; i < r.drivers.length; i += 1) {
    assert.ok(Math.abs(r.drivers[i - 1].delta) >= Math.abs(r.drivers[i].delta));
  }
  assert.equal(r.drivers[0].address, "aws_eks_node_group.workers");
});

test("the mixed fixture adds up: totals equal the sum of items, and unpriced are excluded", () => {
  const r = estimatePlan(parsePlan(fixture("plan-mixed.json")));
  const sum = Math.round(r.items.reduce((s, i) => s + i.delta, 0) * 100) / 100;
  assert.equal(r.totals.delta, sum);
  assert.equal(r.totals.delta, 1277.86);
  assert.equal(r.totals.added + r.totals.removed, r.totals.delta);
  assert.deepEqual(r.unpriced.map((u) => u.address).sort(), ["aws_instance.later", "aws_opensearch_domain.search"]);
  assert.equal(r.usageBased.length, 3);
  assert.equal(r.partial, true);
});

test("the savings fixture is negative", () => {
  const r = estimatePlan(parsePlan(fixture("plan-savings.json")));
  assert.equal(r.totals.delta, -243.09);
  assert.equal(formatDelta(r.totals.delta), "-$243.09");
});

test("budget: exceeds only when strictly above; savings pass any non-negative budget", () => {
  const r = estimatePlan(parsePlan(fixture("plan-mixed.json")));
  assert.equal(checkBudget(r, 1277.86).exceeded, false);
  assert.equal(checkBudget(r, 1277.85).exceeded, true);
  assert.equal(checkBudget(estimatePlan(parsePlan(fixture("plan-savings.json"))), 0).exceeded, false);
  assert.throws(() => checkBudget(r, "lots"), /not a number/);
});

test("formatters", () => {
  assert.equal(formatUsd(1234.5), "$1,234.50");
  assert.equal(formatDelta(5), "+$5.00");
  assert.equal(formatDelta(-5), "-$5.00");
  assert.equal(formatDelta(0), "$0.00");
});

test("parsePlan rejects non-JSON and non-plans with a helpful message", () => {
  assert.throws(() => parsePlan("nope"), /not valid JSON/);
  assert.throws(() => parsePlan("[]"), /JSON object/);
  assert.throws(() => parsePlan(fixture("not-a-plan.json")), /resource_changes/);
});

test("every priced type has a pricer that does not throw on empty values", () => {
  for (const t of PRICED_TYPES) assert.doesNotThrow(() => priceValues(t, {}, { mult: 1 }), t);
});
