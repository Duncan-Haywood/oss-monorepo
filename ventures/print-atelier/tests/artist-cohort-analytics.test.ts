import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeArtistRetentionAndPayoutCohorts,
  extractArtistPayoutEventsFromOrders,
} from "../src/lib/artist-cohort-analytics";
import type { OrderRecord } from "../src/lib/orders";

describe("Artist Retention and Payout Repeat Cohort Analyzer", () => {
  it("returns insufficient_data for empty order sets", () => {
    const report = analyzeArtistRetentionAndPayoutCohorts({ orders: [] });

    assert.equal(report.totalUniqueArtists, 0);
    assert.equal(report.totalOrdersAnalyzed, 0);
    assert.equal(report.totalPayoutCentsDistributed, 0);
    assert.equal(report.repeatPayoutArtistPercent, 0);
    assert.equal(report.healthStatus, "insufficient_data");
    assert.match(report.summaryLabel, /0 artist payout cohorts analyzed/);
  });

  it("filters out cancelled orders and orders without artist accounts", () => {
    const orders: OrderRecord[] = [
      {
        orderId: "ord_1",
        stripeEventId: "evt_1",
        paymentIntentId: "pi_1",
        amountCents: 10000,
        currency: "usd",
        status: "cancelled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: "acct_artist_1",
        artistHandle: "@artist1",
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-01-10T10:00:00Z",
      },
      {
        orderId: "ord_2",
        stripeEventId: "evt_2",
        paymentIntentId: "pi_2",
        amountCents: 10000,
        currency: "usd",
        status: "fulfilled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: null,
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-01-15T10:00:00Z",
      },
      {
        orderId: "ord_3",
        stripeEventId: "evt_3",
        paymentIntentId: "pi_3",
        amountCents: 10000,
        currency: "usd",
        status: "fulfilled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: "acct_artist_1",
        artistHandle: "@artist1",
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-01-20T10:00:00Z",
      },
    ];

    const events = extractArtistPayoutEventsFromOrders(orders);
    assert.equal(events.length, 1);
    assert.equal(events[0].orderId, "ord_3");
    assert.equal(events[0].artistAccountId, "acct_artist_1");
    assert.equal(events[0].payoutCents, 3000);
  });

  it("correctly groups artists into monthly cohorts and calculates repeat retention rates", () => {
    const orders: OrderRecord[] = [
      // Artist 1 first order in Jan 2026, repeat in Feb 2026 (M1)
      {
        orderId: "ord_101",
        stripeEventId: "evt_101",
        paymentIntentId: "pi_101",
        amountCents: 10000,
        currency: "usd",
        status: "fulfilled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: "acct_1",
        artistHandle: "@artist1",
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-01-05T12:00:00Z",
      },
      {
        orderId: "ord_102",
        stripeEventId: "evt_102",
        paymentIntentId: "pi_102",
        amountCents: 10000,
        currency: "usd",
        status: "fulfilled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: "acct_1",
        artistHandle: "@artist1",
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-02-14T12:00:00Z",
      },
      // Artist 2 first order in Jan 2026, no repeat
      {
        orderId: "ord_103",
        stripeEventId: "evt_103",
        paymentIntentId: "pi_103",
        amountCents: 10000,
        currency: "usd",
        status: "fulfilled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: "acct_2",
        artistHandle: "@artist2",
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-01-20T12:00:00Z",
      },
      // Artist 3 first order in Jan 2026, repeat in Mar 2026 (M2)
      {
        orderId: "ord_104",
        stripeEventId: "evt_104",
        paymentIntentId: "pi_104",
        amountCents: 10000,
        currency: "usd",
        status: "fulfilled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: "acct_3",
        artistHandle: "@artist3",
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-01-25T12:00:00Z",
      },
      {
        orderId: "ord_105",
        stripeEventId: "evt_105",
        paymentIntentId: "pi_105",
        amountCents: 10000,
        currency: "usd",
        status: "fulfilled",
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: 30,
        artistAccountId: "acct_3",
        artistHandle: "@artist3",
        lineItemCount: 1,
        testMode: true,
        recordedAt: "2026-03-01T12:00:00Z",
      },
    ];

    const report = analyzeArtistRetentionAndPayoutCohorts({ orders });

    assert.equal(report.totalUniqueArtists, 3);
    assert.equal(report.totalOrdersAnalyzed, 5);
    assert.equal(report.totalPayoutCentsDistributed, 15000); // 5 * 3000
    assert.equal(report.repeatPayoutArtistCount, 2); // acct_1 and acct_3
    assert.equal(report.repeatPayoutArtistPercent, 66.7);
    assert.equal(report.healthStatus, "healthy");

    assert.equal(report.cohortSummaries.length, 1);
    const janCohort = report.cohortSummaries[0];
    assert.equal(janCohort.cohortMonth, "2026-01");
    assert.equal(janCohort.initialArtistCount, 3);
    assert.equal(janCohort.initialPayoutCents, 9000); // 3 * 3000 in Jan

    // Period 0 (M0): 3 artists retained (100%)
    assert.equal(janCohort.periods[0].retainedArtists, 3);
    assert.equal(janCohort.periods[0].retentionRatePercent, 100);

    // Period 1 (M1 - Feb): acct_1 retained (1 / 3 = 33.3%)
    assert.equal(janCohort.periods[1].retainedArtists, 1);
    assert.equal(janCohort.periods[1].retentionRatePercent, 33.3);
    assert.equal(janCohort.periods[1].payoutCents, 3000);

    // Period 2 (M2 - Mar): acct_3 retained (1 / 3 = 33.3%)
    assert.equal(janCohort.periods[2].retainedArtists, 1);
    assert.equal(janCohort.periods[2].retentionRatePercent, 33.3);
    assert.equal(janCohort.periods[2].payoutCents, 3000);

    assert.equal(report.overallM1RetentionRatePercent, 33.3);
  });
});
