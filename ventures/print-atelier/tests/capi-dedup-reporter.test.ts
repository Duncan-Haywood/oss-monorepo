import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMatchQualityScore,
  processCapiEventsAndReport,
  generateConvexCapiDedupSchema,
  persistCapiDedupReport,
  getCapiDedupReports,
  clearCapiDedupStoreForTesting,
  type CapiEventPayload,
} from "../src/lib/capi-dedup-reporter";

describe("capi-dedup-reporter", () => {
  beforeEach(() => {
    clearCapiDedupStoreForTesting();
  });

  it("calculates match quality score accurately based on user data fields", () => {
    const scoreFull = calculateMatchQualityScore({
      email: "artist@example.com",
      phone: "+15551234567",
      externalId: "artist_123",
      fbp: "fb.1.123456.789",
      fbc: "fb.1.123456.789.clk123",
      clientIp: "192.168.1.1",
      clientUserAgent: "Mozilla/5.0",
    });
    assert.equal(scoreFull, 100);

    const scorePartial = calculateMatchQualityScore({
      email: "buyer@example.com",
      fbp: "fb.1.123456.789",
    });
    assert.equal(scorePartial, 40);
  });

  it("handles empty event list cleanly", () => {
    const report = processCapiEventsAndReport([]);
    assert.equal(report.totalEventsProcessed, 0);
    assert.equal(report.matchQualityRating, "NEEDS_IMPROVEMENT");
    assert.ok(report.missingParameterRecommendations.length > 0);
  });

  it("processes paired browser/server CAPI events and computes deduplication rate", () => {
    const events: CapiEventPayload[] = [
      {
        eventId: "evt_1001",
        eventName: "InitiateCheckout",
        eventTime: 1700000000,
        source: "browser",
        userData: {
          email: "artist@example.com",
          fbp: "fb.1.123456.789",
          clientUserAgent: "Mozilla/5.0",
        },
      },
      {
        eventId: "evt_1001",
        eventName: "InitiateCheckout",
        eventTime: 1700000000,
        source: "server",
        userData: {
          email: "artist@example.com",
          phone: "+15551234567",
          externalId: "artist_123",
          fbp: "fb.1.123456.789",
          clientIp: "192.168.1.1",
          clientUserAgent: "Mozilla/5.0",
        },
      },
    ];

    const report = processCapiEventsAndReport(events);
    assert.equal(report.totalEventsProcessed, 2);
    assert.equal(report.browserEventsCount, 1);
    assert.equal(report.serverEventsCount, 1);
    assert.equal(report.deduplicatedEventsCount, 1);
    assert.equal(report.deduplicationRatePct, 50.0);
    assert.ok(report.averageMatchQualityScore > 60);
  });

  it("generates recommendations when user data parameters are missing", () => {
    const events: CapiEventPayload[] = [
      {
        eventId: "evt_2001",
        eventName: "ViewContent",
        eventTime: 1700000000,
        source: "browser",
        userData: {
          clientUserAgent: "Mozilla/5.0",
        },
      },
    ];

    const report = processCapiEventsAndReport(events);
    assert.ok(
      report.missingParameterRecommendations.some((r) => r.includes("email") || r.includes("_fbp")),
    );
  });

  it("generates valid Convex schema definition for CAPI deduplication reporting", () => {
    const schema = generateConvexCapiDedupSchema();
    assert.equal(schema.tableName, "capi_dedup_reports");
    assert.ok(schema.indexes.includes("by_reportId"));
    assert.ok(schema.schemaCode.includes("defineTable"));
  });

  it("persists deduplication reports to store and retrieves them", () => {
    const report = processCapiEventsAndReport([
      {
        eventId: "evt_3001",
        eventName: "Purchase",
        eventTime: 1700000000,
        source: "server",
        userData: {
          email: "buyer@example.com",
          phone: "+15550001111",
          externalId: "cust_999",
        },
      },
    ]);

    const record = persistCapiDedupReport(report);
    assert.equal(record.reportId, report.reportId);
    assert.equal(record.totalEventsProcessed, 1);

    const history = getCapiDedupReports();
    assert.equal(history.length, 1);
    assert.equal(history[0].reportId, report.reportId);
  });
});
