import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, summarize, normalizeUsage, CSV_TEMPLATE } from "./engine.mjs";

const item = (est, key) => est.items.find((i) => i.key === key);

test("parseUsageCsv reads header, comments, = and ignores unknown products", () => {
  const { usage, errors, unknown } = parseUsageCsv("product,usage\n# note\ninfra_pro_hosts,50\nLogs Ingested GB = 1_000\nmystery,3\nbilling,Monthly\n");
  assert.deepEqual(errors, []);
  assert.equal(usage.infra_pro_hosts, 50);
  assert.equal(usage.logs_ingested_gb, 1000);
  assert.equal(usage.billing, "monthly");
  assert.deepEqual(unknown, ["mystery"]);
});

test("parseUsageCsv reports bad values", () => {
  const { errors } = parseUsageCsv("containers,abc\nlogs_retention_days,10\nbilling,weekly\njunk");
  assert.equal(errors.length, 4);
});

test("template parses back to defaults", () => {
  const { usage, errors } = parseUsageCsv(CSV_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.deepEqual(normalizeUsage(usage), normalizeUsage({}));
});

test("estimateBill: hosts, allowances and log arithmetic", () => {
  const est = estimateBill({ infra_pro_hosts: 10, containers: 150, custom_metrics: 2000, logs_ingested_gb: 100, logs_indexed_million: 10, logs_retention_days: 15 });
  assert.equal(item(est, "infra_pro").monthly, 150); // 10 x $15
  assert.equal(item(est, "containers").monthly, 50); // (150-100) x $1
  assert.equal(item(est, "custom_metrics").monthly, 50); // (2000-1000) x $0.05
  assert.equal(item(est, "log_ingest").monthly, 10);
  assert.equal(item(est, "log_index").monthly, 17);
  assert.equal(est.total, 277);
  assert.equal(est.annual, 3324);
});

test("monthly billing costs more than annual on hosts", () => {
  const a = estimateBill({ infra_pro_hosts: 10 }).total;
  const m = estimateBill({ infra_pro_hosts: 10, billing: "monthly" }).total;
  assert.equal(a, 150);
  assert.equal(m, 180);
});

test("rankLevers sorts by saving and computes each against the baseline", () => {
  const usage = { infra_pro_hosts: 50, containers: 900, custom_metrics: 12000, logs_ingested_gb: 2000, logs_indexed_million: 800, apm_hosts: 20 };
  const levers = rankLevers(usage);
  assert.equal(levers[0].id, "log-flex-archive");
  assert.equal(levers[0].saving, 560); // 400M x ($1.70 - $0.30)
  assert.equal(levers.find((l) => l.id === "log-exclusion").saving, 408); // 240M x 1.70
  assert.equal(levers.find((l) => l.id === "log-retention").saving, 344); // 800 x (1.70-1.27)
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
});

test("annual-commitment lever only for monthly billing; assumptions override", () => {
  assert.ok(!rankLevers({ infra_pro_hosts: 10 }).some((l) => l.id === "annual-commitment"));
  const l = rankLevers({ infra_pro_hosts: 10, billing: "monthly" }).find((x) => x.id === "annual-commitment");
  assert.equal(l.saving, 30);
  const r = rankLevers({ infra_pro_hosts: 100 }, undefined, { rightsizePct: 50 }).find((x) => x.id === "rightsize-hosts");
  assert.equal(r.saving, 750);
});

test("no levers for empty usage; summarize gates on budget", () => {
  assert.deepEqual(rankLevers({}), []);
  const est = estimateBill({ infra_pro_hosts: 10 });
  assert.equal(summarize(est, [], {}).status, "ok");
  assert.equal(summarize(est, [], { budget: 100 }).overBudget, true);
  assert.equal(summarize(est, [], { budget: 150 }).overBudget, false);
  assert.equal(summarize(estimateBill({}), []).status, "none");
});
