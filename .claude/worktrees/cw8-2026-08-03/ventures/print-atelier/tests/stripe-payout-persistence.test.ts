import test from "node:test";
import assert from "node:assert";
import {
  generateConvexStripePayoutLedgerSchema,
  persistStripePayoutLedgerEntry,
  queryPersistedStripePayoutLedger,
  summarizePersistedStripePayoutLedger,
  clearPersistedStripePayoutLedgerForTest,
  syncStripeWebhookLedgerToPersistence,
} from "../src/lib/stripe-payout-persistence.ts";
import { recordStripeWebhookToLedger, clearStripeLedgerForTests } from "../src/lib/stripe-ledger.ts";

test("generateConvexStripePayoutLedgerSchema produces valid table and index definitions", () => {
  const schema = generateConvexStripePayoutLedgerSchema();
  assert.strictEqual(schema.tableName, "stripe_payout_ledger");
  assert.ok(schema.indexes.length >= 4);
  assert.ok(schema.schemaCode.includes("defineTable"));
});

test("persistStripePayoutLedgerEntry stores and updates payout entries", () => {
  clearPersistedStripePayoutLedgerForTest();

  const entry = persistStripePayoutLedgerEntry({
    ledgerId: "led_test_1",
    eventId: "evt_123",
    eventType: "transfer.created",
    recordedAt: new Date().toISOString(),
    action: "Queue payout notification",
    amountCents: 4500,
    artistAccountId: "acct_artist_123",
    testMode: true,
    fulfillmentQueued: false,
  });

  assert.ok(entry.dbId.startsWith("doc_po_") || entry.dbId.startsWith("doc_ledger_"));
  assert.strictEqual(entry.amountCents, 4500);

  const results = queryPersistedStripePayoutLedger({ artistAccountId: "acct_artist_123" });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].eventId, "evt_123");
});

test("syncStripeWebhookLedgerToPersistence syncs memory ledger to persistence", () => {
  clearStripeLedgerForTests();
  clearPersistedStripePayoutLedgerForTest();

  recordStripeWebhookToLedger("evt_999", "payout.paid", {
    handled: true,
    eventType: "payout.paid",
    action: "Mark artist payout as available",
    amountCents: 12000,
    artistAccountId: "acct_artist_456",
    testMode: true,
  });

  const synced = syncStripeWebhookLedgerToPersistence();
  assert.strictEqual(synced.length, 1);
  assert.strictEqual(synced[0].eventType, "payout.paid");

  const summary = summarizePersistedStripePayoutLedger();
  assert.strictEqual(summary.persistedCount, 1);
  assert.strictEqual(summary.payoutCount, 1);
});
