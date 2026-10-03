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
  const est = estimateBill({ pro_orgs: 2, compute_usd: 70, db_disk_gb: 28, egress_gb: 750, storage_gb: 300, mau_thousand: 120 });
  assert.equal(item(est, "pro_orgs").monthly, 50); // 2 x $25
  assert.equal(item(est, "compute_usd").monthly, 60); // $10 credit off $70
  assert.equal(item(est, "db_disk_gb").monthly, 2.5); // 20 GB over x $0.125
  assert.equal(item(est, "egress_gb").monthly, 45); // 500 GB over x $0.09
  assert.equal(item(est, "storage_gb").monthly, 4.2); // 200 GB over x $0.021
  assert.equal(item(est, "mau_thousand").monthly, 65); // 20 thousand over x $3.25
  assert.equal(est.usageCharges, 176.7);
  assert.equal(est.credit, 0);
  assert.equal(est.total, 226.7);
  assert.equal(est.annual, 2720.4);
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
  const levers = rankLevers({ pro_orgs: 5, compute_usd: 110, egress_gb: 1250, storage_gb: 500 });
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
  assert.equal(levers.find((l) => l.id === "trim-egress").saving, 33.75); // 1250 -> 875 GB, 375 GB less over the allowance x $0.09 = 1000 to 625 GB billable
  assert.equal(levers.find((l) => l.id === "merge-orgs").saving, 25); // 1 org x $25
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
