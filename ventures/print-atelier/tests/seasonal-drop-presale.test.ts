import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateVipPresaleAccess,
  summarizeSeasonalDrops,
  generateConvexSeasonalDropSchema,
  seasonalDropStore,
  SeasonalDropPayload,
} from "../src/lib/seasonal-drop-presale.js";

describe("seasonal-drop-presale", () => {
  beforeEach(() => {
    seasonalDropStore.clear();
  });

  const now = 1770000000000;
  const sampleDrop: SeasonalDropPayload = {
    dropId: "drop_autumn_solstice_2026",
    campaignName: "Autumn Solstice Fine Art Collection",
    totalReservedEditions: 50,
    claimedEditionsCount: 10,
    presaleStartTimestamp: now - 3600 * 1000 * 12, // Presale started 12h ago
    publicStartTimestamp: now + 3600 * 1000 * 12, // Public starts in 12h
    status: "presale_active",
  };

  describe("evaluateVipPresaleAccess", () => {
    it("grants presale access and discount to Patron VIP within 24h presale window", () => {
      const result = evaluateVipPresaleAccess(sampleDrop, "patron_vip", now);

      assert.equal(result.dropId, "drop_autumn_solstice_2026");
      assert.equal(result.isAccessGranted, true);
      assert.equal(result.vipTier, "patron_vip");
      assert.equal(result.priceDiscountPercent, 15);
      assert.equal(result.remainingReservedEditions, 40);
      assert.equal(result.status, "presale_active");
      assert.ok(result.notes.some((n) => n.includes("Exclusive presale access granted")));
    });

    it("grants presale access to SMS Subscriber within 2h presale window", () => {
      const smsDrop: SeasonalDropPayload = {
        ...sampleDrop,
        publicStartTimestamp: now + 3600 * 1000 * 1, // Public starts in 1h (within 2h SMS window)
      };

      const result = evaluateVipPresaleAccess(smsDrop, "sms_subscriber", now);

      assert.equal(result.isAccessGranted, true);
      assert.equal(result.priceDiscountPercent, 5);
      assert.equal(result.earlyAccessWindowHours, 2);
    });

    it("denies access if SMS Subscriber tries to access before 2h window opens", () => {
      const result = evaluateVipPresaleAccess(sampleDrop, "sms_subscriber", now); // Public is 12h away (outside 2h SMS window)

      assert.equal(result.isAccessGranted, false);
      assert.ok(result.notes.some((n) => n.includes("opens in")));
    });

    it("denies access to guest user without VIP status during presale", () => {
      const result = evaluateVipPresaleAccess(sampleDrop, undefined, now);

      assert.equal(result.isAccessGranted, false);
      assert.ok(result.notes.some((n) => n.includes("requires SMS subscription or VIP status")));
    });

    it("grants public access to all users once public timestamp passes", () => {
      const publicNow = sampleDrop.publicStartTimestamp + 1000;
      const result = evaluateVipPresaleAccess(sampleDrop, undefined, publicNow);

      assert.equal(result.isAccessGranted, true);
      assert.equal(result.status, "public_active");
    });

    it("denies access if drop is completely sold out", () => {
      const soldOutDrop: SeasonalDropPayload = {
        ...sampleDrop,
        claimedEditionsCount: 50,
      };

      const result = evaluateVipPresaleAccess(soldOutDrop, "patron_vip", now);

      assert.equal(result.isAccessGranted, false);
      assert.equal(result.status, "sold_out");
      assert.ok(result.notes.some((n) => n.includes("completely sold out")));
    });
  });

  describe("summarizeSeasonalDrops", () => {
    it("aggregates total reserved/claimed editions, sellout percentage, and active drop counts", () => {
      const d1 = sampleDrop;
      const d2: SeasonalDropPayload = {
        dropId: "drop_winter_glow_2026",
        campaignName: "Winter Glow Collection",
        totalReservedEditions: 100,
        claimedEditionsCount: 100,
        presaleStartTimestamp: now - 86400000,
        publicStartTimestamp: now - 43200000,
        status: "sold_out",
      };

      const summary = summarizeSeasonalDrops([d1, d2]);

      assert.equal(summary.totalDrops, 2);
      assert.equal(summary.totalReservedEditions, 150);
      assert.equal(summary.totalClaimedEditions, 110);
      assert.equal(summary.overallSelloutRatePercent, 73.33);
      assert.equal(summary.activePresaleCount, 1);
    });

    it("handles empty drop list gracefully", () => {
      const summary = summarizeSeasonalDrops([]);
      assert.equal(summary.totalDrops, 0);
      assert.equal(summary.totalReservedEditions, 0);
    });
  });

  describe("seasonalDropStore & Convex schema", () => {
    it("registers and retrieves drop from in-memory store", () => {
      seasonalDropStore.registerDrop(sampleDrop);
      const retrieved = seasonalDropStore.getDrop("drop_autumn_solstice_2026");

      assert.ok(retrieved);
      assert.equal(retrieved?.campaignName, "Autumn Solstice Fine Art Collection");
    });

    it("generates valid Convex schema definition for seasonal_drops", () => {
      const schema = generateConvexSeasonalDropSchema();
      assert.ok(schema.includes("export const seasonal_drops = defineTable({"));
      assert.ok(schema.includes(".index(\"by_status\", [\"status\"])"));
    });
  });
});
