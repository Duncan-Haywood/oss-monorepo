import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, summarize, normalizeUsage, CSV_TEMPLATE } from "./engine.mjs";

const item = (est, key) => est.items.find((i) => i.key === key);

test("parseUsageCsv reads header, comments, = and ignores unknown products", () => {
  const { usage, errors, unknown } = parseUsageCsv("product,usage\n# note\ncompute_cu_hours,8\nStorage GB = 3_000\nmystery,3\n");
  assert.deepEqual(errors, []);
  assert.equal(usage.compute_cu_hours, 8);
  assert.equal(usage.storage_gb, 3000);
  assert.deepEqual(unknown, ["mystery"]);
});

test("parseUsageCsv reports bad values", () => {
  const { errors } = parseUsageCsv("compute_cu_hours,abc\nstorage_gb,-4\njunk");
  assert.equal(errors.length, 3);
});

test("template parses back to defaults", () => {
  const { usage, errors } = parseUsageCsv(CSV_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.deepEqual(normalizeUsage(usage), normalizeUsage({}));
});

test("estimateBill: allowances and overage arithmetic", () => {
  const est = estimateBill({ compute_cu_hours: 1000, storage_gb: 50, history_gb: 20, extra_branches: 20, egress_gb: 300 });
  assert.equal(item(est, "compute_cu_hours").monthly, 106); // 1000 x $0.106
  assert.equal(item(est, "storage_gb").monthly, 17.5); // 50 x $0.35
  assert.equal(item(est, "history_gb").monthly, 4); // 20 x $0.20
  assert.equal(item(est, "extra_branches").monthly, 30); // 20 x $1.50
  assert.equal(item(est, "egress_gb").monthly, 20); // 200 over x $0.10
  assert.equal(est.usageCharges, 177.5);
  assert.equal(est.minimumTopUp, 0);
  assert.equal(est.total, 177.5);
  assert.equal(est.annual, 2130);
});

test("the plan minimum is a floor on the total", () => {
  const est = estimateBill({ storage_gb: 2 });
  assert.equal(est.usageCharges, 0.7);
  assert.equal(est.minimumTopUp, 4.3);
  assert.equal(est.total, 5);
  assert.equal(estimateBill({ storage_gb: 2 }, undefined, 0).total, 0.7);
});

test("usage inside the allowances costs nothing beyond the minimum", () => {
  assert.equal(estimateBill({ egress_gb: 90 }).total, 5);
});

test("rankLevers sorts by saving and computes each against the baseline", () => {
  const levers = rankLevers({ compute_cu_hours: 1000, storage_gb: 50, history_gb: 20, extra_branches: 20, egress_gb: 300 });
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
  assert.equal(levers.find((l) => l.id === "scale-to-zero").saving, 37.1); // 350 CU-h x $0.106
  assert.equal(levers.find((l) => l.id === "rightsize-autoscaling").saving, 21.2); // 200 CU-h x $0.106
  assert.equal(levers.find((l) => l.id === "delete-stale-branches").saving, 15); // 10 branches x $1.50
  assert.equal(levers.find((l) => l.id === "cut-egress").saving, 12); // 120 GB off, 100 GB is free
});

test("assumptions override and levers that touch nothing are omitted", () => {
  const r = rankLevers({ extra_branches: 10 }, undefined, { branchPct: 100 });
  assert.deepEqual(r.map((l) => l.id), ["delete-stale-branches"]);
  assert.equal(r[0].saving, 10); // the $5 minimum still applies to the bill after
  assert.equal(r[0].after, 5);
  assert.deepEqual(rankLevers({}), []);
});

test("summarize gates on budget", () => {
  const est = estimateBill({ compute_cu_hours: 1000 });
  assert.equal(summarize(est, [], {}).status, "ok");
  assert.equal(summarize(est, [], { budget: 100 }).overBudget, true);
  assert.equal(summarize(est, [], { budget: 200 }).overBudget, false);
  assert.equal(summarize(estimateBill({}), []).status, "none");
});
