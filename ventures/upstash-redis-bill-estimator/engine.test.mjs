import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, compareFixed, cheapestFixedPlan, describeCrossover, summarize, normalizeUsage, CSV_TEMPLATE, PRICES_AS_OF } from "./engine.mjs";

const item = (est, key) => est.items.find((i) => i.key === key);

test("parseUsageCsv reads header, comments, = and ignores unknown products", () => {
  const { usage, errors, unknown } = parseUsageCsv("product,usage\n# note\ncommands_m,8\nStorage GB = 3_000\nmystery,3\n");
  assert.deepEqual(errors, []);
  assert.equal(usage.commands_m, 8);
  assert.equal(usage.storage_gb, 3000);
  assert.deepEqual(unknown, ["mystery"]);
});

test("parseUsageCsv reports bad values", () => {
  assert.equal(parseUsageCsv("commands_m,abc\nstorage_gb,-4\njunk").errors.length, 3);
});

test("template parses back to defaults", () => {
  const { usage, errors } = parseUsageCsv(CSV_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.deepEqual(normalizeUsage(usage), normalizeUsage({}));
});

test("pricing is dated and tells the reader to verify", () => {
  assert.match(PRICES_AS_OF, /2025/);
  assert.match(PRICES_AS_OF, /verify on the vendor site/);
});

test("estimateBill: free allowances and overage arithmetic", () => {
  const est = estimateBill({ commands_m: 60, storage_gb: 3, bandwidth_gb: 250 });
  assert.equal(item(est, "commands_m").monthly, 119); // 59.5 over x $2
  assert.equal(item(est, "storage_gb").monthly, 0.69); // 2.75 over x $0.25
  assert.equal(item(est, "bandwidth_gb").monthly, 1.5); // 50 over x $0.03
  assert.equal(est.total, 121.19);
  assert.equal(est.annual, 1454.28);
});

test("usage inside the free allowances costs nothing", () => {
  assert.equal(estimateBill({ commands_m: 0.4, storage_gb: 0.2, bandwidth_gb: 100 }).total, 0);
});

test("cheapestFixedPlan picks the smallest plan that holds the storage", () => {
  assert.equal(cheapestFixedPlan({ storage_gb: 0.2 }).name, "Fixed 250 MB");
  assert.equal(cheapestFixedPlan({ storage_gb: 3 }).name, "Fixed 5 GB");
  assert.equal(cheapestFixedPlan({ storage_gb: 900 }), null);
});

test("compareFixed: fixed wins at high volume, payg at low, with a crossover", () => {
  const high = compareFixed({ commands_m: 60, storage_gb: 3, bandwidth_gb: 250 });
  assert.equal(high.cheaper, "fixed");
  assert.equal(high.saving, 21.19);
  const low = compareFixed({ commands_m: 10, storage_gb: 3, bandwidth_gb: 250 });
  assert.equal(low.cheaper, "payg");
  // 5 GB plan $100; non-command cost 0.69 + 1.50 = 2.19; (100-2.19)/2 + 0.5 = 49.405 -> 49.41
  assert.equal(low.crossoverCommandsM, 49.41);
  assert.equal(compareFixed({ commands_m: 49.4, storage_gb: 3, bandwidth_gb: 250 }).cheaper, "payg");
  assert.equal(compareFixed({ commands_m: 49.5, storage_gb: 3, bandwidth_gb: 250 }).cheaper, "fixed");
});

test("compareFixed: no plan fits and fixed-always-cheaper edge cases", () => {
  const big = compareFixed({ commands_m: 5, storage_gb: 900 });
  assert.equal(big.plan, null);
  assert.equal(big.crossoverCommandsM, null);
  assert.match(describeCrossover(big), /No fixed plan/);
  const hugeBandwidth = compareFixed({ commands_m: 1, storage_gb: 0.2, bandwidth_gb: 10000 });
  assert.equal(hugeBandwidth.crossoverCommandsM, 0);
  assert.equal(hugeBandwidth.cheaper, "fixed");
});

test("rankLevers sorts by saving and computes each against the baseline", () => {
  const levers = rankLevers({ commands_m: 60, storage_gb: 3, bandwidth_gb: 250 });
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
  assert.equal(levers.find((l) => l.id === "pipeline-and-batch").saving, 36); // 18 M commands x $2
  assert.equal(levers.find((l) => l.id === "cache-hot-keys").saving, 30); // 15 M x $2
  assert.equal(levers.find((l) => l.id === "stop-polling").saving, 18);
  assert.equal(levers.find((l) => l.id === "shrink-payloads").saving, 1.5); // 100 GB off, 50 GB over the free 200
  assert.equal(levers.find((l) => l.id === "switch-to-fixed").saving, 21.19);
});

test("no switch-to-fixed lever when pay-as-you-go is cheaper; assumptions override; empty usage has no levers", () => {
  assert.ok(!rankLevers({ commands_m: 10, storage_gb: 3 }).some((l) => l.id === "switch-to-fixed"));
  const r = rankLevers({ commands_m: 10.5 }, undefined, { pipelinePct: 100, cachePct: 0, pollingPct: 0 });
  assert.equal(r[0].id, "pipeline-and-batch");
  assert.equal(r[0].saving, 20); // 10 M billable x $2
  assert.equal(r[0].after, 0);
  assert.deepEqual(rankLevers({}), []);
});

test("summarize gates on budget and mentions the crossover", () => {
  const u = { commands_m: 10, storage_gb: 3, bandwidth_gb: 250 };
  const est = estimateBill(u);
  const cmp = compareFixed(u);
  const s = summarize(est, rankLevers(u), { comparison: cmp });
  assert.equal(s.status, "ok");
  assert.match(s.text, /million commands per month/);
  assert.equal(summarize(est, [], { budget: 10 }).overBudget, true);
  assert.equal(summarize(est, [], { budget: 100 }).overBudget, false);
  assert.equal(summarize(estimateBill({}), []).status, "none");
});
