import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtistPayoutReconciliation,
  buildExpectationsFromOrders,
  formatCents,
  toCents,
  type ArtistPayoutExpectation,
} from "../src/lib/payout-reconciliation";
import type { OrderRecord } from "../src/lib/orders";
import type { PersistedStripePayoutEvent } from "../src/lib/stripe-payout-persistence";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderId: "ord_1",
    stripeEventId: "evt_1",
    paymentIntentId: "pi_1",
    amountCents: 12000,
    currency: "usd",
    status: "paid",
    fulfillmentPartnerId: "printful",
    shippingRegion: "US",
    artistTransferTotal: 24.6,
    lineItemCount: 1,
    testMode: true,
    recordedAt: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function payoutEvent(
  overrides: Partial<PersistedStripePayoutEvent> = {},
): PersistedStripePayoutEvent {
  return {
    dbId: "doc_1",
    eventId: "evt_payout_1",
    eventType: "transfer.created",
    artistAccountId: "acct_maya",
    artistHandle: "@maya_ceramics",
    amountCents: 2460,
    currency: "USD",
    status: "pending",
    convexSyncedAt: "2026-07-02T10:00:00Z",
    recordedAt: "2026-07-02T10:00:00Z",
    updatedAt: "2026-07-02T10:00:00Z",
    testMode: true,
    ...overrides,
  };
}

const expectation = (
  overrides: Partial<ArtistPayoutExpectation> = {},
): ArtistPayoutExpectation => ({
  artistAccountId: "acct_maya",
  artistHandle: "@maya_ceramics",
  orderId: "ord_1",
  expectedPayoutCents: 2460,
  currency: "USD",
  recordedAt: "2026-07-01T10:00:00Z",
  ...overrides,
});

test("toCents converts dollar amounts without float drift", () => {
  assert.equal(toCents(24.6), 2460);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(1.005), 100); // 1.005 is stored as 1.00499… — documents actual behaviour
  assert.equal(toCents(Number.NaN), 0);
});

test("a settled transfer matching the expected split reconciles clean", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation()],
    payoutEvents: [payoutEvent({ status: "settled", eventType: "payout.paid" })],
    now: "2026-07-05T00:00:00Z",
  });

  assert.equal(report.rows.length, 1);
  const row = report.rows[0]!;
  assert.equal(row.status, "balanced");
  assert.equal(row.varianceCents, 0);
  assert.equal(row.settledPayoutCents, 2460);
  assert.equal(report.totals.underpaidCents, 0);
  assert.equal(report.totals.overpaidCents, 0);
  assert.match(report.summaryLabel, /reconciled/);
});

test("a short transfer is flagged as underpaid with the amount owed", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation({ expectedPayoutCents: 5000 })],
    payoutEvents: [payoutEvent({ status: "settled", amountCents: 3000 })],
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.status, "underpaid");
  assert.equal(row.varianceCents, -2000);
  assert.equal(report.totals.underpaidCents, 2000);
  assert.match(row.actionLabel, /\$20\.00/);
  assert.match(row.actionLabel, /30% split/);
});

test("an excess transfer is flagged as overpaid — margin leak nobody complains about", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation({ expectedPayoutCents: 2000 })],
    payoutEvents: [payoutEvent({ status: "settled", amountCents: 3500 })],
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.status, "overpaid");
  assert.equal(row.varianceCents, 1500);
  assert.equal(report.totals.overpaidCents, 1500);
  assert.match(row.actionLabel, /Recover/i);
});

test("an in-flight transfer counts as covered so settlement lag is not read as underpayment", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation({ expectedPayoutCents: 2460 })],
    payoutEvents: [payoutEvent({ status: "pending", amountCents: 2460 })],
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.status, "balanced");
  assert.equal(row.pendingPayoutCents, 2460);
  assert.equal(row.settledPayoutCents, 0);
  assert.ok(row.exceptions.some((note) => note.includes("in transit")));
});

test("a failed transfer does not cover the expectation — the artist is still owed", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation({ expectedPayoutCents: 2460 })],
    payoutEvents: [payoutEvent({ status: "failed", amountCents: 2460 })],
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.status, "unpaid");
  assert.equal(row.failedPayoutCents, 2460);
  assert.equal(row.varianceCents, -2460);
  assert.equal(report.totals.underpaidCents, 2460);
  assert.ok(row.exceptions.some((note) => note.includes("failed transfers")));
});

test("orders with no transfer at all surface as unpaid", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation()],
    payoutEvents: [],
    now: "2026-07-05T00:00:00Z",
  });

  assert.equal(report.rows[0]!.status, "unpaid");
  assert.equal(report.statusCounts.unpaid, 1);
  assert.match(report.rows[0]!.actionLabel, /no transfer created/);
});

