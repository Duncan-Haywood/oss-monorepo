import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS as D, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("nothing stored, watched or uploaded costs nothing, even with a base fee", () => {
  for (const p of Object.values(D)) assert.equal(providerCost(p, 0, 0, 0), 0);
});

test("per-minute storage and delivery arithmetic", () => {
  // Cloudflare Stream: 1000 * 0.005 = 5; 2000 * 0.001 = 2
  assert.equal(providerCost(D.cfstream, 1000, 2000), 7);
  // api.video: 1000 * 0.00285 + 1000 * 0.0017 = 4.55
  assert.equal(providerCost(D.apivideo, 1000, 1000), 4.55);
});

test("included delivery pool and base fee", () => {
  // Mux: 1000 * 0.0024 = 2.4 and (150000-100000) * 0.0008 = 40
  assert.equal(providerCost(D.mux, 1000, 150000), 42.4);
  assert.equal(providerCost(D.mux, 0, 90000), 0);
  // Bunny: $1 base + 10000*0.0002 + 100000*0.00019
  assert.equal(providerCost(D.bunny, 10000, 100000), 22);
});

test("encoding is billed per newly uploaded minute", () => {
  assert.equal(providerCost(D.diy, 0, 0, 100), 0.75);
  assert.equal(providerCost(D.cfstream, 0, 0, 100), 0);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(20000, 2000000, 0);
  assert.equal(rows[0].key, "bunny");
  assert.equal(rows.at(-1).key, "apivideo");
  assert.equal(rows.at(-1).extraVsCheapest, Math.round((rows.at(-1).monthly - rows[0].monthly) * 100) / 100);
});

test("project compounds all volumes and totals each platform", () => {
  const p = project(100, 1000, 10, 10, 3);
  assert.deepEqual(p.path, [{ stored: 100, delivered: 1000, encoded: 10 }, { stored: 110, delivered: 1100, encoded: 11 }, { stored: 121, delivered: 1210, encoded: 12 }]);
  assert.equal(p.endStored, 121);
  assert.equal(p.endDelivered, 1210);
  assert.ok(p.totals[0].total <= p.totals.at(-1).total);
});

test("cheapestSegments covers the viewing range contiguously", () => {
  const segs = cheapestSegments(20000);
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.equal(segs.at(-1).to, 50000000);
});

test("a custom provider table changes the winner", () => {
  const mk = (deliveryPerMin, baseUsd) => ({ label: "x", url: "", baseUsd, storagePerMin: 0, includedStorageMin: 0, deliveryPerMin, includedDeliveryMin: 0, encodePerMin: 0 });
  const providers = { a: { ...mk(1, 0), label: "A" }, b: { ...mk(0.1, 50), label: "B" } };
  const segs = cheapestSegments(1, 0, providers, 1000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55 && segs[0].to <= 56);
});

test("summarize gates on budget for the cheapest or a named platform", () => {
  const rows = compare(50000, 3000000, 0);
  assert.equal(summarize(rows, { budget: 100000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "cfstream" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
