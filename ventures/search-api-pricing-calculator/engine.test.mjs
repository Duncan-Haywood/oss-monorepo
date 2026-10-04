import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS as D, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("nothing indexed and nothing searched costs nothing, even with a base fee", () => {
  for (const p of Object.values(D)) assert.equal(providerCost(p, 0, 0), 0);
});

test("Algolia: free tier then per-thousand records and searches", () => {
  // inside the free tier
  assert.equal(providerCost(D.algolia, 100, 10), 0);
  // 600K records: 500 * 0.4 = 200; 2010K searches: 2000 * 0.5 = 1000
  assert.equal(providerCost(D.algolia, 600, 2010), 1200);
});

test("base-fee plans include pools, then charge overage", () => {
  assert.equal(providerCost(D.meilisearch, 100, 50), 30);
  // 200K records: 100 * 0.3 = 30; 150K searches: 100 * 0.4 = 40
  assert.equal(providerCost(D.meilisearch, 200, 150), 100);
});

test("flat-cluster engines do not charge per search", () => {
  for (const k of ["typesense", "elastic", "selfhosted"]) assert.equal(providerCost(D[k], 100, 1), providerCost(D[k], 100, 900000), k);
});

test("free searches scale with records when freeSearchesPerKRecords is set", () => {
  const p = { baseUsd: 0, includedRecordsK: 0, includedSearchesK: 0, freeSearchesPerKRecords: 10, perKRecords: 0, perKSearches: 1 };
  assert.equal(providerCost(p, 100, 1000), 0);
  assert.equal(providerCost(p, 100, 1500), 500);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(500, 2000);
  assert.equal(rows.length, Object.keys(D).length);
  assert.equal(rows[0].extraVsCheapest, 0);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].monthly >= rows[i - 1].monthly);
  assert.equal(rows.at(-1).extraVsCheapest, Math.round((rows.at(-1).monthly - rows[0].monthly) * 100) / 100);
});

test("project compounds both volumes and sums each provider", () => {
  const flat = project(500, 2000, 0, 12);
  assert.equal(flat.endRecords, 500);
  const grown = project(500, 2000, 10, 12);
  assert.ok(grown.endRecords > 500 && grown.endSearches > 2000);
  const alg = (r) => r.totals.find((t) => t.key === "algolia").total;
  assert.ok(alg(grown) > alg(flat));
  assert.equal(alg(flat), Math.round(providerCost(D.algolia, 500, 2000) * 12 * 100) / 100);
});

test("crossover: a tiny index is free on Algolia until searches pass the free tier", () => {
  const segs = cheapestSegments(50);
  assert.match(segs[0].label, /Algolia/);
  assert.equal(segs[0].from, 0);
  assert.ok(segs.length >= 2);
  assert.match(segs.at(-1).label, /Typesense/);
  for (let i = 1; i < segs.length; i++) assert.ok(segs[i].from > segs[i - 1].to);
});

test("summary gates on budget for the cheapest or a named provider", () => {
  const rows = compare(500, 2000);
  assert.equal(summarize(rows, { budget: 10_000 }).overBudget, false);
  assert.equal(summarize(rows, { budget: 50, provider: "algolia" }).overBudget, true);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
