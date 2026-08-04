import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAudienceSegment,
  getSegmentBidMultiplier,
  buildRetargetingAudiencePayload,
  summarizeRetargetingSegments,
  generateConvexRetargetingSegmentsSchema,
  retargetingSegmentsStore,
  UserSessionEvent,
} from "../src/lib/retargeting-segments.js";

describe("retargeting-segments", () => {
  beforeEach(() => {
    retargetingSegmentsStore.clear();
  });

  const sampleUsers: UserSessionEvent[] = [
    {
      userId: "u1",
      email: "alice@example.com",
      viewCount: 5,
      cartValueCents: 15000,
      checkoutAbandoned: true,
      daysSinceLastActivity: 1,
      purchaseHistoryCount: 0,
    },
    {
      userId: "u2",
      email: "bob@example.com",
      viewCount: 12,
      cartValueCents: 0,
      checkoutAbandoned: false,
      daysSinceLastActivity: 2,
      purchaseHistoryCount: 4,
    },
    {
      userId: "u3",
      email: "charlie@example.com",
      viewCount: 2,
      cartValueCents: 0,
      checkoutAbandoned: false,
      daysSinceLastActivity: 45,
      purchaseHistoryCount: 1,
    },
    {
      userId: "u4",
      email: "optout@example.com",
      viewCount: 10,
      cartValueCents: 20000,
      checkoutAbandoned: true,
      daysSinceLastActivity: 1,
      purchaseHistoryCount: 0,
      gdprOptOut: true,
    },
  ];

  describe("classifyAudienceSegment & getSegmentBidMultiplier", () => {
    it("classifies cart abandoners into high_intent_abandoners with +50% bid lift", () => {
      const segment = classifyAudienceSegment(sampleUsers[0]);
      assert.equal(segment, "high_intent_abandoners");
      assert.equal(getSegmentBidMultiplier(segment), 1.5);
    });

    it("classifies repeat buyers into vip_repeat_collectors with +30% bid lift", () => {
      const segment = classifyAudienceSegment(sampleUsers[1]);
      assert.equal(segment, "vip_repeat_collectors");
      assert.equal(getSegmentBidMultiplier(segment), 1.3);
    });

    it("classifies inactive buyers into dormant_buyers with lower bid multiplier", () => {
      const segment = classifyAudienceSegment(sampleUsers[2]);
      assert.equal(segment, "dormant_buyers");
      assert.equal(getSegmentBidMultiplier(segment), 0.8);
    });
  });

  describe("buildRetargetingAudiencePayload", () => {
    it("builds platform payload for eligible users and respects GDPR opt-outs", () => {
      const payload = buildRetargetingAudiencePayload(
        sampleUsers,
        "meta",
        "high_intent_abandoners"
      );

      assert.equal(payload.platform, "meta");
      assert.equal(payload.segmentType, "high_intent_abandoners");
      assert.equal(payload.matchedCount, 1); // Only Alice (optout@example.com is excluded)
      assert.equal(payload.hashedUserIds.length, 1);
      assert.ok(payload.hashedUserIds[0].includes("aliceexamplecom"));
    });

    it("generates correct audience naming convention", () => {
      const payload = buildRetargetingAudiencePayload(
        sampleUsers,
        "google",
        "vip_repeat_collectors"
      );
      assert.equal(payload.audienceName, "print_atelier_google_vip_repeat_collectors");
    });
  });

  describe("summarizeRetargetingSegments", () => {
    it("aggregates total audience size, platform distribution, and GDPR exclusions", () => {
      const p1 = buildRetargetingAudiencePayload(sampleUsers, "meta", "high_intent_abandoners");
      const p2 = buildRetargetingAudiencePayload(sampleUsers, "google", "vip_repeat_collectors");

      const summary = summarizeRetargetingSegments([p1, p2]);

      assert.equal(summary.totalAudienceSize, 2);
      assert.equal(summary.platformDistribution.meta, 1);
      assert.equal(summary.platformDistribution.google, 1);
      assert.equal(summary.segmentBreakdown.high_intent_abandoners, 1);
      assert.equal(summary.segmentBreakdown.vip_repeat_collectors, 1);
    });
  });

  describe("store & Convex schema", () => {
    it("records and retrieves payload in store", () => {
      const payload = buildRetargetingAudiencePayload(sampleUsers, "pinterest", "dormant_buyers");
      retargetingSegmentsStore.recordPayload(payload);

      assert.equal(retargetingSegmentsStore.getPayloads().length, 1);
      assert.equal(retargetingSegmentsStore.getPayloads()[0].platform, "pinterest");
    });

    it("generates valid Convex schema definition for retargeting_segments", () => {
      const schema = generateConvexRetargetingSegmentsSchema();
      assert.ok(schema.includes("export const retargeting_segments = defineTable({"));
      assert.ok(schema.includes(".index(\"by_platform\", [\"platform\"])"));
    });
  });
});
