import test from "node:test";
import assert from "node:assert/strict";
import {
  scenarioCost,
  compareScenarios,
  reviewRecord,
  compareCdn,
  cdnNote,
  compareReplica,
  replicaNote,
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

const DEFAULT_REPLICA = {
  replicaGb: 500,
  pullGbPerMonth: 800,
  crossRegionRate: 0.02,
  storageRate: 0.023,
  seedGb: 500,
  seedRate: 0.02,
  changeGbPerMonth: 20,
  changeRate: 0.02,
  horizonMonths: 12,
};

test("default replica demo: 800 GB pull beats keep-pulling after the seed", () => {
  const result = compareReplica(DEFAULT_REPLICA);
  assert.equal(result.pull.monthly, 16);
  assert.equal(result.pull.horizon, 192);
  assert.equal(result.replica.storage, 11.5);
  assert.equal(result.replica.change, 0.4);
  assert.equal(result.replica.monthly, 11.9);
  assert.equal(result.replica.seed, 10);
  assert.equal(result.replica.horizon, 152.8);
  assert.equal(result.cheaperMonthly, "replica");
  assert.equal(result.cheaperHorizon, "replica");
  assert.equal(result.monthlySavings, 4.1);
  assert.equal(result.horizonSavings, 39.2);
  assert.equal(result.breakEvenPullGb, 595);
  assert.ok(Math.abs(result.monthsToRecoverSeed - 10 / 4.1) < 1e-10);
});

test("400 GB of monthly pull leaves keep-pulling cheaper", () => {
  const result = compareReplica({ ...DEFAULT_REPLICA, pullGbPerMonth: 400 });
  assert.equal(result.pull.monthly, 8);
  assert.equal(result.replica.monthly, 11.9);
  assert.equal(result.cheaperMonthly, "pull");
  assert.equal(result.monthlySavings, 3.9);
  assert.equal(result.cheaperHorizon, "pull");
  assert.equal(result.monthsToRecoverSeed, null);
});

test("a large seed can flip the horizon even when the replica is cheaper this month", () => {
  const result = compareReplica({ ...DEFAULT_REPLICA, seedGb: 5000 });
  assert.equal(result.replica.seed, 100);
  assert.equal(result.cheaperMonthly, "replica");
  assert.equal(result.monthlySavings, 4.1);
  assert.equal(result.replica.horizon, 242.8);
  assert.equal(result.cheaperHorizon, "pull");
  assert.equal(result.horizonSavings, 50.8);
  assert.ok(Math.abs(result.monthsToRecoverSeed - 100 / 4.1) < 1e-10);
});

test("replicaNote names the cheaper path and the pull floor without advising", () => {
  const note = replicaNote(compareReplica(DEFAULT_REPLICA));
  assert.match(note, /the replica path is \$4\.10 cheaper this month/);
  assert.match(note, /\$10\.00 seed pays back in about 2\.4 months/);
  assert.match(note, /\$39\.20 cheaper/);
  assert.match(note, /595 GB of monthly pull/);
  assert.doesNotMatch(note, /should|must|enable|turn on|add a replica|replicate/i);
});

test("rejects a horizon outside 1–120", () => {
  assert.throws(() => compareReplica({ ...DEFAULT_REPLICA, horizonMonths: 0 }), /Horizon/);
  assert.throws(() => compareReplica({ ...DEFAULT_REPLICA, horizonMonths: 121 }), /Horizon/);
  assert.throws(() => compareReplica({ ...DEFAULT_REPLICA, horizonMonths: 12.5 }), /Horizon/);
});

test("rejects a negative replica size", () => {
  assert.throws(() => compareReplica({ ...DEFAULT_REPLICA, replicaGb: -1 }), /Replica size/);
});

test("accepts the numeric strings a form posts", () => {
  const result = compareReplica({
    replicaGb: "500",
    pullGbPerMonth: "800",
    crossRegionRate: "0.02",
    storageRate: "0.023",
    seedGb: "500",
    seedRate: "0.02",
    changeGbPerMonth: "20",
    changeRate: "0.02",
    horizonMonths: "12",
  });
  assert.equal(result.replica.horizon, 152.8);
  assert.equal(result.cheaperHorizon, "replica");
});
