import test from "node:test";
import assert from "node:assert/strict";
import { computeRate, NICHES, FORMATS, USAGE_RIGHTS, EXCLUSIVITY } from "./calculator.mjs";

const base = { views: 100000, niche: "business", format: "integration", usage: "none", exclusivity: "none" };

test("business integration at 100k views is 100 thousands x the CPM range", () => {
  const r = computeRate(base);
  assert.equal(r.baseLow, 2500);
  assert.equal(r.baseHigh, 5000);
  assert.equal(r.totalLow, 2500);
  assert.equal(r.totalHigh, 5000);
});

test("dedicated video prices at 2.2x and a mention at 0.5x an integration", () => {
  assert.equal(computeRate({ ...base, format: "dedicated" }).baseLow, 5500);
  assert.equal(computeRate({ ...base, format: "mention" }).baseHigh, 2500);
});

test("usage and exclusivity add to the base rather than compounding", () => {
  const r = computeRate({ ...base, usage: "90d", exclusivity: "30d" });
  assert.equal(r.usageLow, 1000);
  assert.equal(r.exclusivityLow, 375);
  assert.equal(r.totalLow, 2500 + 1000 + 375);
  assert.equal(r.totalHigh, 5000 + 2000 + 750);
});

test("components always sum to the total within rounding", () => {
  for (const niche of NICHES) for (const format of FORMATS) for (const usage of USAGE_RIGHTS) for (const exclusivity of EXCLUSIVITY) {
    const r = computeRate({ views: 33333, niche, format, usage, exclusivity });
    assert.ok(Math.abs(r.baseLow + r.usageLow + r.exclusivityLow - r.totalLow) <= 1);
    assert.ok(Math.abs(r.baseHigh + r.usageHigh + r.exclusivityHigh - r.totalHigh) <= 1);
    assert.ok(r.totalLow <= r.totalHigh);
  }
});

test("rate scales linearly with views", () => {
  assert.equal(computeRate({ ...base, views: 200000 }).baseLow, 2 * computeRate(base).baseLow);
});

test("junk input prices nothing and asks for a number", () => {
  for (const views of [0, -5, NaN, undefined, "abc", Infinity]) {
    const r = computeRate({ ...base, views });
    assert.equal(r.totalHigh, 0);
    assert.equal(r.findings[0].id, "missing-input");
  }
});

test("unknown enum values fall back to the defaults instead of throwing", () => {
  const r = computeRate({ views: 50000, niche: "__proto__", format: "x", usage: "y", exclusivity: "z" });
  assert.equal(r.baseLow, computeRate({ views: 50000, niche: "general", format: "integration" }).baseLow);
});

test("findings: small channel, perpetual usage and large channel are flagged", () => {
  assert.ok(computeRate({ ...base, views: 500 }).findings.some((f) => f.id === "small-channel"));
  const perp = computeRate({ ...base, usage: "perpetual" });
  assert.ok(perp.findings.some((f) => f.id === "perpetual-usage" && f.severity === "high"));
  assert.ok(computeRate({ ...base, views: 2000000 }).findings.some((f) => f.id === "large-channel"));
});
