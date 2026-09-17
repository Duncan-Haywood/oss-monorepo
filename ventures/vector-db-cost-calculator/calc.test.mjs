import test from "node:test";
import assert from "node:assert/strict";
import {
  rawIndexBytes,
  estimatedStorageGb,
  providerMonthlyCost,
  compareProviders,
  decisionSummary,
} from "./calc.mjs";

test("rawIndexBytes is vectorCount * dimension * 4 bytes plus metadata", () => {
  // 1,000,000 vectors * 1536 dims * 4 bytes = 6,144,000,000 bytes.
  const bytes = rawIndexBytes({ vectorCount: 1_000_000, dimension: 1536, metadataBytesPerVector: 0 });
  assert.equal(bytes, 6_144_000_000);
  const withMetadata = rawIndexBytes({ vectorCount: 1_000_000, dimension: 1536, metadataBytesPerVector: 200 });
  assert.equal(withMetadata, 6_144_000_000 + 1_000_000 * 200);
});

test("rawIndexBytes rejects negative inputs", () => {
  assert.throws(() => rawIndexBytes({ vectorCount: -1, dimension: 8 }), /Vector count/);
  assert.throws(() => rawIndexBytes({ vectorCount: 1, dimension: -1 }), /Dimension/);
  assert.throws(() => rawIndexBytes({ vectorCount: 1, dimension: 1, metadataBytesPerVector: -1 }), /Metadata/);
});

test("estimatedStorageGb applies the overhead multiplier and converts to GiB", () => {
  // 1,000,000 * 1536 * 4 = 6,144,000,000 bytes raw. Overhead 1.0 -> GiB conversion only.
  const gb = estimatedStorageGb({ vectorCount: 1_000_000, dimension: 1536, indexOverhead: 1 });
  assert.ok(Math.abs(gb - 6_144_000_000 / 1024 ** 3) < 1e-9);
  // Overhead 1.5 scales linearly.
  const gbOverhead = estimatedStorageGb({ vectorCount: 1_000_000, dimension: 1536, indexOverhead: 1.5 });
  assert.ok(Math.abs(gbOverhead - gb * 1.5) < 1e-9);
});

test("estimatedStorageGb rejects an overhead multiplier below 1", () => {
  assert.throws(
    () => estimatedStorageGb({ vectorCount: 1, dimension: 1, indexOverhead: 0.5 }),
    /at least 1/,
  );
});

test("providerMonthlyCost bills only what is above the free allowance", () => {
  const result = providerMonthlyCost({
    name: "Test Provider",
    storageGb: 100,
    queriesMillion: 10,
    storageRate: 0.30,
    queryRate: 1.5,
    freeStorageGb: 20,
    freeQueriesMillion: 2,
  });
  assert.equal(result.billableStorageGb, 80);
  assert.equal(result.billableQueriesMillion, 8);
  assert.ok(Math.abs(result.storageCost - 24) < 1e-9); // 80 * 0.30
  assert.ok(Math.abs(result.queryCost - 12) < 1e-9); // 8 * 1.5
  assert.ok(Math.abs(result.total - 36) < 1e-9);
});

test("providerMonthlyCost never bills a negative amount when usage is under the free allowance", () => {
  const result = providerMonthlyCost({
    name: "Free tier",
    storageGb: 1,
    queriesMillion: 0.1,
    storageRate: 0.30,
    queryRate: 1.5,
    freeStorageGb: 5,
    freeQueriesMillion: 1,
  });
  assert.equal(result.billableStorageGb, 0);
  assert.equal(result.billableQueriesMillion, 0);
  assert.equal(result.total, 0);
});

test("providerMonthlyCost rejects negative rates and volumes", () => {
  const base = { name: "P", storageGb: 1, queriesMillion: 1, storageRate: 1, queryRate: 1 };
  assert.throws(() => providerMonthlyCost({ ...base, storageGb: -1 }), /Storage \(GB\)/);
  assert.throws(() => providerMonthlyCost({ ...base, queriesMillion: -1 }), /Queries/);
  assert.throws(() => providerMonthlyCost({ ...base, storageRate: -1 }), /storage rate/);
  assert.throws(() => providerMonthlyCost({ ...base, queryRate: -1 }), /query rate/);
});

test("compareProviders ranks by total ascending and names the cheapest", () => {
  const providers = [
    { name: "Pricier", storageGb: 100, queriesMillion: 10, storageRate: 0.5, queryRate: 2 },
    { name: "Cheaper", storageGb: 100, queriesMillion: 10, storageRate: 0.1, queryRate: 0.5 },
  ];
  const { ranked, cheapestName, spread } = compareProviders(providers);
  assert.equal(ranked[0].name, "Cheaper");
  assert.equal(ranked[1].name, "Pricier");
  assert.equal(cheapestName, "Cheaper");
  assert.ok(spread > 0);
});

test("compareProviders requires at least one provider", () => {
  assert.throws(() => compareProviders([]), /At least one provider/);
});

test("decisionSummary lists every provider cheapest-first and states it is an estimate", () => {
  const summary = decisionSummary({
    storageGb: 42.5,
    queriesMillion: 3,
    providers: [
      { name: "A", storageGb: 42.5, queriesMillion: 3, storageRate: 0.3, queryRate: 1 },
      { name: "B", storageGb: 42.5, queriesMillion: 3, storageRate: 0.1, queryRate: 1 },
    ],
  });
  const bIndex = summary.indexOf("B:");
  const aIndex = summary.indexOf("A:");
  assert.ok(bIndex > -1 && aIndex > -1 && bIndex < aIndex, "cheaper provider B should be listed before A");
  assert.match(summary, /Estimate only/);
});
