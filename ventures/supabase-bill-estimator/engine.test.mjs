import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, summarize, normalizeUsage, CSV_TEMPLATE } from "./engine.mjs";

const item = (est, key) => est.items.find((i) => i.key === key);

test("parseUsageCsv reads header, comments, = and ignores unknown products", () => {
  const { usage, errors, unknown } = parseUsageCsv("product,usage\n# note\npro_orgs,8\nEgress GB = 3_000\nmystery,3\n");
  assert.deepEqual(errors, []);
  assert.equal(usage.pro_orgs, 8);
  assert.equal(usage.egress_gb, 3000);
  assert.deepEqual(unknown, ["mystery"]);
});

test("parseUsageCsv reports bad values", () => {
  const { errors } = parseUsageCsv("pro_orgs,abc\negress_gb,-4\njunk");
  assert.equal(errors.length, 3);
});

test("template parses back to defaults", () => {
  const { usage, errors } = parseUsageCsv(CSV_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.deepEqual(normalizeUsage(usage), normalizeUsage({}));
});

test("estimateBill: allowances and overage arithmetic", () => {
  const est = estimateBill({ pro_orgs: 1, compute_usd: 70, db_disk_gb: 28, egress_gb: 750, storage_gb: 300, mau_thousand: 120 });
  assert.equal(item(est, "pro_orgs").monthly, 25);
  assert.equal(item(est, "compute_usd").monthly, 60); // $10 credit off $70
  assert.equal(item(est, "db_disk_gb").monthly, 2.5); // 20 GB over x $0.125
  assert.equal(item(est, "egress_gb").monthly, 45); // 500 GB over x $0.09
  assert.equal(item(est, "storage_gb").monthly, 4.2); // 200 GB over x $0.021
  assert.equal(item(est, "mau_thousand").monthly, 65); // 20 thousand over x $3.25
  assert.equal(est.usageCharges, 176.7);
  assert.equal(est.credit, 0);
  assert.equal(est.total, 201.7);
  assert.equal(est.annual, 2420.4);
});

test("each Pro organization brings its own quotas and $10 compute credit (disk is per project)", () => {
  // Quality census 2026-11-15-8354: two orgs, each inside its own quota, were billed $409.60.
  const inside = estimateBill({ pro_orgs: 2, compute_usd: 20, egress_gb: 500, mau_thousand: 200, storage_gb: 200 });
  assert.equal(inside.total, 50); // 2 x $25, nothing over
  const est = estimateBill({ pro_orgs: 2, compute_usd: 70, db_disk_gb: 28, egress_gb: 750, storage_gb: 300, mau_thousand: 120 });
  assert.equal(item(est, "compute_usd").monthly, 50); // 2 x $10 credit off $70
  assert.equal(item(est, "db_disk_gb").monthly, 2.5); // disk allowance not doubled
  assert.equal(item(est, "egress_gb").monthly, 22.5); // 750 - 2 x 250 = 250 GB x $0.09
  assert.equal(item(est, "storage_gb").monthly, 2.1); // 300 - 2 x 100 = 100 GB x $0.021
  assert.equal(item(est, "mau_thousand").monthly, 0); // 120 thousand inside 2 x 100
  assert.equal(est.total, 127.1);
});

test("an optional extra credit never exceeds usage charges and never offsets the org fee", () => {
  const est = estimateBill({ pro_orgs: 3, egress_gb: 250 }, undefined, 20);
  assert.equal(est.usageCharges, 0);
  assert.equal(est.credit, 0);
  assert.equal(est.total, 75);
  assert.equal(estimateBill({ pro_orgs: 1, egress_gb: 350 }, undefined, 5).credit, 5);
});

test("usage inside the allowances costs only the organization fee", () => {
  assert.equal(estimateBill({ pro_orgs: 1, egress_gb: 200, compute_usd: 10, db_disk_gb: 8 }).total, 25);
});

test("rankLevers sorts by saving and computes each against the baseline", () => {
  const levers = rankLevers({ pro_orgs: 5, compute_usd: 110, egress_gb: 2500, storage_gb: 500 });
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
  assert.equal(levers.find((l) => l.id === "trim-egress").saving, 67.5); // 2500 -> 1750 GB against 5 x 250 included: 1250 to 500 GB billable x $0.09
  // Merging one of five orgs saves $25 but gives up its quotas and credit ($10 compute + 250 GB egress + 100 GB storage = $34.60), so it is not offered.
  assert.equal(levers.find((l) => l.id === "merge-orgs"), undefined);
  assert.equal(levers.find((l) => l.id === "rightsize-compute").saving, 33); // 30% of $110
});

test("assumptions override and levers that touch nothing are omitted", () => {
  const r = rankLevers({ pro_orgs: 10 }, undefined, { orgPct: 50 });
  assert.deepEqual(r.map((l) => l.id), ["merge-orgs"]);
  assert.equal(r[0].saving, 125);
  assert.deepEqual(rankLevers({}), []);
});

test("summarize gates on budget", () => {
  const est = estimateBill({ pro_orgs: 2 });
  assert.equal(summarize(est, [], {}).status, "ok");
  assert.equal(summarize(est, [], { budget: 40 }).overBudget, true);
  assert.equal(summarize(est, [], { budget: 100 }).overBudget, false);
  assert.equal(summarize(estimateBill({}), []).status, "none");
});
