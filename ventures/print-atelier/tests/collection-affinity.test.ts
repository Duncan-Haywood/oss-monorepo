import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCustomerCollectionAffinity,
  analyzeCollectionCoOccurrence,
  summarizeRepeatOrderMetrics,
  generateConvexCollectionAffinitySchema,
  collectionAffinityStore,
  OrderHistoryItem,
} from "../src/lib/collection-affinity";

describe("collection-affinity", () => {
  beforeEach(() => {
    collectionAffinityStore.clear();
  });

  const sampleOrders: OrderHistoryItem[] = [
    {
      orderId: "ord_101",
      customerId: "cust_alice",
      artworkId: "art_abstract_01",
      collectionId: "col_abstract",
      collectionName: "Abstract Minimalism",
      purchasePriceCents: 15000,
      purchasedAt: "2026-01-10T10:00:00Z",
    },
    {
      orderId: "ord_102",
      customerId: "cust_alice",
      artworkId: "art_nordic_01",
      collectionId: "col_nordic",
      collectionName: "Nordic Landscapes",
      purchasePriceCents: 25000,
      purchasedAt: "2026-02-15T14:30:00Z",
    },
    {
      orderId: "ord_103",
      customerId: "cust_bob",
      artworkId: "art_nordic_02",
      collectionId: "col_nordic",
      collectionName: "Nordic Landscapes",
      purchasePriceCents: 30000,
      purchasedAt: "2026-03-01T09:15:00Z",
    },
    {
      orderId: "ord_104",
      customerId: "cust_alice",
      artworkId: "art_abstract_02",
      collectionId: "col_abstract",
      collectionName: "Abstract Minimalism",
      purchasePriceCents: 20000,
      purchasedAt: "2026-03-20T16:00:00Z",
    },
  ];

  describe("calculateCustomerCollectionAffinity", () => {
    it("calculates correct repeat order rate and primary collection affinity for multi-order customer", () => {
      const profile = calculateCustomerCollectionAffinity("cust_alice", sampleOrders);

      assert.equal(profile.customerId, "cust_alice");
      assert.equal(profile.totalOrders, 3);
      assert.equal(profile.repeatOrderCount, 2);
      assert.equal(profile.repeatOrderRatePercent, 66.67);
      assert.equal(profile.totalSpentCents, 60000);
      assert.equal(profile.averageOrderValueCents, 20000);
      assert.ok(profile.averageDaysBetweenOrders > 0);
      assert.equal(profile.topCollectionAffinity?.collectionId, "col_abstract");
    });

    it("returns zero metrics for new customer with no orders", () => {
      const profile = calculateCustomerCollectionAffinity("cust_new", sampleOrders);

      assert.equal(profile.customerId, "cust_new");
      assert.equal(profile.totalOrders, 0);
      assert.equal(profile.repeatOrderRatePercent, 0);
      assert.equal(profile.collectionBreakdown.length, 0);
      assert.equal(profile.topCollectionAffinity, undefined);
    });
  });

  describe("analyzeCollectionCoOccurrence", () => {
    it("identifies co-purchased collections across customer order histories", () => {
      const pairs = analyzeCollectionCoOccurrence(sampleOrders);

      assert.ok(pairs.length > 0);
      assert.equal(pairs[0].collectionIdA, "col_abstract");
      assert.equal(pairs[0].collectionIdB, "col_nordic");
      assert.equal(pairs[0].coOrderCount, 1);
    });
  });

  describe("summarizeRepeatOrderMetrics", () => {
    it("aggregates platform-wide repeat metrics and identifies top collection", () => {
      const summary = summarizeRepeatOrderMetrics(sampleOrders);

      assert.equal(summary.totalUniqueCustomers, 2);
      assert.equal(summary.repeatCustomerCount, 1); // Only Alice repeated
      assert.equal(summary.repeatCustomerRatePercent, 50);
      assert.equal(summary.mostPopularCollection, "Nordic Landscapes"); // $55k total spend
    });

    it("handles empty order set gracefully", () => {
      const summary = summarizeRepeatOrderMetrics([]);
      assert.equal(summary.totalUniqueCustomers, 0);
      assert.equal(summary.repeatCustomerRatePercent, 0);
      assert.equal(summary.mostPopularCollection, "N/A");
    });
  });

  describe("collectionAffinityStore & Convex Schema", () => {
    it("saves and retrieves customer profile from store", () => {
      const profile = calculateCustomerCollectionAffinity("cust_alice", sampleOrders);
      collectionAffinityStore.saveProfile(profile);

      const retrieved = collectionAffinityStore.getProfile("cust_alice");
      assert.ok(retrieved);
      assert.equal(retrieved?.totalOrders, 3);
    });

    it("generates valid Convex schema definition string", () => {
      const schema = generateConvexCollectionAffinitySchema();
      assert.ok(schema.includes("export const customer_collection_affinities = defineTable({"));
      assert.ok(schema.includes(".index(\"by_repeat_rate\", [\"repeatOrderRatePercent\"])"));
    });
  });
});
