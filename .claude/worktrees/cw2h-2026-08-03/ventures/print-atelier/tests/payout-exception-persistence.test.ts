import test from "node:test";
import assert from "node:assert";
import {
  generateConvexPayoutExceptionSchema,
  persistPayoutExceptionDecision,
  queryPersistedPayoutExceptions,
  summarizePersistedPayoutExceptions,
  clearPersistedPayoutExceptionsForTest,
  recordPayoutExceptionOverride,
} from "../src/lib/payout-exception-persistence.ts";

test("generateConvexPayoutExceptionSchema produces valid Convex table definition", () => {
  const schema = generateConvexPayoutExceptionSchema();
  assert.strictEqual(schema.tableName, "payout_exceptions");
  assert.ok(schema.indexes.some((i) => i.name === "by_artworkSlug"));
});

test("persistPayoutExceptionDecision creates record and tracks remediation history", () => {
  clearPersistedPayoutExceptionsForTest();

  const record = persistPayoutExceptionDecision({
    artworkSlug: "golden-gate-mist",
    artistName: "Elena Vance",
    title: "Golden Gate Mist",
    currentRetailPrice: 40,
    currentFulfillmentCost: 28,
    currentArtistPayout: 3.5,
    suggestedRetailPrice: 65,
    severity: "critical",
    blockers: ["Artist payout below $8 floor"],
    initialRemediationNote: "Created automated price review ticket",
  });

  assert.ok(record.exceptionId.startsWith("exc_"));
  assert.strictEqual(record.status, "active_exception");
  assert.strictEqual(record.remediationHistory.length, 1);

  const updated = recordPayoutExceptionOverride("golden-gate-mist", "finance_ops", "Approved special promotional pricing");

  assert.ok(updated);
  assert.strictEqual(updated.status, "overridden");
  assert.strictEqual(updated.remediationHistory.length, 2);

  const summary = summarizePersistedPayoutExceptions();
  assert.strictEqual(summary.totalCount, 1);
  assert.strictEqual(summary.overriddenCount, 1);
});
