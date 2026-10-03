import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, summarize, normalizeUsage, CSV_TEMPLATE } from "./engine.mjs";

const item = (est, key) => est.items.find((i) => i.key === key);

test("parseUsageCsv reads header, comments, = and ignores unknown products", () => {
  const { usage, errors, unknown } = parseUsageCsv("product,usage\n# note\norgs,2\negress GB = 3_000\nmystery,3\n");
  assert.deepEqual(errors, []);
  assert.equal(usage.orgs, 2);
  assert.equal(usage.egress_gb, 3000);
  assert.deepEqual(unknown, ["mystery"]);
});

test("parseUsageCsv reports bad values", () => {
  const { errors } = parseUsageCsv("orgs,abc\negress_gb,-4\njunk");
  assert.equal(errors.length, 3);
});

test("template parses back to defaults", () => {
  const { usage, errors } = parseUsageCsv(CSV_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.deepEqual(normalizeUsage(usage), normalizeUsage({}));
});

test("estimateBill: allowances, overage arithmetic and the compute credit", () => {
  const est = estimateBill({ orgs: 1, compute_small: 2, compute_medium: 1, egress_gb: 1000, db_gb: 28, mau_thousand: 150 });
  assert.equal(item(est, "orgs").monthly, 25);
  assert.equal(item(est, "compute_small").monthly, 30);
  assert.equal(item(est, "compute_medium").monthly, 60);
  assert.equal(item(est, "egress_gb").monthly, 67.5); // 750 over x $0.09
  assert.equal(item(est, "db_gb").monthly, 2.5); // 20 over x $0.125
  assert.equal(item(est, "mau_thousand").monthly, 162.5); // 50 over x $3.25
  assert.equal(est.plan, 25);
  assert.equal(est.compute, 90);
  assert.equal(est.usageCharges, 232.5);
  assert.equal(est.credit, 10);
  assert.equal(est.total, 337.5); // 25 + 90 + 232.5 - 10
  assert.equal(est.annual, 4050);
});

test("credit offsets compute only, never the plan fee or metered usage", () => {
  const est = estimateBill({ orgs: 1, egress_gb: 1250 });
  assert.equal(est.compute, 0);
  assert.equal(est.credit, 0);
  assert.equal(est.total, 115); // 25 + 1000 x $0.09
  assert.equal(estimateBill({ orgs: 1, compute_micro: 1 }).total, 25); // credit covers the one micro
});

test("usage inside the allowances costs only the plan fee", () => {
  assert.equal(estimateBill({ orgs: 1, egress_gb: 200, db_gb: 6, mau_thousand: 90 }).total, 25);
});

test("rankLevers sorts by saving and computes each against the baseline", () => {
  const levers = rankLevers({ orgs: 1, compute_medium: 2, compute_small: 1, egress_gb: 2250, storage_gb: 600, db_gb: 108, mau_thousand: 300 });
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
  assert.equal(levers.find((l) => l.id === "cache-egress").saving, 60.75); // 30% of 2250 GB = 675 GB x $0.09
  assert.equal(levers.find((l) => l.id === "prune-database").saving, 2.7); // 20% of 108 GB = 21.6 GB x $0.125
  assert.equal(levers.find((l) => l.id === "clean-mau").saving, 97.5); // 30 thousand x $3.25
});

test("assumptions override and levers that touch nothing are omitted", () => {
  const r = rankLevers({ orgs: 1, compute_large: 1 }, undefined, { computePct: 50 });
  assert.deepEqual(r.map((l) => l.id), ["rightsize-compute"]);
  assert.equal(r[0].saving, 55);
  assert.deepEqual(rankLevers({}), []);
});

test("summarize gates on budget", () => {
  const est = estimateBill({ orgs: 2 });
  assert.equal(summarize(est, [], {}).status, "ok");
  assert.equal(summarize(est, [], { budget: 40 }).overBudget, true);
  assert.equal(summarize(est, [], { budget: 50 }).overBudget, false);
  assert.equal(summarize(estimateBill({}), []).status, "none");
});
