import assert from "node:assert/strict";
import { test } from "node:test";

import { processStripeConnectWebhookEvent } from "../src/lib/stripe-connect.ts";
import {
  buildStripePayoutLedgerSummary,
  clearStripeLedgerForTests,
  getStripeLedgerEntries,
  recordStripeWebhookToLedger,
} from "../src/lib/stripe-ledger.ts";

test("recordStripeWebhookToLedger appends handled events", () => {
  clearStripeLedgerForTests();

  const result = processStripeConnectWebhookEvent({
    id: "evt_ledger_1",
    type: "transfer.created",
    created: 1710000000,
    livemode: false,
    data: { object: { amount: 2500, destination: "acct_artist_2" } },
  });

  const entry = recordStripeWebhookToLedger("evt_ledger_1", "transfer.created", result);

  assert.ok(entry);
  assert.equal(entry?.amountCents, 2500);
  assert.equal(entry?.artistAccountId, "acct_artist_2");
  assert.equal(getStripeLedgerEntries().length, 1);
});

test("buildStripePayoutLedgerSummary totals transfers and payments", () => {
  clearStripeLedgerForTests();

  recordStripeWebhookToLedger(
    "evt_pay_1",
    "payment_intent.succeeded",
    processStripeConnectWebhookEvent({
      id: "evt_pay_1",
      type: "payment_intent.succeeded",
      created: 1710000001,
      livemode: false,
      data: { object: { amount: 8500 } },
    }),
  );

  recordStripeWebhookToLedger(
    "evt_xfer_1",
    "transfer.created",
    processStripeConnectWebhookEvent({
      id: "evt_xfer_1",
      type: "transfer.created",
      created: 1710000002,
      livemode: false,
      data: { object: { amount: 1200, destination: "acct_a" } },
    }),
  );

  const summary = buildStripePayoutLedgerSummary();

  assert.equal(summary.totalEntries, 2);
  assert.equal(summary.paymentCount, 1);
  assert.equal(summary.transferCount, 1);
  assert.equal(summary.totalPaymentCents, 8500);
  assert.equal(summary.totalTransferCents, 1200);
  assert.ok(summary.lastRecordedAt);
});
