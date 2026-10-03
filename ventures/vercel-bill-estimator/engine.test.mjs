import test from "node:test";
import assert from "node:assert/strict";
import { parseUsageCsv, estimateBill, rankLevers, summarize, normalizeUsage, CSV_TEMPLATE } from "./engine.mjs";

const item = (est, key) => est.items.find((i) => i.key === key);

test("parseUsageCsv reads header, comments, = and ignores unknown products", () => {
  const { usage, errors, unknown } = parseUsageCsv("product,usage\n# note\nseats,8\nBandwidth GB = 3_000\nmystery,3\n");
  assert.deepEqual(errors, []);
  assert.equal(usage.seats, 8);
  assert.equal(usage.bandwidth_gb, 3000);
  assert.deepEqual(unknown, ["mystery"]);
});

test("parseUsageCsv reports bad values", () => {
  const { errors } = parseUsageCsv("seats,abc\nbandwidth_gb,-4\njunk");
  assert.equal(errors.length, 3);
});

test("template parses back to defaults", () => {
  const { usage, errors } = parseUsageCsv(CSV_TEMPLATE);
  assert.deepEqual(errors, []);
  assert.deepEqual(normalizeUsage(usage), normalizeUsage({}));
});

test("estimateBill: allowances, overage arithmetic and the credit", () => {
  const est = estimateBill({ seats: 5, bandwidth_gb: 1500, edge_requests_million: 60, build_minutes: 1000 });
  assert.equal(item(est, "seats").monthly, 100); // 5 x $20
  assert.equal(item(est, "bandwidth_gb").monthly, 75); // 500 over x $0.15
  assert.equal(item(est, "edge_requests_million").monthly, 100); // 50 over x $2
  assert.equal(item(est, "build_minutes").monthly, 14);
  assert.equal(est.usageCharges, 189);
  assert.equal(est.credit, 20);
  assert.equal(est.total, 269); // 100 + 189 - 20
  assert.equal(est.annual, 3228);
});

test("credit never exceeds usage charges and never offsets seats", () => {
  const est = estimateBill({ seats: 3, bandwidth_gb: 500 });
  assert.equal(est.usageCharges, 0);
  assert.equal(est.credit, 0);
  assert.equal(est.total, 60);
  assert.equal(estimateBill({ seats: 1, bandwidth_gb: 1100 }).credit, 15);
});

test("usage inside the allowances costs only the seats", () => {
  assert.equal(estimateBill({ seats: 2, bandwidth_gb: 900, edge_requests_million: 9 }).total, 40);
});

test("rankLevers sorts by saving and computes each against the baseline", () => {
  const levers = rankLevers({ seats: 8, bandwidth_gb: 3000, edge_requests_million: 120, function_invocations_million: 60, build_minutes: 6000 });
  for (let i = 1; i < levers.length; i += 1) assert.ok(levers[i - 1].saving >= levers[i].saving);
  assert.equal(levers.find((l) => l.id === "shrink-assets").saving, 112.5); // 750 GB x $0.15
  assert.equal(levers.find((l) => l.id === "seat-audit").saving, 32); // 1.6 seats x $20
  assert.equal(levers.find((l) => l.id === "skip-builds").saving, 33.6); // 2400 min x $0.014
});

test("assumptions override and levers that touch nothing are omitted", () => {
  const r = rankLevers({ seats: 10 }, undefined, { seatPct: 50 });
  assert.deepEqual(r.map((l) => l.id), ["seat-audit"]);
  assert.equal(r[0].saving, 100);
  assert.deepEqual(rankLevers({}), []);
});

test("summarize gates on budget", () => {
  const est = estimateBill({ seats: 5 });
  assert.equal(summarize(est, [], {}).status, "ok");
  assert.equal(summarize(est, [], { budget: 50 }).overBudget, true);
  assert.equal(summarize(est, [], { budget: 100 }).overBudget, false);
  assert.equal(summarize(estimateBill({}), []).status, "none");
});
