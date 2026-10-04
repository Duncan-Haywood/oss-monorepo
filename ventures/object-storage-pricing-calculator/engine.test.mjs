import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS as D, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("nothing stored and nothing downloaded costs nothing, even with a base fee", () => {
  for (const p of Object.values(D)) assert.equal(providerCost(p, 0, 0), 0);
});

test("per-GB storage and egress arithmetic", () => {
  // S3: 1000 GB * 0.023 = 23; egress (1100-100) * 0.09 = 90
  assert.equal(providerCost(D.s3, 1000, 1100), 113);
  // R2: (1000-10) * 0.015 = 14.85; egress free
  assert.equal(providerCost(D.r2, 1000, 50000), 14.85);
});

test("free-egress ratio and minimum billed storage", () => {
  // B2: 1000 GB stored, 3000 GB free egress, so 3000 egress is storage only: 990 * 0.006
  assert.equal(providerCost(D.b2, 1000, 3000), 5.94);
  assert.equal(providerCost(D.b2, 1000, 4000), 15.94);
  // Wasabi bills a 1 TB minimum even for 100 GB stored
  assert.equal(providerCost(D.wasabi, 100, 0), 6.9);
});

test("included pools in a base-fee plan", () => {
  // Spaces: $5 covers 250 GB and 1 TB egress
  assert.equal(providerCost(D.spaces, 200, 900), 5);
  assert.equal(providerCost(D.spaces, 350, 1100), 5 + 100 * 0.02 + 100 * 0.01);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(2000, 20000);
  assert.equal(rows[0].key, "r2"); // 20 TB egress: R2's $0 egress beats B2's 3x allowance
  assert.equal(rows.at(-1).key, "s3");
  assert.equal(rows.at(-1).extraVsCheapest, Math.round((rows.at(-1).monthly - rows[0].monthly) * 100) / 100);
});

test("project compounds both volumes and totals each provider", () => {
  const p = project(100, 1000, 10, 3);
  assert.deepEqual(p.path, [{ stored: 100, egress: 1000 }, { stored: 110, egress: 1100 }, { stored: 121, egress: 1210 }]);
  assert.equal(p.endStored, 121);
  assert.ok(p.totals[0].total <= p.totals.at(-1).total);
});

test("cheapestSegments covers the egress range contiguously", () => {
  const segs = cheapestSegments(2000);
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.equal(segs.at(-1).to, 500000);
});

test("a custom provider table changes the winner", () => {
  const mk = (egressPerGb, baseUsd) => ({ label: "x", url: "", baseUsd, includedStorageGb: 0, minBilledStorageGb: 0, storagePerGb: 0, includedEgressGb: 0, egressFreeRatio: 0, egressPerGb });
  const providers = { a: { ...mk(1, 0), label: "A" }, b: { ...mk(0.1, 50), label: "B" } };
  const segs = cheapestSegments(1, providers, 1000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55 && segs[0].to <= 56);
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(5000, 30000);
  assert.equal(summarize(rows, { budget: 100000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "s3" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});
