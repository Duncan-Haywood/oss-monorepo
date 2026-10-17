import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS as D, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("a free plan covers a small, slow need", () => {
  assert.deepEqual(providerCost(D.uptimerobot, 30, 300), { plan: "Free", monthly: 0 });
});

test("a faster interval rules out slow plans", () => {
  // 60s checks: UptimeRobot Free is 300s, Solo has only 10 monitors, Team covers 50
  assert.deepEqual(providerCost(D.uptimerobot, 50, 60), { plan: "Team", monthly: 29 });
  assert.deepEqual(providerCost(D.uptimerobot, 8, 60), { plan: "Solo", monthly: 7 });
});

test("a needed status page rules out plans without one", () => {
  assert.equal(providerCost(D.hyperping, 5, 300, false).monthly, 0);
  assert.equal(providerCost(D.hyperping, 5, 300, true).monthly, 24);
});

test("per-monitor add-ons buy the excess", () => {
  // Better Stack: $29 covers 50, then $0.21 each: 60 monitors -> 29 + 10 * 0.21
  assert.equal(providerCost(D.betterstack, 60, 30).monthly, 31.1);
});

test("no covering plan returns null, and compare sorts it last", () => {
  assert.equal(providerCost(D.uptimerobot, 5000, 30), null);
  const rows = compare(5000, 30, false);
  assert.equal(rows.at(-1).monthly, null);
  assert.ok(rows[0].monthly != null);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(60, 60, true);
  assert.equal(rows[0].extraVsCheapest, 0);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].monthly >= rows[i - 1].monthly);
  assert.equal(rows[1].extraVsCheapest, rows[1].monthly - rows[0].monthly);
});

test("projection grows the monitor count and totals every month", () => {
  const p = project(10, 300, false, 10, 12);
  assert.equal(p.path[0], 10);
  assert.ok(p.endMonitors > 25);
  assert.equal(p.path.length, 12);
  assert.equal(project(10, 300, false, 0, 12).totals.find((t) => t.key === "uptimerobot").total, 0);
});

test("projection total is null when growth outruns every plan", () => {
  assert.equal(project(150, 60, false, 50, 12).totals.find((t) => t.key === "uptimerobot").total, null);
});

test("cheapestSegments covers 1..max without gaps", () => {
  const segs = cheapestSegments(60, true, D, 800);
  assert.equal(segs[0].from, 1);
  assert.equal(segs.at(-1).to, 800);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
});

test("summarize: budget gate, unknown provider, uncovered provider", () => {
  const rows = compare(60, 60, true);
  assert.equal(summarize(rows, { budget: 1000 }).overBudget, false);
  const over = summarize(rows, { budget: 1, provider: "pingdom" });
  assert.equal(over.overBudget, true);
  assert.equal(over.errors, 1);
  assert.match(summarize(rows, { provider: "nope" }).text, /Unknown provider/);
  assert.match(summarize(compare(5000, 30), { provider: "uptimerobot" }).text, /no listed plan/);
});
