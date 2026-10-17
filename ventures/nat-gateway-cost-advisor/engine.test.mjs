import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTraffic, analyze, summarize, endpointEconomics, normalizeDestination, endpointCommands, DEFAULTS, DEFAULT_PRICES } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/nat.csv", import.meta.url), "utf8");
const plan = (r, s) => r.plans.find((p) => p.service === s);

test("parser maps header columns, aliases destinations, skips bad rows", () => {
  const p = parseTraffic("# c\ndestination,gb,gateway,vpc\nCloudWatch-Logs,10,nat-1,vpc-a\nweird.example.com,5,nat-1,vpc-a\nS3,x,nat-1\n,3,nat-1\n");
  assert.equal(p.rows.length, 2);
  assert.deepEqual([p.rows[0].gateway, p.rows[0].destination, p.rows[0].vpc], ["nat-1", "logs", "vpc-a"]);
  assert.equal(p.rows[1].destination, "internet");
  assert.equal(p.skipped, 2);
  assert.equal(normalizeDestination("DDB"), "dynamodb");
});

test("gateway endpoints save the whole NAT processing charge", () => {
  const e = endpointEconomics("s3", 1000, DEFAULTS);
  assert.ok(Math.abs(e.net - 45) < 1e-9);
  assert.equal(e.endpointCost, 0);
});

test("interface endpoint: hourly fee per endpoint per AZ plus $0.01/GB, break-even is exact", () => {
  const e = endpointEconomics("ssm", 5000, { ...DEFAULTS, azs: 3 });
  const fixed = 3 * 3 * 0.01 * 730;
  assert.ok(Math.abs(e.fixed - fixed) < 1e-9);
  assert.ok(Math.abs(e.endpointCost - (fixed + 50)) < 1e-9);
  const at = endpointEconomics("ssm", e.breakEvenGb, { ...DEFAULTS, azs: 3 });
  assert.ok(Math.abs(at.net) < 1e-6);
});

test("the fixture: S3 is an error, logs a warning, small interface services are info, the idle gateway is flagged", () => {
  const r = analyze(parseTraffic(text));
  assert.equal(r.findings.find((f) => f.rule === "gateway-endpoint-free" && f.row === "s3").severity, "error");
  assert.equal(r.findings.find((f) => f.rule === "gateway-endpoint-free" && f.row === "dynamodb").severity, "warn");
  assert.ok(plan(r, "s3").gb === 6000, "s3 rows from two gateways are combined");
  assert.ok(plan(r, "logs").worth);
  assert.ok(!plan(r, "sts").worth && !plan(r, "ssm").worth);
  assert.ok(r.findings.some((f) => f.rule === "nat-gateway-idle" && f.row === "nat-0c3"));
  assert.equal(summarize(r).status, "error");
});

test("NAT cost is hourly plus public IPv4 plus per-GB, and totals add up", () => {
  const r = analyze(parseTraffic("nat-1,internet,1000"));
  assert.ok(Math.abs(r.totals.nat - ((0.045 + 0.005) * 730 + 45)) < 1e-9);
  const f = analyze(parseTraffic(text));
  assert.ok(Math.abs(f.totals.nat - f.totals.after - f.totals.saving) < 1e-6);
});

test("an interface endpoint is not recommended below break-even; more AZs raise the bar", () => {
  const small = analyze(parseTraffic("nat-1,logs,300"));
  assert.ok(!plan(small, "logs").worth);
  const mid = parseTraffic("nat-1,logs,700");
  assert.ok(plan(analyze(mid, { azs: 1 }), "logs").worth);
  assert.ok(!plan(analyze(mid, { azs: 4 }), "logs").worth);
});

test("vpc column keeps endpoints per VPC; commands name the region and endpoint set", () => {
  const r = analyze(parseTraffic("gateway,destination,gb,vpc\nn1,s3,500,vpc-a\nn2,s3,500,vpc-b"));
  assert.equal(r.plans.length, 2);
  const cmds = endpointCommands("ecr", "eu-west-1", "vpc-a");
  assert.equal(cmds.length, 2);
  assert.match(cmds[0], /--vpc-id vpc-a .*com\.amazonaws\.eu-west-1\.ecr\.api/);
  assert.match(plan(r, "s3").commands[0], /Gateway/);
});

test("internet-dominant traffic is explained, and a clean small setup reports nat-fine", () => {
  const r = analyze(parseTraffic("n1,internet,3000\nn1,s3,100"), { idleGb: 0 });
  assert.ok(r.findings.some((f) => f.rule === "internet-dominant"));
  const ok = analyze(parseTraffic("n1,internet,100\nn1,s3,50"), { idleGb: 0 });
  assert.ok(ok.findings.some((f) => f.rule === "nat-fine"));
  assert.equal(summarize(analyze(parseTraffic("nothing"))).status, "none");
});

test("custom prices flow through", () => {
  const r = analyze(parseTraffic("n1,s3,1000"), { prices: { ...DEFAULT_PRICES, natGb: 0.09 } });
  assert.ok(Math.abs(plan(r, "s3").net - 90) < 1e-9);
});