test("a transfer with no matching order is flagged as unattributed", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [],
    payoutEvents: [payoutEvent({ artistAccountId: "acct_ghost", status: "settled" })],
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.status, "unattributed");
  assert.equal(row.expectedPayoutCents, 0);
  assert.equal(row.orderCount, 0);
  assert.match(row.actionLabel, /no matching order/);
});

test("sub-tolerance rounding drift does not raise a discrepancy", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [
      expectation({ orderId: "ord_1", expectedPayoutCents: 1230 }),
      expectation({ orderId: "ord_2", expectedPayoutCents: 1231 }),
    ],
    payoutEvents: [payoutEvent({ status: "settled", amountCents: 2459 })],
    toleranceCents: 2,
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.varianceCents, -2);
  assert.equal(row.status, "balanced");
});

test("multiple artists are ranked by absolute variance, largest problem first", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [
      expectation({ artistAccountId: "acct_small", expectedPayoutCents: 1000 }),
      expectation({ artistAccountId: "acct_big", expectedPayoutCents: 9000 }),
      expectation({ artistAccountId: "acct_clean", expectedPayoutCents: 2000 }),
    ],
    payoutEvents: [
      payoutEvent({ artistAccountId: "acct_small", status: "settled", amountCents: 900 }),
      payoutEvent({ artistAccountId: "acct_big", status: "settled", amountCents: 1000 }),
      payoutEvent({ artistAccountId: "acct_clean", status: "settled", amountCents: 2000 }),
    ],
    now: "2026-07-05T00:00:00Z",
  });

  assert.deepEqual(
    report.rows.map((row) => row.artistAccountId),
    ["acct_big", "acct_small", "acct_clean"],
  );
  assert.equal(report.statusCounts.underpaid, 2);
  assert.equal(report.statusCounts.balanced, 1);
  assert.equal(report.totals.underpaidCents, 8100);
  assert.match(report.summaryLabel, /2\/3 accounts need review/);
});

test("testMode filtering keeps live and test payouts from cross-contaminating", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation({ expectedPayoutCents: 2460 })],
    payoutEvents: [
      payoutEvent({ status: "settled", amountCents: 2460, testMode: false }),
      payoutEvent({ eventId: "evt_2", status: "settled", amountCents: 2460, testMode: true }),
    ],
    testMode: true,
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.transferCount, 1);
  assert.equal(row.status, "balanced");
});

test("non-payout event types are ignored when computing coverage", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation({ expectedPayoutCents: 2460 })],
    payoutEvents: [
      payoutEvent({ eventType: "account.updated", status: "settled", amountCents: 99999 }),
    ],
    now: "2026-07-05T00:00:00Z",
  });

  assert.equal(report.rows[0]!.status, "unpaid");
  assert.equal(report.rows[0]!.settledPayoutCents, 0);
});

test("mixed currencies on one account are flagged rather than silently summed", () => {
  const report = buildArtistPayoutReconciliation({
    expectations: [expectation({ currency: "USD", expectedPayoutCents: 2460 })],
    payoutEvents: [payoutEvent({ status: "settled", currency: "EUR", amountCents: 2460 })],
    now: "2026-07-05T00:00:00Z",
  });

  const row = report.rows[0]!;
  assert.equal(row.currency, "MIXED");
  assert.ok(row.exceptions.some((note) => note.includes("Mixed currencies")));
});

test("buildExpectationsFromOrders converts order metadata into expectations", () => {
  const { expectations, skipped } = buildExpectationsFromOrders(
    [order({ orderId: "ord_a", artistTransferTotal: 24.6 })],
    () => ({ artistAccountId: "acct_maya", artistHandle: "@maya_ceramics" }),
  );

  assert.equal(skipped.length, 0);
  assert.equal(expectations.length, 1);
  assert.equal(expectations[0]!.expectedPayoutCents, 2460);
  assert.equal(expectations[0]!.currency, "USD");
});

test("buildExpectationsFromOrders reports unattributable orders instead of dropping them", () => {
  const { expectations, skipped } = buildExpectationsFromOrders(
    [
      order({ orderId: "ord_cancelled", status: "cancelled" }),
      order({ orderId: "ord_no_total", artistTransferTotal: null }),
      order({ orderId: "ord_no_account" }),
      order({ orderId: "ord_ok" }),
    ],
    (record) => (record.orderId === "ord_no_account" ? null : { artistAccountId: "acct_maya" }),
  );

  assert.equal(expectations.length, 1);
  assert.equal(expectations[0]!.orderId, "ord_ok");
  assert.deepEqual(
    skipped.map((entry) => entry.orderId),
    ["ord_cancelled", "ord_no_total", "ord_no_account"],
  );
  assert.match(skipped[1]!.reason, /30% split/);
});

test("formatCents renders cent-precise currency for operator-facing copy", () => {
  assert.equal(formatCents(2460), "$24.60");
  assert.equal(formatCents(-500), "-$5.00");
  assert.equal(formatCents(0), "$0.00");
});
