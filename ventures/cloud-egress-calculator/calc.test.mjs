import test from "node:test";
import assert from "node:assert/strict";
import {
  scenarioCost,
  compareScenarios,
  reviewRecord,
  compareCdn,
  cdnNote,
} from "./calc.mjs";

test("calculates storage, request, and egress charges", () => {
  const result = scenarioCost({
    storageGb: 500,
    requestsMillion: 2,
    egressGb: 100,
    storageRate: 0.02,
    requestRate: 0.4,
    egressRate: 0.01,
  });
  assert.deepEqual(
    { storage: result.storage, requests: result.requests, egress: result.egress, total: result.total },
    { storage: 10, requests: 0.8, egress: 1, total: 11.8 },
  );
});

test("compares scenarios and reports savings", () => {
  const result = compareScenarios({
    first: { storageGb: 1000, egressGb: 500, storageRate: 0.023, egressRate: 0.09 },
    second: { storageGb: 1000, egressGb: 500, storageRate: 0.006, egressRate: 0 },
  });
  assert.equal(result.cheaper, "second");
  assert.equal(result.savings, 62);
  assert.equal(result.annualSavings, 744);
  assert.equal(result.savingsPercentage, (62 / 68) * 100);
});

test("does not divide by zero for two free scenarios", () => {
  const result = compareScenarios({ first: { storageGb: 0 }, second: { storageGb: 0 } });
  assert.equal(result.annualSavings, 0);
  assert.equal(result.savingsPercentage, 0);
  assert.equal(result.breakEvenEgressGb, null);
});

test("rejects invalid inputs", () => {
  assert.throws(() => scenarioCost({ storageGb: -1 }), /Storage/);
  assert.throws(() => scenarioCost({ storageGb: "unknown" }), /Storage/);
  assert.throws(() => scenarioCost({ storageGb: Number.NaN }), /Storage/);
  assert.throws(() => scenarioCost({ storageGb: Infinity }), /Storage/);
});

test("defaults optional usage dimensions to zero", () => {
  const result = scenarioCost({ storageGb: 10, storageRate: 0.02 });
  assert.deepEqual(
    { storage: result.storage, requests: result.requests, egress: result.egress, total: result.total },
    { storage: 0.2, requests: 0, egress: 0, total: 0.2 },
  );
});

test("creates a portable review record without rate-sheet amounts", () => {
  const record = reviewRecord({
    storageGb: 100,
    requestsMillion: 1,
    egressGb: 20,
    first: { name: "Current", storageRate: 0.02, requestRate: 0.4, egressRate: 0.09 },
    second: { name: "Alternative", storageRate: 0.01, requestRate: 0.2, egressRate: 0 },
  });
  assert.equal(record.options[0].name, "Current");
  assert.equal(record.options[1].total, 1.2);
  assert.equal(record.cheaper, "second");
  assert.equal(typeof record.createdAt, "string");
  assert.equal(Object.hasOwn(record.options[0], "storageRate"), false);
});

test("break-even outbound volume when cheap storage has expensive egress", () => {
  const result = compareScenarios({
    first: { storageGb: 500, requestsMillion: 0, egressGb: 50, storageRate: 0.006, egressRate: 0.09 },
    second: { storageGb: 500, requestsMillion: 0, egressGb: 50, storageRate: 0.023, egressRate: 0.01 },
  });
  // firstFixed 3, secondFixed 11.5, rateDelta 0.08 → 8.5 / 0.08 = 106.25
  assert.equal(result.breakEvenEgressGb, 106.25);
  assert.equal(result.cheaper, "first");
});

test("default two-provider demo: free-egress alternative is cheaper", () => {
  const result = compareScenarios({
    first: { storageGb: 500, requestsMillion: 2, egressGb: 100, storageRate: 0.023, requestRate: 0.4, egressRate: 0.09 },
    second: { storageGb: 500, requestsMillion: 2, egressGb: 100, storageRate: 0.006, requestRate: 0.36, egressRate: 0 },
  });
  assert.equal(result.first.total, 21.3);
  assert.equal(result.second.total, 3.72);
  assert.equal(result.cheaper, "second");
  assert.equal(result.savings, 17.58);
  assert.equal(result.annualSavings, 210.96);
});

test("default CDN demo: 80% hits still lose to origin-only", () => {
  const result = compareCdn({
    egressGb: 100,
    hitRatePercent: 80,
    originEgressRate: 0.09,
    cdnEgressRate: 0.085,
    originFetchRate: 0.09,
  });
  assert.equal(result.originOnly.total, 9);
  assert.equal(result.withCdn.egress, 8.5);
  assert.equal(result.withCdn.originFetch, 1.8);
  assert.equal(result.withCdn.total, 10.3);
  assert.equal(result.cheaper, "origin");
  assert.equal(result.savings, 1.3);
  assert.ok(Math.abs(result.hitRateFloorPercent - (8.5 / 9) * 100) < 1e-10);
});

test("95% cache hits flips the CDN path ahead by a nickel", () => {
  const result = compareCdn({
    egressGb: 100,
    hitRatePercent: 95,
    originEgressRate: 0.09,
    cdnEgressRate: 0.085,
    originFetchRate: 0.09,
  });
  assert.equal(result.withCdn.total, 8.95);
  assert.equal(result.cheaper, "cdn");
  assert.equal(result.savings, 0.05);
});

test("CDN request fees sit on the CDN path only", () => {
  const result = compareCdn({
    egressGb: 100,
    hitRatePercent: 100,
    originEgressRate: 0.09,
    cdnEgressRate: 0.085,
    requestsMillion: 2,
    cdnRequestRate: 0.4,
  });
  assert.equal(result.originOnly.total, 9);
  assert.equal(result.withCdn.requests, 0.8);
  assert.equal(result.withCdn.total, 9.3);
  assert.equal(result.cheaper, "origin");
});

test("rejects a hit rate above 100", () => {
  assert.throws(() => compareCdn({ hitRatePercent: 101, egressGb: 1 }), /Cache hit rate/);
});

test("cdnNote names the cheaper path and the hit-rate floor without advising", () => {
  const result = compareCdn({
    egressGb: 100,
    hitRatePercent: 80,
    originEgressRate: 0.09,
    cdnEgressRate: 0.085,
    originFetchRate: 0.09,
  });
  const note = cdnNote(result);
  assert.match(note, /origin-only is \$1\.30 cheaper/);
  assert.match(note, /94\.4% hits/);
  assert.doesNotMatch(note, /should|must|enable|turn on|add a CDN|CloudFront/i);
});
