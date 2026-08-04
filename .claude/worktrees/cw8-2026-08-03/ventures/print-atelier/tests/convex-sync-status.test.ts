import test from "node:test";
import assert from "node:assert";
import { checkConvexDatabaseSyncStatus } from "../src/lib/convex-sync-status.ts";

test("checkConvexDatabaseSyncStatus returns table sync summary for all persistence modules", () => {
  const status = checkConvexDatabaseSyncStatus();
  assert.strictEqual(status.activeTablesCount, 6);
  assert.ok(status.tables.some((t) => t.tableName === "orders"));
  assert.ok(status.tables.some((t) => t.tableName === "stripe_payout_ledger"));
  assert.ok(status.tables.some((t) => t.tableName === "payout_exceptions"));
  assert.ok(status.tables.some((t) => t.tableName === "listing_releases"));
  assert.ok(status.tables.some((t) => t.tableName === "artist_consent_ledger"));
});
