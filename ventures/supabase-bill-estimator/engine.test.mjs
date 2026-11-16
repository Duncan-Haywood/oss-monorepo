import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, summarize, normalizeUsage, projectCount, CSV_TEMPLATE } from "./engine.mjs";

const round = (n) => Math.round(n * 100) / 100;

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
  assert.equal(item(est, "storage_gb").monthly, 4.26); // 200 GB over x $0.0213
  assert.equal(item(est, "mau_thousand").monthly, 65); // 20 thousand over x $3.25
  assert.equal(est.usageCharges, 176.76);
  assert.equal(est.credit, 0);
  assert.equal(est.total, 201.76);
  assert.equal(est.annual, 2421.12);
});

test("each Pro organization brings its own quotas and $10 compute credit (disk is per project)", () => {
  // Quality census 2026-11-15-8354: two orgs, each inside its own quota, were billed $409.60.
  const inside = estimateBill({ pro_orgs: 2, compute_usd: 20, egress_gb: 500, mau_thousand: 200, storage_gb: 200 });
  assert.equal(inside.total, 50); // 2 x $25, nothing over
  const est = estimateBill({ pro_orgs: 2, compute_usd: 70, db_disk_gb: 28, egress_gb: 750, storage_gb: 300, mau_thousand: 120 });
  assert.equal(item(est, "compute_usd").monthly, 50); // 2 x $10 credit off $70
  assert.equal(item(est, "db_disk_gb").monthly, 1.5); // one project per org by default: 28 - 2 x 8 = 12 GB x $0.125
  assert.equal(item(est, "egress_gb").monthly, 22.5); // 750 - 2 x 250 = 250 GB x $0.09
  assert.equal(item(est, "storage_gb").monthly, 2.13); // 300 - 2 x 100 = 100 GB x $0.0213
  assert.equal(item(est, "mau_thousand").monthly, 0); // 120 thousand inside 2 x 100
  assert.equal(est.total, 126.13);
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

// Supabase's own billing examples (docs/guides/platform/manage-your-usage/*.mdx, read 2026-11-16).
// Quality census 2026-11-15-8354 found the cached-egress and per-project disk cases wrong.
test("docs egress example: cached egress is its own meter with its own 250 GB quota ($51)", () => {
  const within = estimateBill({ pro_orgs: 1, compute_usd: 15, egress_gb: 200, cached_egress_gb: 230 });
  assert.equal(within.total, 30);
  const over = estimateBill({ pro_orgs: 1, compute_usd: 15, egress_gb: 300, cached_egress_gb: 800 });
  assert.equal(item(over, "egress_gb").monthly, 4.5); // 50 GB x $0.09
  assert.equal(item(over, "cached_egress_gb").monthly, 16.5); // 550 GB x $0.03
  assert.equal(over.total, 51);
});

test("docs disk example: 8 GB of disk is included per project, not per org", () => {
  // Three Small projects with 8, 8 and 50 GB: docs $65.24 (hourly GB-Hr rounding), $65.25 at the monthly rate.
  assert.equal(estimateBill({ pro_orgs: 1, compute_usd: 45, db_disk_gb: 66, db_projects: 3 }).total, 65.25);
  // Three Micro projects at 8 GB each: no disk charge.
  assert.equal(item(estimateBill({ pro_orgs: 1, compute_usd: 30, db_disk_gb: 24, db_projects: 3 }), "db_disk_gb").monthly, 0);
  // Fewer projects than orgs still counts one per org.
  assert.equal(projectCount({ pro_orgs: 3, db_projects: 1 }), 3);
});

test("docs storage example and the published per-unit rates", () => {
  assert.equal(estimateBill({ pro_orgs: 1, compute_usd: 15, storage_gb: 288 }).total, 34); // 188 GB x $0.0213 = $4.00
  const est = estimateBill({ pro_orgs: 1, compute_usd: 10, mau_thousand: 250, edge_invocations_million: 5, realtime_messages_million: 9, storage_gb: 300 });
  assert.equal(item(est, "realtime_messages_million").monthly, 10); // 4 M x $2.50
  assert.equal(item(est, "edge_invocations_million").monthly, 6); // 3 M x $2
  assert.equal(item(est, "mau_thousand").monthly, 487.5); // 150 thousand x $3.25
  assert.equal(est.total, 532.76);
});

test("spend cap view: capped overage is not billed, compute and the org fee still are", () => {
  const est = estimateBill({ pro_orgs: 1, compute_usd: 15, egress_gb: 300, cached_egress_gb: 800, mau_thousand: 120 });
  assert.equal(est.cappedOverage, 4.5 + 16.5 + 65);
  assert.equal(est.withSpendCap, 30); // $25 + $15 compute - $10 credit
  assert.match(summarize(est, []).text, /spend cap on .* \$86\.00 .* bill of \$30\.00/);
  assert.doesNotMatch(summarize(estimateBill({ pro_orgs: 1, compute_usd: 50 }), []).text, /spend cap/);
});

test("serve-from-cdn moves egress to the cheaper cached meter instead of deleting it", () => {
  const levers = rankLevers({ pro_orgs: 1, egress_gb: 1250 });
  const cdn = levers.find((l) => l.id === "serve-from-cdn");
  // 30% of 1,250 GB = 375 GB moves: uncached 875 GB, 625 billable ($56.25, was $90); cached 375 GB, 125 billable ($3.75).
  assert.equal(cdn.saving, 30);
  assert.equal(levers.find((l) => l.id === "trim-egress").saving, 33.75); // 375 GB x $0.09 actually removed
  assert.equal(cdn.pctOfBill, round(30 / 115 * 100));
});

test("merge-orgs needs at least two organizations and keeps the projects' disk quota", () => {
  assert.equal(rankLevers({ pro_orgs: 1, compute_usd: 15, egress_gb: 300 }).find((l) => l.id === "merge-orgs"), undefined);
  const r = rankLevers({ pro_orgs: 2, db_disk_gb: 16 });
  const m = r.find((l) => l.id === "merge-orgs");
  assert.equal(m.saving, 25); // one org fee; both projects keep their 8 GB disks, so no disk charge appears
  assert.equal(m.assumption, "1 of 2 organizations merged into the others");
});

test("budget gate is strictly over, not at", () => {
  const est = estimateBill({ pro_orgs: 2 });
  assert.equal(summarize(est, [], { budget: 50 }).overBudget, false);
  assert.equal(summarize(est, [], { budget: 49.99 }).overBudget, true);
});
