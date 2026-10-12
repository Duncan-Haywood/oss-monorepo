import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, summarize, normalizeUsage, CSV_TEMPLATE } from "./engine.mjs";

const item = (est, key) => est.items.find((i) => i.key === key);
const BIG = { workers_requests_m: 110, workers_cpu_m_ms: 530, kv_reads_m: 60, kv_writes_m: 11, r2_storage_gb: 510, r2_class_a_m: 6, r2_class_b_m: 110 };

test("parseUsageCsv reads header, comments, = and ignores unknown products", () => {
  const { usage, errors, unknown } = parseUsageCsv("product,usage\n# note\nworkers_requests_m,8\nR2 Storage GB = 3_000\nmystery,3\n");
  assert.deepEqual(errors, []);
  assert.equal(usage.workers_requests_m, 8);
  assert.equal(usage.r2_storage_gb, 3000);
  assert.deepEqual(unknown, ["mystery"]);
});

test("parseUsageCsv reports bad values", () => {
  const { errors } = parseUsageCsv("workers_requests_m,abc\nr2_storage_gb,-4\njunk");
  assert.equal(errors.length, 3);
});

test("template parses back to defaults", () => {
  const { usage, errors } = parseUsageCsv(CSV_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.deepEqual(normalizeUsage(usage), normalizeUsage({}));
});

test("estimateBill: allowances and overage arithmetic", () => {
  const est = estimateBill(BIG);
  assert.equal(item(est, "workers_requests_m").monthly, 30); // 100 over x $0.30
  assert.equal(item(est, "workers_cpu_m_ms").monthly, 10); // 500 over x $0.02
  assert.equal(item(est, "kv_reads_m").monthly, 25); // 50 over x $0.50
  assert.equal(item(est, "kv_writes_m").monthly, 50); // 10 over x $5
  assert.equal(item(est, "r2_storage_gb").monthly, 7.5); // 500 over x $0.015
  assert.equal(item(est, "r2_class_a_m").monthly, 22.5); // 5 over x $4.50
  assert.equal(item(est, "r2_class_b_m").monthly, 36); // 100 over x $0.36
  assert.equal(est.usageCharges, 181);
  assert.equal(est.minimumTopUp, 0);
  assert.equal(est.total, 181);
  assert.equal(est.annual, 2172);
});

test("the plan minimum is a floor on the total", () => {
  const est = estimateBill({ workers_requests_m: 12 });
  assert.equal(est.usageCharges, 0.6);
  assert.equal(est.minimumTopUp, 4.4);
  assert.equal(est.total, 5);
  assert.equal(estimateBill({ workers_requests_m: 12 }, undefined, 0).total, 0.6);
});

test("usage inside the allowances costs nothing beyond the minimum", () => {
  assert.equal(estimateBill({ workers_requests_m: 9, kv_reads_m: 10, r2_storage_gb: 10 }).total, 5);
});

test("rankLevers sorts by saving and computes each against the baseline", () => {
  const levers = rankLevers(BIG);
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
  const by = (id) => levers.find((l) => l.id === id);
  assert.equal(by("skip-redundant-kv-writes").saving, 22); // 11 -> 6.6 writes: 4.4 x $5
  assert.equal(by("cache-r2-reads").saving, 23.76); // 110 -> 44 reads: 66 x $0.36
  assert.equal(by("cache-kv-reads").saving, 15); // 60 -> 30 reads: 30 x $0.50
  assert.equal(by("trim-cpu-time").saving, 2.65); // 530 -> 397.5: 132.5 x $0.02
  assert.ok(by("cache-at-the-edge").saving > 0);
  assert.equal(by("expire-r2-objects").saving, 2.29); // 510 -> 357 GB: billable 500 -> 347, item lines round to cents
});

test("assumptions override and levers that touch nothing are omitted", () => {
  const r = rankLevers({ kv_writes_m: 3 }, undefined, { kvWritePct: 100 });
  assert.deepEqual(r.map((l) => l.id), ["skip-redundant-kv-writes"]);
  assert.equal(r[0].saving, 5); // $10 of usage -> $0, but the $5 minimum still applies after
  assert.equal(r[0].after, 5);
  assert.deepEqual(rankLevers({}), []);
});

test("summarize gates on budget", () => {
  const est = estimateBill(BIG);
  assert.equal(summarize(est, [], {}).status, "ok");
  assert.equal(summarize(est, [], { budget: 100 }).overBudget, true);
  assert.equal(summarize(est, [], { budget: 500 }).overBudget, false);
  assert.equal(summarize(estimateBill({}), []).status, "none");
});
